"""Registrar dashboard: registration pipeline, bulk email, CSV export, QR check-in,
certificate issuing, and UU PDP tools (delete / anonymize per registrant, retention sweep).
Plus the contact inbox with local triage and reply-by-email."""

import csv
import io
import re
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import Response

from lib.auth import audit, require
from lib.cache import invalidate_public_cache
from lib.db import db
from lib.advisor import triage_message
from lib.mailer import send_email, public_delivery, retry_email
from lib.registration_workflow import event_ledger, sync_ledger, change_registration, queue_registration_notifications
from lib.privacy import (private_upload_key as _private_upload_key, delete_private_upload as delete_object,
                         request_erasure, run_retention_sweep, erase_notifications)
from lib.serialize import jsonable
from models.core import BulkEmailIn, CheckinIn, IssueCertificatesIn, MessagePatch, RegistrationPatch

router = APIRouter(prefix="/admin", tags=["registrar"])

STATUSES = ("pending", "accepted", "rejected", "attended", "waitlisted")


def _formula_safe(value) -> str:
    """Neutralise CSV/XLSX formula injection while preserving the visible text."""
    text = "" if value is None else str(value)
    if text[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + text
    return text


def _display_name(reg: dict) -> str:
    data = reg.get("data") or {}
    for key, value in data.items():
        if isinstance(value, str) and ("nama" in key.lower() or "name" in key.lower()) and value.strip():
            return value.strip()
    return reg.get("email") or "Participant"


# ---------------------------------------------------------------- registrations
@router.get("/registrations", dependencies=[Depends(require("registrations:read"))])
async def list_registrations(event_id: str | None = None, status: str | None = None,
                             q: str | None = None, limit: int = Query(100, ge=1, le=200),
                             offset: int = Query(0, ge=0)):
    if event_id:
        await sync_ledger(await event_ledger(event_id))
    query: dict = {}
    if event_id:
        query["event_id"] = event_id
    if status in STATUSES:
        query["status"] = status
    if q:
        regex = re.escape(q.strip())
        query["$or"] = [{"email": {"$regex": regex, "$options": "i"}},
                        {"nim": {"$regex": regex, "$options": "i"}},
                        {"event_title": {"$regex": regex, "$options": "i"}}]
    total = await db.registrations.count_documents(query)
    docs = await db.registrations.find(query).sort("created_at", -1).skip(offset).limit(min(limit, 200)).to_list(200)
    for d in docs:
        d["display_name"] = _display_name(d)
    counts = {}
    for st in STATUSES:
        base = {k: v for k, v in query.items() if k != "status"}
        counts[st] = await db.registrations.count_documents({**base, "status": st})
    return {"items": jsonable(docs), "total": total, "counts": counts}


@router.patch("/registrations/{reg_id}", dependencies=[Depends(require("registrations:manage"))])
async def update_registration(reg_id: str, payload: RegistrationPatch, request: Request):
    reg = await db.registrations.find_one({"id": reg_id})
    if not reg:
        raise HTTPException(status_code=404, detail="Registration not found.")
    patch = payload.model_dump(exclude_unset=True)
    if reg.get("privacy_pending") or reg.get("anonymized"):
        raise HTTPException(409, "Personal data has been erased or is pending erasure.")
    if "notes" in patch:
        if patch["notes"] is None or len(patch["notes"]) > 4000:
            raise HTTPException(422, "Notes must be text of at most 4000 characters.")
        patch["notes"] = patch["notes"].strip()
    if "status" in patch:
        if patch["status"] not in STATUSES:
            raise HTTPException(422, "A registration status is required.")
        ledger = await change_registration(reg["event_id"], reg_id, status=patch.pop("status"))
        await queue_registration_notifications(ledger)
    if patch:
        await db.registrations.update_one({"id": reg_id, "privacy_pending": {"$ne": True},
                                          "anonymized": {"$ne": True}}, {"$set": patch})
    await invalidate_public_cache("events")
    await audit(request, "update", "registrations", reg_id, {"status": payload.status})
    fresh = await db.registrations.find_one({"id": reg_id})
    fresh["display_name"] = _display_name(fresh)
    return jsonable(fresh)


@router.post("/registrations/bulk-email", dependencies=[Depends(require("registrations:manage"))])
async def bulk_email(payload: BulkEmailIn, request: Request):
    if not payload.subject.strip() or len(payload.subject) > 200 or not payload.body.strip() or len(payload.body) > 20000:
        raise HTTPException(422, "Subject must contain 1 to 200 characters and body 1 to 20000 characters.")
    query: dict = {"event_id": payload.event_id}
    if payload.status_filter in STATUSES:
        query["status"] = payload.status_filter
    regs = await db.registrations.find(query).to_list(1000)
    queued = failed = skipped = 0
    notification_ids = []
    for reg in regs:
        if not reg.get("email") or reg.get("anonymized") or reg.get("privacy_pending"):
            skipped += 1
            continue
        body = payload.body.replace("{name}", _display_name(reg)).replace("{event}", reg.get("event_title", ""))
        try:
            job = await send_email(reg["email"], payload.subject, body, registration_id=reg["id"])
            queued += job["status"] == "queued"
            notification_ids.append(job["id"])
        except HTTPException:
            failed += 1
    await audit(request, "bulk-email", "registrations", payload.event_id, {"queued": queued, "failed": failed})
    return {"ok": True, "queued": queued, "delivered": 0, "failed": failed, "skipped": skipped,
            "notification_ids": notification_ids}


@router.post("/registrations/{reg_id}/withdraw", dependencies=[Depends(require("registrations:manage"))])
async def withdraw_registration(reg_id: str, request: Request):
    reg = await db.registrations.find_one({"id": reg_id})
    if not reg:
        raise HTTPException(404, "Registration not found.")
    ledger = await change_registration(reg["event_id"], reg_id, status="rejected")
    await db.registrations.update_one({"id": reg_id}, {"$set": {"withdrawn_at": datetime.now(timezone.utc)}})
    await queue_registration_notifications(ledger)
    await invalidate_public_cache("events")
    await audit(request, "withdraw", "registrations", reg_id)
    return {"ok": True, "status": "rejected"}


@router.get("/registrations/export", dependencies=[Depends(require("registrations:read"))])
async def export_registrations(event_id: str | None = None, status: str | None = None):
    query: dict = {}
    if event_id:
        query["event_id"] = event_id
    if status in STATUSES:
        query["status"] = status
    regs = await db.registrations.find(query).sort("created_at", 1).to_list(5000)
    keys: list[str] = []
    for r in regs:
        for k in (r.get("data") or {}):
            if k not in keys:
                keys.append(k)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["registered_at", "event", "status", "email", "nim", "certificate_code"] +
               [k.replace("f_", "").replace("-", " ") for k in keys])
    for r in regs:
        when = r.get("created_at")
        row = [_formula_safe(when.isoformat() if hasattr(when, "isoformat") else when),
               _formula_safe(r.get("event_title", "")), r.get("status", ""), _formula_safe(r.get("email", "")),
               _formula_safe(r.get("nim", "")), _formula_safe(r.get("certificate_code") or "")]
        for k in keys:
            v = (r.get("data") or {}).get(k, "")
            row.append(_formula_safe((v.get("absolute_url") or v.get("url") or v.get("name") or "")
                                     if isinstance(v, dict) else v))
        w.writerow(row)
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="tnl-registrations.csv"'})


