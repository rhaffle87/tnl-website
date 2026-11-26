"""Transactional email. With SMTP_* configured mail goes out over SMTP;
without it, every message is recorded in the `outbox` collection (visible in the
admin under Messages → Outbox) so nothing is silently lost in dev/demo.
"""

import asyncio
import logging
import os
import re
import smtplib
from datetime import datetime, timezone
from email.message import EmailMessage

from lib.db import db

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


async def send_email(to: str, subject: str, html: str, reply_to: str | None = None) -> dict:
    host = os.environ.get("SMTP_HOST", "")
    record = {
        "to": to, "subject": subject, "html": redact_for_outbox(html),
        "created_at": datetime.now(timezone.utc),
    }
    if host:
        try:
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, _smtp_send, host,
                                       int(os.environ.get("SMTP_PORT", "587")),
                                       os.environ.get("SMTP_USER", ""),
                                       os.environ.get("SMTP_PASS", ""),
                                       os.environ.get("SMTP_FROM", "TNL Studio <noreply@localhost>"),
                                       to, subject, html, reply_to)
            record["status"] = "sent"
        except Exception as exc:  # noqa: BLE001 — record, never crash the request
            logger.warning("send_email failed: %s", exc)
            record["status"] = "failed"
            record["error"] = str(exc)
    else:
        record["status"] = "logged"
    await db.outbox.insert_one(record)
    return record
