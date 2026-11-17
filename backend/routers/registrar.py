"""Registrar dashboard: registration pipeline, bulk email, CSV export, QR check-in,
certificate issuing, and UU PDP tools (delete / anonymize per registrant, retention sweep).
Plus the contact inbox with Jev triage and reply-by-email."""

import csv
import io
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response

from lib.auth import audit, require
from lib.db import db
from lib.jev import score_registration, triage_message
from lib.mailer import send_email
from lib.serialize import jsonable
from models.core import BulkEmailIn, CheckinIn, IssueCertificatesIn, MessagePatch, RegistrationPatch

router = APIRouter(prefix="/admin", tags=["registrar"])

STATUSES = ("pending", "accepted", "rejected", "attended", "waitlisted")


def _display_name(reg: dict) -> str:
    data = reg.get("data") or {}
    for key, value in data.items():
        if isinstance(value, str) and "name" in key and value.strip():
            return value.strip()
    return reg.get("email") or "Participant"


# ---------------------------------------------------------------- registrations
@router.get("/registrations", dependencies=[Depends(require("registrations:read"))])
async def list_registrations(event_id: str | None = None, status: str | None = None,
                             q: str | None = None, limit: int = 100, offset: int = 0):
    query: dict = {}
    if event_id:
        query["event_id"] = event_id
    if status in STATUSES:
        query["status"] = status
    if q:
        query["$or"] = [{"email": {"$regex": q, "$options": "i"}},
                        {"nim": {"$regex": q, "$options": "i"}},
                        {"event_title": {"$regex": q, "$options": "i"}}]
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
    if patch.get("status") in ("accepted", "attended") and not reg.get("certificate_code"):
        patch["certificate_code"] = secrets.token_hex(4).upper()
    if patch:
        await db.registrations.update_one({"id": reg_id}, {"$set": patch})
    # Accepting a seat may free a waitlist slot — promote the oldest waitlisted entry.
    if patch.get("status") in ("rejected",):
        ev = await db.events.find_one({"id": reg.get("event_id")})
        cap = (ev or {}).get("capacity") or 0
        if cap:
            used = await db.registrations.count_documents(
                {"event_id": reg["event_id"], "status": {"$in": ["pending", "accepted", "attended"]}})
            if used < cap:
                nxt = await db.registrations.find_one(
                    {"event_id": reg["event_id"], "status": "waitlisted"}, sort=[("created_at", 1)])
                if nxt:
                    await db.registrations.update_one({"id": nxt["id"]}, {"$set": {"status": "pending"}})
                    await send_email(nxt.get("email", ""), f"A place opened up — {reg.get('event_title', '')}",
                                     "<p>Good news: a seat has opened up and your registration is now pending review.</p>")
    await audit(request, "update", "registrations", reg_id, {"status": patch.get("status")})
    fresh = await db.registrations.find_one({"id": reg_id})
    fresh["display_name"] = _display_name(fresh)
    return jsonable(fresh)


@router.post("/registrations/{reg_id}/score", dependencies=[Depends(require("registrations:manage"))])
async def score_one(reg_id: str, request: Request):
    """Jev: rate how complete/genuine this registration looks, for triage."""
    reg = await db.registrations.find_one({"id": reg_id})
    if not reg:
        raise HTTPException(status_code=404, detail="Registration not found.")
    ev = await db.events.find_one({"id": reg.get("event_id")}) or {}
    result = await score_registration(reg.get("event_title", ""), ev.get("type", "training"), reg.get("data") or {})
    await db.registrations.update_one({"id": reg_id}, {"$set": {"ai_score": result}})
    if not result.get("ai_ok"):
        raise HTTPException(status_code=503, detail="The scoring service is busy. Please try again shortly.")
    return result


@router.post("/registrations/score-all", dependencies=[Depends(require("registrations:manage"))])
async def score_all(payload: dict, request: Request):
    """Score up to 10 unscored registrations for an event, sequentially (concurrency limit)."""
    event_id = payload.get("event_id")
    if not event_id:
        raise HTTPException(status_code=422, detail="Choose an event first.")
    ev = await db.events.find_one({"id": event_id}) or {}
    regs = await db.registrations.find(
        {"event_id": event_id, "ai_score": {"$exists": False}}).limit(10).to_list(10)
    scored = 0
    for reg in regs:  # one at a time: the universal key allows limited concurrency
        result = await score_registration(reg.get("event_title", ""), ev.get("type", "training"), reg.get("data") or {})
        await db.registrations.update_one({"id": reg["id"]}, {"$set": {"ai_score": result}})
        if result.get("ai_ok"):
            scored += 1
    await audit(request, "score-registrations", "registrations", event_id, {"scored": scored})
    return {"ok": True, "scored": scored, "examined": len(regs)}


@router.post("/registrations/bulk-email", dependencies=[Depends(require("registrations:manage"))])
async def bulk_email(payload: BulkEmailIn, request: Request):
    query: dict = {"event_id": payload.event_id}
    if payload.status_filter in STATUSES:
        query["status"] = payload.status_filter
    regs = await db.registrations.find(query).to_list(1000)
    sent = 0
    for reg in regs:
        if not reg.get("email"):
            continue
        body = payload.body.replace("{name}", _display_name(reg)).replace("{event}", reg.get("event_title", ""))
        await send_email(reg["email"], payload.subject, body)
        sent += 1
    await audit(request, "bulk-email", "registrations", payload.event_id, {"sent": sent})
    return {"ok": True, "sent": sent}


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
        row = [when.isoformat() if hasattr(when, "isoformat") else when,
               r.get("event_title", ""), r.get("status", ""), r.get("email", ""),
               r.get("nim", ""), r.get("certificate_code") or ""]
        for k in keys:
            v = (r.get("data") or {}).get(k, "")
            row.append(v.get("name") if isinstance(v, dict) else v)
        w.writerow(row)
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="tnl-registrations.csv"'})