@router.get("/registrations/export-excel", dependencies=[Depends(require("registrations:read"))])
async def export_registrations_excel(event_id: str | None = None, status: str | None = None):
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    query: dict = {}
    if event_id:
        query["event_id"] = event_id
    if status in STATUSES:
        query["status"] = status
    regs = await db.registrations.find(query).sort("created_at", 1).to_list(5000)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Pendaftaran TNL"

    header_fill = PatternFill(start_color="223027", end_color="223027", fill_type="solid")
    header_font = Font(name="Arial", size=11, bold=True, color="F4F4F0")
    header_align = Alignment(horizontal="center", vertical="center", wrap_text=True)

    keys: list[str] = []
    for r in regs:
        for k in (r.get("data") or {}):
            if k not in keys:
                keys.append(k)

    headers = ["No", "Waktu Daftar", "Event", "Status", "Email", "NRP / NIM", "Certificate Code"] + \
              [k.replace("f_", "").replace("-", " ").title() for k in keys]
    ws.append(headers)

    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = header_align

    for idx, r in enumerate(regs, 1):
        when = r.get("created_at")
        when_str = when.strftime("%Y-%m-%d %H:%M:%S") if hasattr(when, "strftime") else str(when)
        row = [idx, _formula_safe(when_str), _formula_safe(r.get("event_title", "")), r.get("status", ""),
               _formula_safe(r.get("email", "")), _formula_safe(r.get("nim", "")),
               _formula_safe(r.get("certificate_code") or "")]
        for k in keys:
            v = (r.get("data") or {}).get(k, "")
            if isinstance(v, dict):
                row.append(_formula_safe(v.get("absolute_url") or v.get("url") or v.get("name") or ""))
            else:
                row.append(_formula_safe(v))
        ws.append(row)

    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 45)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="data-pendaftaran-labtnl.xlsx"'}
    )


