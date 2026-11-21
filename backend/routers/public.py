"""Public, unauthenticated reads (maintenance-aware) + contact inbox submission +
event registration engine + certificate verification."""

import os
import re
import uuid
from datetime import datetime, timezone
from html import escape as html_escape
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from lib.auth import client_ip, rate_limit, sign_upload, user_for_request
from lib.db import db
from lib.dates import today_iso
from lib.mailer import send_email
from lib.quality import EMAIL_OK
from lib.serialize import jsonable
from lib.settings import get_settings
from models.core import ThemeTokens

router = APIRouter(tags=["public"])

# Fields that must never leave the server through the public event endpoints. The sheet webhook
# is a write credential: anyone holding it can append rows to the registrant spreadsheet.
EVENT_PRIVATE_PROJECTION = {"spreadsheet_webhook_url": 0}


async def check_maintenance(request: Request) -> None:
    s = await get_settings()
    if s.get("maintenance_mode"):
        user = await user_for_request(request)
        if not user:
            raise HTTPException(status_code=503, detail="The site is in maintenance mode. Please try again soon.")


def field_key(label: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (label or "").lower()).strip("-")
    return f"f_{slug or 'field'}"


def event_reg_status(ev: dict, today: str) -> dict:
    open_d, close_d = ev.get("reg_open_date"), ev.get("reg_close_date")
    end_d = ev.get("end_date") or ev.get("start_date")
    if end_d and today > end_d:
        status = "past"
    elif close_d and today > close_d:
        status = "closed"
    elif open_d and today < open_d:
        status = "upcoming"
    elif open_d and today >= open_d:
        status = "open"
    else:
        status = "closed"
    return {"reg_status": status}


async def with_seats(evs: list[dict], today: str) -> list[dict]:
    for ev in evs:
        ev.update(event_reg_status(ev, today))
        cap = ev.get("capacity") or 0
        if cap:
            used = await db.registrations.count_documents(
                {"event_id": ev["id"], "status": {"$in": ["pending", "accepted", "attended"]}})
            ev["seats_left"] = max(0, cap - used)
            if ev["reg_status"] == "open" and used >= cap:
                ev["reg_status"] = "full"
        else:
            ev["seats_left"] = None
    return evs


# ---------------------------------------------------------------- reads
@router.get("/public/settings", dependencies=[Depends(check_maintenance)])
async def public_settings():
    s = await get_settings()
    published_theme = (s.get("theme") or {}).get("published") or s.get("theme_tokens") or ThemeTokens().model_dump()
    s.pop("theme", None)
    s["theme_tokens"] = published_theme
    s["server_today"] = today_iso()
    return jsonable(s)


@router.get("/public/stats", dependencies=[Depends(check_maintenance)])
async def public_stats():
    s = await get_settings()
    lecturers = await db.members.count_documents({"role": "lecturer", "published": True})
    assistants = await db.members.count_documents({"role": "assistant", "status": "active", "published": True})
    return {
        "lecturers": lecturers,
        "assistants": assistants,
        "research_tracks": len(s.get("focus_areas") or []),
        "room": (s.get("contact") or {}).get("room", "B-301"),
    }


@router.get("/public/pages/{slug}", dependencies=[Depends(check_maintenance)])
async def public_page(slug: str):
    page = await db.pages.find_one({"slug": slug, "status": "published"})
    if not page:
        raise HTTPException(status_code=404, detail="Page not found.")
    return jsonable(page)


@router.get("/public/members", dependencies=[Depends(check_maintenance)])
async def public_members(status: str | None = None, batch: str | None = None):
    q: dict = {"published": True}
    if status in ("active", "alumni"):
        q["status"] = status
    if batch:
        q["batch"] = batch
    docs = await db.members.find(q, {"email_personal": 0, "phone": 0}).sort(
        [("order", 1), ("created_at", 1)]).to_list(1000)
    # Per-person privacy opt-ins: private fields render only when explicitly opted-in.
    out = []
    for m in docs:
        if not m.get("show_nim"):
            m.pop("nim", None)
        if not m.get("show_personal_email"):
            m.pop("email_personal", None)
        out.append(m)
    return jsonable(out)


