"""Durable erasure jobs preserve file references until deletion is confirmed."""

import os
import posixpath
import re
import hashlib
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import unquote, urlsplit

from pymongo.errors import DuplicateKeyError

from lib import db as database, storage


def private_upload_key(value: str) -> str | None:
    if not isinstance(value, str) or not value or "\\" in value or "\x00" in value:
        return None
    try:
        path = unquote(urlsplit(value).path)
    except ValueError:
        return None
    if "\\" in path or "\x00" in path:
        return None
    marker = "/api/media-files/"
    if marker in path:
        path = path.split(marker, 1)[1]
    key = path.lstrip("/")
    if (not key.startswith("uploads/") or posixpath.normpath(key) != key
            or any(part in ("", ".", "..") for part in key.split("/"))):
        return None
    return key


def upload_keys(row: dict) -> list[str]:
    keys = set()
    for value in (row.get("data") or {}).values():
        if isinstance(value, dict):
            for field in ("url", "absolute_url"):
                key = private_upload_key(value.get(field, ""))
                if key:
                    keys.add(key)
    return sorted(keys)


def delete_private_upload(key: str) -> None:
    if private_upload_key(key) != key:
        raise ValueError("Invalid private upload key")
    # Registration attachments are written locally by the registration engine,
    # independently of the public-media S3 adapter.
    root = Path(os.environ.get("MEDIA_DIR") or storage.MEDIA_DIR).resolve()
    path = (root / key).resolve()
    if root not in path.parents:
        raise ValueError("Private upload escapes media directory")
    try:
        path.unlink()
    except FileNotFoundError:
        pass


async def registration_data_is_servable(row: dict) -> bool:
    if row.get("privacy_pending") or row.get("anonymized"):
        return False
    created = row.get("created_at")
    if not isinstance(created, datetime):
        return True
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    from lib.settings import get_settings
    settings = await get_settings()
    cutoff = datetime.now(timezone.utc) - timedelta(days=max(1, int(settings.get("retention_days") or 90)))
    return created >= cutoff


async def upload_is_servable(key: str) -> bool:
    if private_upload_key(key) != key:
        return False
    db = database.db
    if await db.privacy_jobs.find_one({"$or": [{"keys": key}, {"key_hashes": hashlib.sha256(key.encode()).hexdigest()}]}):
        return False
    from lib.settings import get_settings
    settings = await get_settings()
    cutoff = datetime.now(timezone.utc) - timedelta(days=max(1, int(settings.get("retention_days") or 90)))
    # Legacy documents have no attachment index; inspect their upload references
    # without exposing them. The durable tombstone remains after row deletion.
    found = False
    async for row in db.registrations.find({}):
        if key not in upload_keys(row):
            continue
        found = True
        created = row.get("created_at")
        if isinstance(created, datetime) and created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if row.get("privacy_pending") or row.get("anonymized") or (created and created < cutoff):
            return False
    return found


async def erase_notifications(registration_id: str | None = None, email: str | None = None,
                              message_id: str | None = None) -> None:
    db = database.db
    clauses = []
    if registration_id:
        clauses.append({"registration_id": registration_id})
    if message_id:
        clauses.append({"message_id": message_id})
    if email:
        clauses.append({"to": {"$regex": "^" + re.escape(email.strip()) + "$", "$options": "i"}})
    if clauses:
        await db.outbox.update_many({"$or": clauses}, {
            "$set": {"to": "", "subject": "[erased]", "html": "", "status": "erased",
                     "erased_at": datetime.now(timezone.utc)},
            "$unset": {"payload": "", "reply_to": "", "error": "", "lease_until": "", "claim": ""},
        })


async def request_erasure(reg_id: str, *, delete: bool = False, delete_file=None) -> dict:
    db = database.db
    patch = {"privacy_pending": True}
    if delete:
        patch["privacy_delete"] = True
    await db.registrations.update_one({"id": reg_id}, {"$set": patch})
    row = await db.registrations.find_one({"id": reg_id})
    if not row:
        return {"privacy_status": "completed"}
    job = {"_id": reg_id, "registration_id": reg_id, "event_id": row.get("event_id"),
           "delete": delete, "keys": upload_keys(row), "status": "pending", "attempts": 0,
           "created_at": datetime.now(timezone.utc), "next_attempt_at": datetime.now(timezone.utc)}
    try:
        await db.privacy_jobs.insert_one(job)
    except DuplicateKeyError:
        if delete:
            await db.privacy_jobs.update_one({"_id": reg_id}, {"$set": {"delete": True, "status": "pending"}})
    return await process_erasure(reg_id, delete_file=delete_file)