@router.post("/registrations/checkin", dependencies=[Depends(require("registrations:manage"))])
async def checkin(payload: CheckinIn, request: Request):
    """QR check-in: the QR encodes the registration id or certificate code."""
    code = payload.code.strip()
    reg = await db.registrations.find_one({"$or": [{"id": code}, {"certificate_code": code.upper()}]})
    if not reg:
        raise HTTPException(status_code=404, detail="No registration matches this code.")
    if reg.get("privacy_pending") or reg.get("anonymized"):
        raise HTTPException(409, "This registration is not eligible for check-in.")
    ledger = await event_ledger(reg["event_id"])
    await sync_ledger(ledger)
    reg = await db.registrations.find_one({"id": reg["id"]})
    if reg.get("status") == "attended":
        return {"ok": True, "already": True, "name": _display_name(reg),
                "event_title": reg.get("event_title"), "message": "Already checked in."}
    override = bool(getattr(payload, "override", False))
    reason = (getattr(payload, "override_reason", None) or "").strip()
    if reg.get("status") != "accepted" and not (override and len(reason) >= 10):
        raise HTTPException(409, "Only accepted registrations may check in. An override requires an explicit reason.")
    await change_registration(reg["event_id"], reg["id"], status="attended")
    cert = reg.get("certificate_code") or secrets.token_hex(4).upper()
    await db.registrations.update_one({"id": reg["id"], "status": "attended"},
                                      {"$set": {"certificate_code": cert}})
    overridden = reg.get("status") != "accepted"
    await invalidate_public_cache("events")
    await audit(request, "checkin-override" if overridden else "checkin", "registrations", reg["id"],
                {"override_reason": reason} if overridden else None)
    return {"ok": True, "already": False, "name": _display_name(reg), "certificate_code": cert,
            "event_title": reg.get("event_title"), "message": "Checked in."}


@router.get("/registrations/{reg_id}/qr", dependencies=[Depends(require("registrations:read"))])
async def registration_qr(reg_id: str):
    reg = await db.registrations.find_one({"id": reg_id})
    if not reg:
        raise HTTPException(status_code=404, detail="Registration not found.")
    try:
        import qrcode
    except ImportError:
        raise HTTPException(status_code=501, detail="QR generation needs the qrcode package installed.")
    img = qrcode.make(reg_id)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")