@router.get("/public/posts", dependencies=[Depends(check_maintenance)])
async def public_posts(category: str | None = None, q: str | None = None, tag: str | None = None,
                       limit: int = 24, offset: int = 0):
    query: dict = {"status": "published"}
    if category:
        query["category"] = category
    if tag:
        query["tags"] = tag
    if q:
        query["$or"] = [{"title": {"$regex": re.escape(q), "$options": "i"}},
                        {"excerpt": {"$regex": re.escape(q), "$options": "i"}},
                        {"body": {"$regex": re.escape(q), "$options": "i"}}]
    total = await db.posts.count_documents(query)
    docs = await db.posts.find(query).sort("published_at", -1).skip(offset).limit(min(limit, 50)).to_list(50)
    brief = [{k: d.get(k) for k in ("id", "slug", "title", "title_id", "excerpt", "excerpt_id", "category",
                                    "tags", "cover_url", "cover_alt", "published_at", "author")} for d in docs]
    all_categories = await db.posts.distinct("category", {"status": "published"})
    return {"items": jsonable(brief), "total": total, "categories": [c for c in all_categories if c]}


@router.get("/public/posts/{slug}", dependencies=[Depends(check_maintenance)])
async def public_post(slug: str):
    post = await db.posts.find_one({"slug": slug, "status": "published"})
    if not post:
        raise HTTPException(status_code=404, detail="Article not found.")
    related = await db.posts.find(
        {"status": "published", "slug": {"$ne": slug}, "category": post.get("category")}
    ).sort("published_at", -1).limit(3).to_list(3)
    post["related"] = [{k: r.get(k) for k in ("id", "slug", "title", "title_id", "cover_url", "cover_alt",
                                              "category", "published_at")} for r in related]
    return jsonable(post)


@router.get("/public/events", dependencies=[Depends(check_maintenance)])
async def public_events(type: str | None = None, include_past: bool = True):
    q: dict = {"status": "published"}
    if type:
        q["type"] = type
    docs = await db.events.find(q, EVENT_PRIVATE_PROJECTION).sort([("start_date", 1)]).to_list(200)
    today = today_iso()
    if not include_past:
        docs = [d for d in docs if event_reg_status(d, today)["reg_status"] != "past"]
    return jsonable(await with_seats(docs, today))


@router.get("/public/events/{slug}", dependencies=[Depends(check_maintenance)])
async def public_event(slug: str):
    ev = await db.events.find_one({"$or": [{"slug": slug}, {"id": slug}], "status": "published"},
                                  EVENT_PRIVATE_PROJECTION)
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found.")
    return jsonable((await with_seats([ev], today_iso()))[0])


@router.get("/public/activities", dependencies=[Depends(check_maintenance)])
async def public_activities(category: str | None = None):
    q: dict = {"published": True}
    if category:
        q["category"] = category
    docs = await db.activities.find(q).sort([("order", 1), ("date", -1)]).to_list(200)
    return jsonable(docs)


@router.get("/public/projects", dependencies=[Depends(check_maintenance)])
async def public_projects(kind: str | None = None):
    q: dict = {"status": "published"}
    if kind in ("rd", "social"):
        q["kind"] = kind
    docs = await db.projects.find(q).sort([("year", -1), ("created_at", -1)]).to_list(200)
    return jsonable(docs)


@router.get("/public/publications", dependencies=[Depends(check_maintenance)])
async def public_publications(year: int | None = None, ptype: str | None = None, member_id: str | None = None):
    q: dict = {"status": "published"}
    if year:
        q["year"] = year
    if ptype:
        q["ptype"] = ptype
    if member_id:
        q["linked_member_ids"] = member_id
    docs = await db.publications.find(q).sort([("year", -1), ("created_at", -1)]).to_list(500)

    # Attach member details for linked authors
    members_map = {
        m["id"]: {
            "id": m["id"],
            "name": m["name"],
            "role": m.get("role", "assistant"),
            "division": m.get("division"),
        }
        for m in await db.members.find({}, {"id": 1, "name": 1, "role": 1, "division": 1}).to_list(1000)
    }
    for d in docs:
        d["linked_members"] = [
            members_map[mid] for mid in (d.get("linked_member_ids") or []) if mid in members_map
        ]
    return jsonable(docs)


@router.get("/public/partners", dependencies=[Depends(check_maintenance)])
async def public_partners():
    docs = await db.partners.find({"published": True}).sort([("order", 1)]).to_list(100)
    return jsonable(docs)


@router.get("/public/practicum", dependencies=[Depends(check_maintenance)])
async def public_practicum():
    docs = await db.practicum.find({"published": True}).sort([("order", 1)]).to_list(100)
    return jsonable(docs)


