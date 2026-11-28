"""Encrypted durable outbox with atomic claims, bounded retry and honest states."""

import asyncio
import logging
import os
import re
import smtplib
import base64
import hashlib
import json
import uuid
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

from cryptography.fernet import Fernet
from fastapi import HTTPException
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from lib import db as database

logger = logging.getLogger(__name__)

_INVITE_URL = re.compile(r'https?://[^\s"\'<>]+?(?:invite|invitation|reset-password|verify)[^\s"\'<>]*', re.I)
_SECRET_PARAM = re.compile(r'\b(invite[_-]?token|reset[_-]?token|token|code)(["\']?\s*[=:]\s*["\']?)([A-Za-z0-9._~+/=-]{8,})', re.I)


def redact_for_outbox(html: str) -> str:
    """Keep the human-readable message but strip live credentials from stored mail.

    Delivery uses the original HTML; only the outbox copy is redacted."""
    out = _INVITE_URL.sub("[REDACTED INVITE LINK]", html or "")
    out = _SECRET_PARAM.sub(lambda m: f"{m.group(1)}{m.group(2)}[REDACTED]", out)
    return out


def _smtp_send(host: str, port: int, user: str, password: str, sender: str, to: str,
               subject: str, html: str, reply_to: str | None) -> None:
    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = to
    msg["Subject"] = subject
    if reply_to:
        msg["Reply-To"] = reply_to
    msg.set_content("Please view this email in an HTML-capable client.")
    msg.add_alternative(html, subtype="html")
    with smtplib.SMTP(host, port, timeout=15) as smtp:
        if user:
            smtp.starttls()
            smtp.login(user, password)
        smtp.send_message(msg)


def _cipher() -> Fernet:
    dedicated = os.environ.get("MAILER_ENCRYPTION_KEY")
    if dedicated:
        return Fernet(dedicated.encode())
    secret = (os.environ.get("SESSION_SECRET") or os.environ.get("UPLOAD_SIGNING_SECRET")
              or os.environ.get("JWT_SECRET"))
    if not secret:
        from lib.auth import _upload_signing_secret
        secret = _upload_signing_secret().hex()
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(("tnl-mail-v1:" + secret).encode()).digest()))


def public_delivery(record: dict) -> dict:
    return {key: value for key, value in record.items() if key not in ("_id", "payload", "claim", "lease_until")}


async def send_email(to: str, subject: str, html: str, reply_to: str | None = None, *,
                     notification_id: str | None = None, registration_id: str | None = None,
                     message_id: str | None = None, expires_at: datetime | None = None,
                     expected_status: str | None = None, replace_cancelled: bool = False) -> dict:
    now = datetime.now(timezone.utc)
    if (not to or len(to) > 254 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", to.strip())
            or not subject.strip() or len(subject) > 500 or "\n" in subject or "\r" in subject
            or not html.strip() or len(html) > 200_000):
        raise HTTPException(422, "A valid email recipient and subject are required.")
    payload = {"to": to.strip(), "subject": subject, "html": html, "reply_to": reply_to}
    record = {
        "id": notification_id or str(uuid.uuid4()), "to": to.strip(), "subject": redact_for_outbox(subject),
        "html": redact_for_outbox(html), "created_at": now, "status": "queued", "attempts": 0,
        "next_attempt_at": now, "expires_at": expires_at or now + timedelta(days=7),
        "payload": _cipher().encrypt(json.dumps(payload).encode()).decode(),
    }
    if registration_id:
        record["registration_id"] = registration_id
    if expected_status:
        record["expected_status"] = expected_status
    if message_id:
        record["message_id"] = message_id
    try:
        await database.db.outbox.insert_one(record)
    except DuplicateKeyError:
        replacement = None
        if replace_cancelled:
            replacement = await database.db.outbox.find_one_and_update(
                {"id": record["id"], "status": "cancelled"},
                {"$set": {key: value for key, value in record.items() if key != "_id"},
                 "$unset": {"claim": "", "lease_until": "", "error_code": "", "delivered_at": ""}},
                return_document=ReturnDocument.AFTER,
            )
        record = replacement or await database.db.outbox.find_one({"id": record["id"]})
    return public_delivery(record)


async def retry_email(notification_id: str) -> dict:
    now = datetime.now(timezone.utc)
    result = await database.db.outbox.find_one_and_update({
        "id": notification_id, "status": {"$in": ["failed", "queued"]}, "payload": {"$exists": True},
        "expires_at": {"$gt": now},
    }, {"$set": {"status": "queued", "next_attempt_at": now, "attempts": 0},
        "$unset": {"error_code": "", "claim": "", "lease_until": ""}}, return_document=ReturnDocument.AFTER)
    if not result:
        raise HTTPException(409, "Notification is delivered, expired, erased, in progress, or has no retry payload.")
    return {"ok": True, "id": notification_id, "status": "queued"}