@router.post("/registrations/issue-certificates", dependencies=[Depends(require("registrations:manage"))])
async def issue_certificates(payload: IssueCertificatesIn, request: Request):
    """Batch issue official certificate codes for participants."""
    event = await db.events.find_one({"id": payload.event_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")

    start_date = event.get("start_date") or ""
    year = start_date[:4] if len(start_date) >= 4 else str(datetime.now(timezone.utc).year)
    ev_type = (event.get("type") or "evt")[:3].upper()

    # A certificate is an attendance record: never issue one from an accepted-only
    # registration, even if a caller supplies other statuses. Check-in may already
    # have generated a code, so select on the missing issue timestamp instead.
    query = {
        "event_id": payload.event_id,
        "status": {"$in": ["attended"]},
        "$or": [
            {"certificate_issued_at": {"$exists": False}},
            {"certificate_issued_at": None},
        ],
    }
    candidates = await db.registrations.find(query).to_list(2000)
    issued_count = 0
    now = datetime.now(timezone.utc)
    for reg in candidates:
        code = reg.get("certificate_code")
        if not code:
            code = f"TNL-{year}-{ev_type}-{secrets.token_hex(3).upper()}"
            while await db.registrations.find_one({"certificate_code": code}):
                code = f"TNL-{year}-{ev_type}-{secrets.token_hex(3).upper()}"
        await db.registrations.update_one(
            {"id": reg["id"]},
            {"$set": {"certificate_code": code, "certificate_issued_at": now}},
        )
        issued_count += 1

    await audit(request, "issue-certificates", "registrations", payload.event_id, {"issued": issued_count})
    return {"ok": True, "issued": issued_count, "event_id": payload.event_id}



# ---------------------------------------------------------------- UU PDP
@router.post("/registrations/{reg_id}/anonymize", dependencies=[Depends(require("registrations:manage"))])
async def anonymize_registration(reg_id: str, request: Request):
    reg = await db.registrations.find_one({"id": reg_id})
    if not reg:
        raise HTTPException(status_code=404, detail="Registration not found.")
    result = await request_erasure(reg_id, delete_file=delete_object)
    await invalidate_public_cache("events")
    await audit(request, "anonymize", "registrations", reg_id)  # no personal data in the log
    return {"ok": True, **result, "message": ("Personal details removed; the attendance record is kept."
            if result["privacy_status"] == "completed" else "Erasure queued for retry; attachments are no longer accessible.")}


@router.delete("/registrations/{reg_id}", dependencies=[Depends(require("registrations:manage"))])
async def delete_registration(reg_id: str, request: Request):
    reg = await db.registrations.find_one({"id": reg_id})
    if not reg:
        raise HTTPException(status_code=404, detail="Registration not found.")
    result = await request_erasure(reg_id, delete=True, delete_file=delete_object)
    await invalidate_public_cache("events")
    await audit(request, "delete", "registrations", reg_id)
    return {"ok": True, **result}


@router.post("/registrations/retention-sweep", dependencies=[Depends(require("registrations:manage"))])
async def retention_sweep(request: Request):
    """Anonymize registrations older than the retention window set in Settings."""
    result = await run_retention_sweep()
    await invalidate_public_cache("events")
    await audit(request, "retention-sweep", "registrations", None, result)
    return {"ok": True, **result}


@router.get("/privacy-jobs", dependencies=[Depends(require("registrations:manage"))])
async def list_privacy_jobs():
    jobs = await db.privacy_jobs.find({"status": "pending"}, {"keys": 0, "key_hashes": 0}).sort("created_at", 1).limit(200).to_list(200)
    return {"items": jsonable([{**job, "id": str(job["_id"])} for job in jobs]),
            "pending": await db.privacy_jobs.count_documents({"status": "pending"})}


@router.post("/privacy-jobs/{reg_id}/retry", dependencies=[Depends(require("registrations:manage"))])
async def retry_privacy_job(reg_id: str, request: Request):
    from lib.privacy import process_erasure
    if not await db.privacy_jobs.find_one({"_id": reg_id}):
        raise HTTPException(404, "Privacy job not found.")
    result = await process_erasure(reg_id, delete_file=delete_object)
    await audit(request, "privacy-retry", "registrations", reg_id, result)
    return {"ok": True, **result}


# ---------------------------------------------------------------- contact inbox
@router.get("/messages", dependencies=[Depends(require("messages:manage"))])
async def list_messages(status: str | None = None, category: str | None = None):
    q: dict = {}
    if status in ("new", "replied", "archived"):
        q["status"] = status
    if category:
        q["triage.category"] = category
    docs = await db.messages.find(q).sort("created_at", -1).to_list(500)
    return {
        "items": jsonable(docs),
        "counts": {
            "new": await db.messages.count_documents({"status": "new"}),
            "replied": await db.messages.count_documents({"status": "replied"}),
            "archived": await db.messages.count_documents({"status": "archived"}),
        },
    }


@router.post("/messages/{msg_id}/triage", dependencies=[Depends(require("messages:manage"))])
async def triage_one(msg_id: str, request: Request):
    """Local triage: sort this message into a bucket, score urgency, flag spam."""
    msg = await db.messages.find_one({"id": msg_id})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found.")
    result = triage_message(msg.get("name", ""), msg.get("subject", ""), msg.get("body", ""))
    if not result.get("ai_ok"):
        raise HTTPException(status_code=422, detail="This message is empty, so there is nothing to triage.")
    await db.messages.update_one({"id": msg_id}, {"$set": {"triage": result}})
    return result


@router.post("/messages/triage-all", dependencies=[Depends(require("messages:manage"))])
async def triage_all(request: Request):
    msgs = await db.messages.find({"triage": {"$exists": False}}).limit(10).to_list(10)
    done = 0
    for msg in msgs:  # sequential: keeps the triage order and audit trail stable
        result = triage_message(msg.get("name", ""), msg.get("subject", ""), msg.get("body", ""))
        await db.messages.update_one({"id": msg["id"]}, {"$set": {"triage": result}})
        if result.get("ai_ok"):
            done += 1
    await audit(request, "triage-messages", "messages", None, {"triaged": done})
    return {"ok": True, "triaged": done, "examined": len(msgs)}


@router.patch("/messages/{msg_id}", dependencies=[Depends(require("messages:manage"))])
async def update_message(msg_id: str, payload: MessagePatch, request: Request):
    msg = await db.messages.find_one({"id": msg_id})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found.")
    patch = payload.model_dump(exclude_unset=True)
    reply = patch.pop("reply_body", None)
    if reply is not None and not reply.strip():
        raise HTTPException(422, "Reply must contain text.")
    if reply:
        if len(reply.strip()) > 20000 or not reply.strip():
            raise HTTPException(422, "Reply must contain 1 to 20000 characters.")
        job = await send_email(msg.get("email", ""), f"Re: {msg.get('subject', '')}", reply, message_id=msg_id)
        patch["reply_delivery"] = job["status"]
        patch["reply_notification_id"] = job["id"]
        if patch.get("status") == "replied":
            patch.pop("status")
    elif patch.get("status") == "replied" and not msg.get("replied_at"):
        raise HTTPException(409, "No reply has been delivered for this message.")
    if patch:
        await db.messages.update_one({"id": msg_id}, {"$set": patch})
    await audit(request, "update", "messages", msg_id, {"status": patch.get("status")})
    return jsonable(await db.messages.find_one({"id": msg_id}))


@router.delete("/messages/{msg_id}", dependencies=[Depends(require("messages:manage"))])
async def delete_message(msg_id: str, request: Request):
    msg = await db.messages.find_one({"id": msg_id})
    if msg:
        await erase_notifications(message_id=msg_id, email=msg.get("email"))
    res = await db.messages.delete_one({"id": msg_id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Message not found.")
    await audit(request, "delete", "messages", msg_id)
    return {"ok": True}


@router.get("/outbox", dependencies=[Depends(require("outbox:read"))])
async def list_outbox():
    docs = await db.outbox.find({}, {"payload": 0, "claim": 0, "lease_until": 0}).sort("created_at", -1).limit(200).to_list(200)
    counts = {status: await db.outbox.count_documents({"status": status})
              for status in ("queued", "delivering", "delivered", "failed", "expired", "erased", "cancelled")}
    privacy_pending = await db.privacy_jobs.count_documents({"status": "pending"})
    return {"items": jsonable([public_delivery(d) for d in docs]), "counts": counts,
            "privacy_pending": privacy_pending, "smtp_configured": bool(__import__("os").environ.get("SMTP_HOST"))}


@router.post("/outbox/{notification_id}/retry", dependencies=[Depends(require("outbox:read"))])
async def retry_outbox(notification_id: str, request: Request):
    result = await retry_email(notification_id)
    await audit(request, "retry", "outbox", notification_id)
    return result