@router.get("/public/equipment", dependencies=[Depends(check_maintenance)])
async def public_equipment(category: str | None = None, status: str | None = None):
    q: dict = {"published": True}
    if category:
        q["category"] = category
    if status:
        q["status"] = status
    docs = await db.equipment.find(
        q,
        {"serial_number": 0, "asset_code": 0, "internal_notes": 0, "needs_review": 0, "issues": 0}
    ).sort([("order", 1), ("created_at", -1)]).to_list(200)
    return jsonable(docs)


# ---------------------------------------------------------------- contact inbox
class ContactIn(BaseModel):
    name: str
    email: str
    subject: str
    message: str
    company_website: str = ""  # honeypot


@router.post("/contact")
async def submit_contact(payload: ContactIn, request: Request):
    rate_limit(f"contact:{client_ip(request)}", 5, 3600)
    if payload.company_website.strip():
        raise HTTPException(status_code=400, detail="Spam detected.")
    if not EMAIL_OK.match(payload.email):
        raise HTTPException(status_code=422, detail="Please enter a valid email address.")
    await db.messages.insert_one({
        "id": str(uuid.uuid4()), "name": payload.name.strip(), "email": payload.email.strip(),
        "subject": payload.subject.strip()[:200], "body": payload.message.strip()[:5000],
        "status": "new", "created_at": datetime.now(timezone.utc),
    })
    return {"ok": True, "message": "Thank you — your message has been received."}


# ---------------------------------------------------------------- registration engine
def _store_upload(data: bytes, filename: str, prefix: str) -> str:
    media_dir = os.environ.get("MEDIA_DIR", "/app/backend/media")
    sub = os.path.join(media_dir, "uploads")
    os.makedirs(sub, exist_ok=True)
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", filename or "file")[-80:]
    name = f"{prefix}_{uuid.uuid4().hex[:8]}_{safe}"
    with open(os.path.join(sub, name), "wb") as fh:
        fh.write(data)
    return f"/api/media-files/uploads/{name}?sig={sign_upload(name)}"


ALLOWED_UPLOAD_EXT = (".pdf", ".jpg", ".jpeg", ".png", ".webp", ".doc", ".docx", ".zip")