async def process_erasure(reg_id: str, *, delete_file=None) -> dict:
    db = database.db
    job = await db.privacy_jobs.find_one({"_id": reg_id})
    if not job:
        return {"privacy_status": "pending"}
    row = await db.registrations.find_one({"id": reg_id})
    try:
        for key in job["keys"]:
            (delete_file or delete_private_upload)(key)
        if row:
            await erase_notifications(registration_id=reg_id, email=row.get("email"))
        event_id = job.get("event_id")
        if event_id:
            from lib.registration_workflow import change_registration
            await change_registration(event_id, reg_id, remove=job["delete"], eligible=False)
        if job["delete"]:
            # A concurrent anonymizer may have cleared privacy_pending; a durable full-delete request still wins.
            await db.registrations.delete_one({"id": reg_id})
            if await db.registrations.find_one({"id": reg_id}, {"id": 1}):
                raise RuntimeError("Erasure row deletion was not confirmed")
        elif row:
            await db.registrations.update_one({"id": reg_id, "privacy_pending": True}, {"$set": {
                "data": {"f_full-name": "[anonymized]"}, "email": "", "nim": "", "notes": "",
                "email_normalized": "", "nim_normalized": "", "anonymized": True,
                "anonymized_at": datetime.now(timezone.utc), "privacy_pending": False, "uploads_ready": False,
            }})
        completed = await db.privacy_jobs.update_one({"_id": reg_id, "delete": job["delete"]}, {"$set": {
            "status": "completed", "completed_at": datetime.now(timezone.utc), "keys": [],
            "key_hashes": sorted(set(job.get("key_hashes", [])) | {hashlib.sha256(key.encode()).hexdigest() for key in job["keys"]})},
            "$unset": {"error_code": ""}})
        return {"privacy_status": "completed" if completed.matched_count else "pending"}
    except Exception as exc:
        # Exception names are useful to operators; exception strings may contain PII.
        attempts = int(job.get("attempts", 0)) + 1
        await db.privacy_jobs.update_one({"_id": reg_id}, {"$set": {
            "status": "pending", "error_code": type(exc).__name__,
            "next_attempt_at": datetime.now(timezone.utc) + timedelta(seconds=min(3600, 30 * 2 ** min(attempts, 7)))},
            "$inc": {"attempts": 1}})
        return {"privacy_status": "pending"}


async def run_retention_sweep(limit: int = 200) -> dict:
    from lib.settings import get_settings
    db = database.db
    settings = await get_settings()
    days = max(1, int(settings.get("retention_days") or 90))
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)
    completed = pending = 0
    query = {"$or": [{"created_at": {"$lt": cutoff}, "anonymized": {"$ne": True}}, {"privacy_pending": True},
                       {"created_at": {"$lt": cutoff}, "anonymized": True, "notes": {"$nin": ["", None]}}]}
    async for row in db.registrations.find(query).limit(limit):
        job = await db.privacy_jobs.find_one({"_id": row["id"], "status": "pending", "next_attempt_at": {"$gt": now}})
        if job:
            pending += 1
            continue
        result = await request_erasure(row["id"], delete=bool(row.get("privacy_delete")))
        if result["privacy_status"] == "completed":
            completed += 1
        else:
            pending += 1
    async for job in db.privacy_jobs.find({"status": "pending", "next_attempt_at": {"$lte": now}}).limit(limit):
        await process_erasure(job["_id"])
    notification_days = max(1, int(os.environ.get("NOTIFICATION_RETENTION_DAYS", "30")))
    result = await db.outbox.update_many({"created_at": {"$lt": now - timedelta(days=notification_days)},
                                          "status": {"$ne": "erased"}}, {
        "$set": {"status": "erased", "to": "", "subject": "[expired]", "html": ""},
        "$unset": {"payload": "", "reply_to": "", "error": "", "claim": "", "lease_until": ""}})
    message_days = max(1, int(os.environ.get("MESSAGE_RETENTION_DAYS") or days))
    async for message in db.messages.find({"created_at": {"$lt": now - timedelta(days=message_days)}}).limit(limit):
        await erase_notifications(message_id=message["id"], email=message.get("email"))
        await db.messages.delete_one({"_id": message["_id"]})
    return {"anonymized": completed, "pending": pending, "retention_days": days,
            "notifications_erased": result.modified_count}