@router.post("/registrations/checkin", dependencies=[Depends(require("registrations:manage"))])
async def checkin(payload: CheckinIn, request: Request):
    """QR check-in: the QR encodes the registration id or certificate code."""
    code = payload.code.strip()
    reg = await db.registrations.find_one({"$or": [{"id": code}, {"certificate_code": code.upper()}]})
    if not reg:
        raise HTTPException(status_code=404, detail="No registration matches this code.")
    if reg.get("status") == "attended":
        return {"ok": True, "already": True, "name": _display_name(reg),
                "event_title": reg.get("event_title"), "message": "Already checked in."}
    cert = reg.get("certificate_code") or secrets.token_hex(4).upper()
    await db.registrations.update_one({"id": reg["id"]},
                                      {"$set": {"status": "attended", "certificate_code": cert}})
    await audit(request, "checkin", "registrations", reg["id"])
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

    statuses = payload.statuses if payload.statuses else ["attended"]
    query = {
        "event_id": payload.event_id,
        "status": {"$in": statuses},
        "$or": [
            {"certificate_code": {"$exists": False}},
            {"certificate_code": None},
            {"certificate_code": ""},
        ],
    }
    candidates = await db.registrations.find(query).to_list(2000)
    issued_count = 0
    now = datetime.now(timezone.utc)
    for reg in candidates:
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
    await db.registrations.update_one({"id": reg_id}, {"$set": {
        "data": {"f_full-name": "[anonymized]"}, "email": "", "nim": "",
        "anonymized": True, "anonymized_at": datetime.now(timezone.utc),
    }})
    await audit(request, "anonymize", "registrations", reg_id)  # no personal data in the log
    return {"ok": True, "message": "Personal details removed; the attendance record is kept."}


@router.delete("/registrations/{reg_id}", dependencies=[Depends(require("registrations:manage"))])
async def delete_registration(reg_id: str, request: Request):
    res = await db.registrations.delete_one({"id": reg_id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Registration not found.")
    await audit(request, "delete", "registrations", reg_id)
    return {"ok": True}


@router.post("/registrations/retention-sweep", dependencies=[Depends(require("registrations:manage"))])
async def retention_sweep(request: Request):
    """Anonymize registrations older than the retention window set in Settings."""
    from lib.settings import get_settings
    s = await get_settings()
    days = int(s.get("retention_days") or 90)
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    stale = await db.registrations.find(
        {"created_at": {"$lt": cutoff}, "anonymized": {"$ne": True}}).to_list(5000)
    for reg in stale:
        await db.registrations.update_one({"id": reg["id"]}, {"$set": {
            "data": {"f_full-name": "[anonymized]"}, "email": "", "nim": "",
            "anonymized": True, "anonymized_at": datetime.now(timezone.utc)}})
    await audit(request, "retention-sweep", "registrations", None, {"count": len(stale), "days": days})
    return {"ok": True, "anonymized": len(stale), "retention_days": days}


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
    """Jev: sort this message into a bucket, score urgency, flag spam."""
    msg = await db.messages.find_one({"id": msg_id})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found.")
    result = await triage_message(msg.get("name", ""), msg.get("subject", ""), msg.get("body", ""))
    await db.messages.update_one({"id": msg_id}, {"$set": {"triage": result}})
    if not result.get("ai_ok"):
        raise HTTPException(status_code=503, detail="The triage service is busy. Please try again shortly.")
    return result


@router.post("/messages/triage-all", dependencies=[Depends(require("messages:manage"))])
async def triage_all(request: Request):
    msgs = await db.messages.find({"triage": {"$exists": False}}).limit(10).to_list(10)
    done = 0
    for msg in msgs:  # sequential: respects the universal key's concurrency limit
        result = await triage_message(msg.get("name", ""), msg.get("subject", ""), msg.get("body", ""))
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
    if reply:
        await send_email(msg.get("email", ""), f"Re: {msg.get('subject', '')}", reply)
        patch["status"] = "replied"
        patch["replied_at"] = datetime.now(timezone.utc)
    if patch:
        await db.messages.update_one({"id": msg_id}, {"$set": patch})
    await audit(request, "update", "messages", msg_id, {"status": patch.get("status")})
    return jsonable(await db.messages.find_one({"id": msg_id}))


@router.delete("/messages/{msg_id}", dependencies=[Depends(require("messages:manage"))])
async def delete_message(msg_id: str, request: Request):
    res = await db.messages.delete_one({"id": msg_id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Message not found.")
    await audit(request, "delete", "messages", msg_id)
    return {"ok": True}


@router.get("/outbox", dependencies=[Depends(require("messages:manage"))])
async def list_outbox():
    """Every email the app generated. With no SMTP configured these are status=logged."""
    docs = await db.outbox.find({}).sort("created_at", -1).limit(200).to_list(200)
    return {"items": jsonable(docs), "smtp_configured": bool(__import__("os").environ.get("SMTP_HOST"))}