_UPLOAD_HEADERS = {
    ".pdf": (b"%PDF-",),
    ".jpg": (b"\xff\xd8\xff",),
    ".jpeg": (b"\xff\xd8\xff",),
    ".png": (b"\x89PNG\r\n\x1a\n",),
    ".doc": (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",),
    ".docx": (b"PK\x03\x04",),
    ".zip": (b"PK\x03\x04", b"PK\x05\x06"),
}


def _upload_header_ok(data: bytes, ext: str) -> bool:
    """Magic-byte check so a registration upload cannot just rename arbitrary content."""
    if ext == ".webp":
        return len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    return any(data.startswith(h) for h in _UPLOAD_HEADERS.get(ext, ()))


def _discard_uploads(urls: list[str]) -> None:
    """Remove files stored during a registration attempt that ended up rejected."""
    media_dir = os.environ.get("MEDIA_DIR", "/app/backend/media")
    for url in urls:
        try:
            filename = url.split("?")[0].rsplit("/", 1)[-1]
            os.remove(os.path.join(media_dir, "uploads", filename))
        except OSError:
            pass


async def _sync_registration_to_sheet(reg_id: str, webhook_url: str, ev: dict, reg: dict):
    from datetime import timedelta
    try:
        data = reg.get("data") or {}
        wib = reg.get("created_at") or datetime.now(timezone.utc)
        if hasattr(wib, "astimezone"):
            wib_str = wib.astimezone(timezone(timedelta(hours=7))).strftime("%Y-%m-%d %H:%M:%S WIB")
        else:
            wib_str = str(wib)

        full_name = next((v for k, v in data.items() if ("nama" in k or "name" in k) and isinstance(v, str)), "")
        nrp = reg.get("nim") or next((v for k, v in data.items() if ("nrp" in k or "nim" in k) and isinstance(v, str)), "")
        batch = next((v for k, v in data.items() if ("angkatan" in k or "batch" in k) and isinstance(v, str)), "")
        motivation = next((v for k, v in data.items() if ("motivasi" in k or "alasan" in k or "motivation" in k or "tertarik" in k) and isinstance(v, str)), "")

        ig_proof = ""
        for k, v in data.items():
            if isinstance(v, dict) and ("ig" in k or "instagram" in k or "proof" in k or "bukti" in k):
                ig_proof = v.get("absolute_url") or v.get("url") or ""
            elif isinstance(v, str) and ("ig" in k or "instagram" in k) and (v.startswith("http") or v.startswith("/api/")):
                ig_proof = v

        payload = {
            "timestamp": wib_str,
            "event_id": ev.get("id"),
            "event_slug": ev.get("slug") or "open-house-tnl",
            "event_title": ev.get("title", ""),
            "full_name": full_name or reg.get("email", ""),
            "nrp": nrp,
            "batch": batch,
            "motivation": motivation,
            "ig_proof_url": ig_proof,
            "email": reg.get("email", ""),
            "registration_id": reg_id,
        }

        async with httpx.AsyncClient(follow_redirects=True, timeout=15.0) as hc:
            r = await hc.post(webhook_url, json=payload)
            if r.status_code in (200, 201, 302):
                await db.registrations.update_one(
                    {"id": reg_id},
                    {"$set": {"sheet_synced": True, "sheet_sync_error": None, "sheet_synced_at": datetime.now(timezone.utc)}}
                )
            else:
                await db.registrations.update_one(
                    {"id": reg_id},
                    {"$set": {"sheet_synced": False, "sheet_sync_error": f"HTTP {r.status_code}: {r.text[:200]}"}}
                )
    except Exception as exc:
        await db.registrations.update_one(
            {"id": reg_id},
            {"$set": {"sheet_synced": False, "sheet_sync_error": str(exc)}}
        )


@router.post("/registrations/{event_id}")
async def submit_registration(event_id: str, request: Request):
    ev = await db.events.find_one({"$or": [{"id": event_id}, {"slug": event_id}], "status": "published"})
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found.")
    actual_event_id = ev["id"]

    today = today_iso()
    st = event_reg_status(ev, today)
    if st["reg_status"] not in ("open", "full"):
        raise HTTPException(status_code=400, detail=f"Registration is not open right now ({st['reg_status']}).")

    form = await request.form()
    if (form.get("company_website") or "").strip():
        raise HTTPException(status_code=400, detail="Spam detected.")

    turnstile_key = os.environ.get("TURNSTILE_SECRET_KEY", "")
    if turnstile_key:
        token = form.get("cf-turnstile-response") or ""
        async with httpx.AsyncClient(timeout=10) as hc:
            resp = await hc.post("https://challenges.cloudflare.com/turnstile/v0/siteverify",
                                 data={"secret": turnstile_key, "response": token,
                                       "remoteip": client_ip(request)})
        if not resp.json().get("success"):
            raise HTTPException(status_code=400, detail="Captcha verification failed. Please try again.")

    if form.get("consent") not in ("1", "true", "on"):
        raise HTTPException(status_code=422, detail="Consent is required to register (UU PDP).")

    # Count every attempt, not only successful ones, before any file is written to disk.
    rate_limit(f"regtry:{client_ip(request)}", 30, 3600)
    saved_uploads: list[str] = []

    data: dict = {}
    missing: list[str] = []
    errors: list[str] = []
    for f in ev.get("form_fields") or []:
        label = f.get("label", "")
        key = field_key(label)
        ftype = f.get("type", "text")
        if f.get("show_if_field"):
            ctrl_val = data.get(field_key(f["show_if_field"]))
            if ctrl_val != f.get("show_if_value"):
                continue
        raw = form.get(key) or form.get(f.get("name") or "")
        if ftype == "file":
            up = raw if (hasattr(raw, "filename") and hasattr(raw, "read")) else None
            if up is not None and getattr(up, "filename", ""):
                content = await up.read()
                if len(content) > 5 * 1024 * 1024:
                    errors.append(f"{label}: file must be under 5 MB.")
                    continue
                if not up.filename.lower().endswith(ALLOWED_UPLOAD_EXT):
                    errors.append(f"{label}: file type not allowed.")
                    continue
                if not _upload_header_ok(content, os.path.splitext(up.filename.lower())[1]):
                    errors.append(f"{label}: file content does not match its type.")
                    continue
                rel_url = _store_upload(content, up.filename, "reg")
                saved_uploads.append(rel_url)
                pub_url = (os.environ.get("PUBLIC_SITE_URL") or "https://labtnl.site").rstrip("/")
                abs_url = f"{pub_url}{rel_url}" if rel_url.startswith("/") else rel_url
                data[key] = {"url": rel_url, "absolute_url": abs_url, "name": up.filename}
            elif f.get("required"):
                missing.append(label)
            continue
        text = (raw or "").strip() if isinstance(raw, str) else ""
        if not text:
            if f.get("required"):
                missing.append(label)
            continue
        if ftype == "email" and not EMAIL_OK.match(text):
            errors.append(f"{label}: please enter a valid email address.")
        if ftype == "tel" and len(re.sub(r"\D", "", text)) < 8:
            errors.append(f"{label}: please enter a valid phone/WhatsApp number.")
        if (ftype == "nim" or "nrp" in key or "nim" in key) and text:
            clean_digits = re.sub(r"\D", "", text)
            if len(clean_digits) < 7:
                errors.append(f"{label}: NIM/NRP tidak valid (minimal 7 digit angka).")
        if ("motivation" in key or "motivasi" in key or "alasan" in key) and text:
            if len(text.strip()) < 15:
                errors.append(f"{label}: minimal 15 karakter.")
        data[key] = text

    if missing or errors:
        _discard_uploads(saved_uploads)
        raise HTTPException(status_code=422, detail={
            "message": "Please check the highlighted fields.",
            "missing": missing, "errors": errors,
        })

    email = next((v for k, v in data.items() if isinstance(v, str) and EMAIL_OK.match(v)), "")
    nim = next((v for k, v in data.items() if isinstance(v, str) and ("nim" in k or "nrp" in k)), "")
    if not email and nim:
        clean_nim = re.sub(r"\D", "", nim)
        email = f"{clean_nim}@student.its.ac.id"

    if email and await db.registrations.find_one({"event_id": actual_event_id, "email": email.lower()}):
        _discard_uploads(saved_uploads)
        raise HTTPException(status_code=409, detail="This email has already registered for this event.")
    if nim and await db.registrations.find_one({"event_id": actual_event_id, "nim": nim}):
        _discard_uploads(saved_uploads)
        raise HTTPException(status_code=409, detail="This NIM/NRP has already registered for this event.")

    try:
        rate_limit(f"reg:{client_ip(request)}", 8, 3600)
    except HTTPException:
        _discard_uploads(saved_uploads)
        raise

    cap = ev.get("capacity") or 0
    used = await db.registrations.count_documents(
        {"event_id": actual_event_id, "status": {"$in": ["pending", "accepted", "attended"]}})
    status = "waitlisted" if (cap and used >= cap) else "pending"

    now_utc = datetime.now(timezone.utc)
    reg = {
        "id": str(uuid.uuid4()), "event_id": actual_event_id, "event_title": ev.get("title", ""),
        "data": data, "email": email.lower(), "nim": nim, "status": status,
        "consent": True, "consent_timestamp": now_utc.isoformat(), "consent_policy_version": "2026.1",
        "certificate_code": None, "notes": "",
        "sheet_synced": False, "sheet_sync_error": None,
        "created_at": now_utc,
    }
    await db.registrations.insert_one(reg)

    webhook_url = ev.get("spreadsheet_webhook_url") or os.environ.get("OPEN_HOUSE_SHEET_WEBHOOK_URL")
    if webhook_url:
        import asyncio
        asyncio.create_task(_sync_registration_to_sheet(reg["id"], webhook_url, ev, reg))

    name = next((v for v in data.values() if isinstance(v, str) and 2 < len(v) < 80), email)
    state = {"pending": "received and pending review", "waitlisted": "placed on the waiting list"}[status]
    await send_email(
        email or "unknown@example.org",
        f"Registration received — {ev.get('title', '')}",
        f"<p>Hello {html_escape(str(name))},</p>"
        f"<p>Your registration for <b>{html_escape(ev.get('title', ''))}</b> has been {state}.</p>"
        f"<p>Telecommunication Network Laboratory — ITS</p>",
    )
    msg = ("Registration received. Please check your email for confirmation."
           if status == "pending" else "The event is full — you have been placed on the waiting list.")
    return {"ok": True, "status": status, "message": msg}


import unicodedata

# ---------------------------------------------------------------- certificates
def _pdf_safe(text: str) -> str:
    """The built-in PDF fonts are Latin-1 only; anything else (an em dash in an event title, a
    non-Latin name) would make fpdf2 raise and the download return a 500."""
    text = (text or "").replace("\u2014", "-").replace("\u2013", "-")
    text = text.replace("\u2018", "'").replace("\u2019", "'").replace("\u201c", '"').replace("\u201d", '"')
    normalized = unicodedata.normalize("NFKD", text)
    latin1 = normalized.encode("latin-1", "ignore").decode("latin-1").strip()
    return latin1 or "Participant"


def _participant_name(reg: dict) -> str:
    """Display name for a certificate. Never falls back to the e-mail address: /verify is public
    and anyone holding a code would otherwise read the participant's address."""
    for key, value in (reg.get("data") or {}).items():
        if ("name" in key or "nama" in key) and isinstance(value, str) and value.strip():
            return value.strip()
    return "Participant"


@router.get("/verify/{code}")
async def verify_certificate(code: str):
    reg = await db.registrations.find_one({"certificate_code": code.upper()})
    if not reg or reg.get("status") == "rejected" or not reg.get("certificate_code"):
        return {"valid": False, "message": "No valid certificate found for this code."}
    ev = await db.events.find_one({"id": reg.get("event_id")}) or {}
    return {
        "valid": True,
        "name": _participant_name(reg),
        "event_title": reg.get("event_title") or ev.get("title", ""),
        "event_date": ev.get("start_date") or "",
        "status": reg.get("status"),
        "code": reg.get("certificate_code"),
        "issued_at": reg.get("certificate_issued_at"),
        "message": "This certificate is valid and officially issued by Telecommunication Network Laboratory ITS.",
    }


@router.get("/certificates/{code}/pdf")
@router.get("/public/certificates/{code}/download")
async def certificate_pdf(code: str):
    reg = await db.registrations.find_one({"certificate_code": code.upper()})
    if not reg or reg.get("status") == "rejected" or not reg.get("certificate_code"):
        raise HTTPException(status_code=404, detail="Certificate not found.")
    try:
        import tempfile
        import qrcode
        from fpdf import FPDF
    except ImportError:
        raise HTTPException(status_code=501, detail="PDF generation needs fpdf2 and qrcode packages installed.")

    ev = await db.events.find_one({"id": reg.get("event_id")}) or {}
    s = await get_settings()

    name = _pdf_safe(_participant_name(reg))
    event_title = _pdf_safe(reg.get("event_title") or ev.get("title", "Laboratory Training & Workshop"))
    cert_code = reg.get("certificate_code", code.upper())
    base = os.environ.get("PUBLIC_SITE_URL") or os.environ.get("APP_URL") or "http://localhost:3000"
    base = base.rstrip("/")
    verify_url = f"{base}/verify/{cert_code}"

    # Generate QR Code into temporary file
    qr_img = qrcode.make(verify_url)
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_qr:
        qr_img.save(tmp_qr.name, format="PNG")
        tmp_qr_path = tmp_qr.name

    try:
        # A4 Landscape: 297mm x 210mm
        pdf = FPDF(orientation="L", format="A4", unit="mm")
        pdf.set_auto_page_break(auto=False)
        pdf.add_page()

        # Outer border: Forest Green (#43594A -> 67, 89, 74)
        pdf.set_draw_color(67, 89, 74)
        pdf.set_line_width(2.0)
        pdf.rect(10, 10, 277, 190)

        # Inner border: Gold / Tan (#A8977B -> 168, 151, 123)
        pdf.set_draw_color(168, 151, 123)
        pdf.set_line_width(0.8)
        pdf.rect(13, 13, 271, 184)

        # Corner corner accents
        pdf.rect(16, 16, 265, 178)

        # Official Laboratory Logo
        logo_path = Path(__file__).resolve().parent.parent / "assets" / "brand" / "tnl-logo-dark.png"
        if logo_path.is_file():
            # Emblem: 15mm x 15mm, centered at x = (297 - 15) / 2 = 141.0
            pdf.image(str(logo_path), x=141.0, y=19, w=15, h=15)

        # Institution headers
        pdf.set_y(36)
        pdf.set_font("helvetica", "B", 13)
        pdf.set_text_color(67, 89, 74)
        pdf.cell(0, 6, "INSTITUT TEKNOLOGI SEPULUH NOPEMBER", align="C", new_x="LMARGIN", new_y="NEXT")

        pdf.set_font("helvetica", "B", 10)
        pdf.set_text_color(115, 120, 125)
        pdf.cell(0, 5, "DEPARTEMEN TEKNIK ELEKTRO  ·  LABORATORIUM JARINGAN TELEKOMUNIKASI", align="C", new_x="LMARGIN", new_y="NEXT")

        pdf.set_font("helvetica", "", 8)
        pdf.cell(0, 4, "Gedung B Lantai 3 Ruang B-301, Kampus ITS Sukolilo, Surabaya 60111", align="C", new_x="LMARGIN", new_y="NEXT")

        # Decorative line
        pdf.set_y(53)
        pdf.set_draw_color(168, 151, 123)
        pdf.set_line_width(0.6)
        pdf.line(40, 53, 257, 53)

        # Title
        pdf.set_y(57)
        pdf.set_font("helvetica", "B", 24)
        pdf.set_text_color(17, 21, 24)
        pdf.cell(0, 12, "CERTIFICATE OF ACHIEVEMENT", align="C", new_x="LMARGIN", new_y="NEXT")

        pdf.set_font("helvetica", "I", 11)
        pdf.set_text_color(115, 120, 125)
        pdf.cell(0, 6, "This is to certify that", align="C", new_x="LMARGIN", new_y="NEXT")

        # Participant Name
        pdf.set_y(76)
        pdf.set_font("helvetica", "B", 26)
        pdf.set_text_color(67, 89, 74)
        pdf.cell(0, 14, name, align="C", new_x="LMARGIN", new_y="NEXT")

        # Participant Statement
        pdf.set_y(88)
        pdf.set_font("helvetica", "", 12)
        pdf.set_text_color(63, 66, 69)
        pdf.cell(0, 7, "has successfully completed and attended the laboratory program:", align="C", new_x="LMARGIN", new_y="NEXT")

        pdf.set_font("helvetica", "B", 16)
        pdf.set_text_color(17, 21, 24)
        pdf.cell(0, 10, f'"{event_title}"', align="C", new_x="LMARGIN", new_y="NEXT")

        event_date = ev.get("start_date") or today_iso()
        pdf.set_font("helvetica", "", 10)
        pdf.set_text_color(115, 120, 125)
        pdf.cell(0, 6, f"Organized by Telecommunication Network Laboratory on {event_date}", align="C", new_x="LMARGIN", new_y="NEXT")

        # Bottom section: QR Code (Left) & Signature Block (Right)
        qr_size = 28
        pdf.image(tmp_qr_path, x=30, y=134, w=qr_size, h=qr_size)

        pdf.set_xy(28, 164)
        pdf.set_font("helvetica", "", 7)
        pdf.set_text_color(115, 120, 125)
        pdf.cell(32, 4, "Scan to verify authenticity", align="C")

        # Right side: Signatures
        pdf.set_xy(180, 130)
        pdf.set_font("helvetica", "", 10)
        pdf.set_text_color(63, 66, 69)
        pdf.cell(85, 5, f"Surabaya, {event_date[:4] if len(event_date) >= 4 else '2026'}", align="C", new_x="LMARGIN", new_y="NEXT")

        pdf.set_x(180)
        pdf.set_font("helvetica", "", 10)
        pdf.cell(85, 5, "Head of Laboratory,", align="C", new_x="LMARGIN", new_y="NEXT")

        pdf.set_y(158)
        pdf.set_x(180)
        pdf.set_font("helvetica", "B", 11)
        pdf.set_text_color(17, 21, 24)
        pdf.cell(85, 5, "Dr. Ir. Achmad Affandi, DEA.", align="C", new_x="LMARGIN", new_y="NEXT")

        pdf.set_x(180)
        pdf.set_font("helvetica", "", 9)
        pdf.set_text_color(115, 120, 125)
        pdf.cell(85, 4, "NIP. 196404171989031002", align="C", new_x="LMARGIN", new_y="NEXT")

        # Bottom footer bar with certificate code
        pdf.set_y(184)
        pdf.set_font("helvetica", "", 8)
        pdf.set_text_color(115, 120, 125)
        pdf.cell(0, 5, f"Official Certificate No: {cert_code}  ·  Verification: {verify_url}", align="C")

        pdf_bytes = bytes(pdf.output())
    finally:
        if os.path.exists(tmp_qr_path):
            try:
                os.remove(tmp_qr_path)
            except Exception:
                pass

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="tnl-certificate-{cert_code}.pdf"'},
    )