async def deliver_pending(limit: int = 25, *, notification_id: str | None = None) -> dict:
    db = database.db
    counts = {"delivered": 0, "failed": 0}
    for _ in range(limit):
        now = datetime.now(timezone.utc)
        claim = uuid.uuid4().hex
        query = {"payload": {"$exists": True}, "$or": [
            {"status": {"$in": ["queued", "failed"]}, "next_attempt_at": {"$lte": now},
             "attempts": {"$lt": int(os.environ.get("MAIL_MAX_ATTEMPTS", "8"))}},
            {"status": "delivering", "lease_until": {"$lt": now}},
        ]}
        if notification_id:
            query["id"] = notification_id
        record = await db.outbox.find_one_and_update(query, {"$set": {"status": "delivering", "claim": claim, "lease_until": now + timedelta(seconds=120)},
             "$inc": {"attempts": 1}}, sort=[("created_at", 1)], return_document=ReturnDocument.AFTER)
        if not record:
            break
        fence = {"id": record["id"], "claim": claim, "status": "delivering"}
        try:
            expires = record["expires_at"]
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            if expires <= now:
                await db.outbox.update_one(fence, {"$set": {"status": "expired", "error_code": "expired"},
                                                   "$unset": {"payload": "", "claim": "", "lease_until": ""}})
                continue
            if record.get("registration_id"):
                row = await db.registrations.find_one({"id": record["registration_id"],
                                                       "anonymized": {"$ne": True}, "privacy_pending": {"$ne": True}})
                if not row:
                    from lib.privacy import erase_notifications
                    await erase_notifications(registration_id=record["registration_id"])
                    continue
                if record.get("expected_status") and row.get("status") != record["expected_status"]:
                    await db.outbox.update_one(fence, {"$set": {"status": "cancelled", "error_code": "registration_changed"},
                                                       "$unset": {"payload": "", "claim": "", "lease_until": ""}})
                    continue
            if record.get("message_id") and not await db.messages.find_one({"id": record["message_id"]}):
                from lib.privacy import erase_notifications
                await erase_notifications(message_id=record["message_id"])
                continue
            host = os.environ.get("SMTP_HOST", "")
            if not host:
                raise RuntimeError("smtp_not_configured")
            payload = json.loads(_cipher().decrypt(record["payload"].encode()))
            await asyncio.to_thread(_smtp_send, host, int(os.environ.get("SMTP_PORT", "587")),
                                    os.environ.get("SMTP_USER", ""), os.environ.get("SMTP_PASS", ""),
                                    os.environ.get("SMTP_FROM", "TNL Studio <noreply@localhost>"),
                                    payload["to"], payload["subject"], payload["html"], payload["reply_to"])
            result = await db.outbox.update_one(fence, {"$set": {"status": "delivered", "delivered_at": datetime.now(timezone.utc)},
                                                       "$unset": {"payload": "", "claim": "", "lease_until": "", "error_code": ""}})
            if result.modified_count:
                counts["delivered"] += 1
                if record.get("message_id"):
                    await db.messages.update_one({"id": record["message_id"], "reply_notification_id": record["id"]},
                        {"$set": {"reply_delivery": "delivered", "replied_at": datetime.now(timezone.utc)}})
                    await db.messages.update_one({"id": record["message_id"], "reply_notification_id": record["id"],
                                                   "status": {"$ne": "archived"}}, {"$set": {"status": "replied"}})
        except Exception as exc:
            error = "smtp_not_configured" if not os.environ.get("SMTP_HOST") else type(exc).__name__
            logger.warning("Mail delivery failed (%s)", error)
            delay = min(3600, 30 * 2 ** min(record["attempts"], 7))
            result = await db.outbox.update_one(fence, {"$set": {"status": "failed", "error_code": error,
                "next_attempt_at": datetime.now(timezone.utc) + timedelta(seconds=delay)},
                "$unset": {"claim": "", "lease_until": ""}})
            if result.modified_count:
                counts["failed"] += 1
                if record.get("message_id"):
                    await db.messages.update_one({"id": record["message_id"], "reply_notification_id": record["id"]},
                                                 {"$set": {"reply_delivery": "failed"}})
    return counts


async def reconcile_reply_delivery() -> None:
    """Recover a crash between outbox completion and the inbox projection update."""
    db = database.db
    async for message in db.messages.find({"reply_notification_id": {"$exists": True}}):
        job = await db.outbox.find_one({"id": message["reply_notification_id"]})
        if not job:
            continue
        patch = {"reply_delivery": job["status"]}
        if job["status"] == "delivered":
            patch["replied_at"] = job["delivered_at"]
        await db.messages.update_one({"_id": message["_id"], "reply_notification_id": job["id"]}, {"$set": patch})
        if job["status"] == "delivered":
            await db.messages.update_one({"_id": message["_id"], "reply_notification_id": job["id"],
                                          "status": {"$ne": "archived"}}, {"$set": {"status": "replied"}})
