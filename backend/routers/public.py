"""Public, unauthenticated reads (maintenance-aware) + contact inbox submission +
event registration engine + certificate verification."""

import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator
from pymongo.errors import DuplicateKeyError

from lib.auth import client_ip, lab_assistant_for_request, sign_upload, user_for_request
from lib.cache import cached_public_json, invalidate_public_cache
from lib.rate_limit import rate_limit_async
from lib.practicum_access import public_practicum_doc
from lib.db import db
from lib.dates import today_iso
from lib.registration_forms import field_key, validate_registration_form
from lib.registration_integrity import normalize_email, normalize_nim
from lib.registration_workflow import event_ledger, change_registration, queue_registration_notifications, OCCUPIED
from lib.publishing import public_content_projection, public_page_projection
from lib.privacy import registration_data_is_servable
from lib.quality import EMAIL_OK
from lib.serialize import jsonable
from lib.settings import get_settings
from models.core import ThemeTokens

router = APIRouter(tags=["public"])

# Fields that must never leave the server through the public event endpoints. The sheet webhook
# is a write credential: anyone holding it can append rows to the registrant spreadsheet.
# The WhatsApp group invite URL must only be revealed upon successful registration.
EVENT_PRIVATE_PROJECTION = {"whatsapp_group_url": 0, "spreadsheet_webhook_url": 0}


async def check_maintenance(request: Request) -> None:
    s = await get_settings()
    if s.get("maintenance_mode"):
        user = await user_for_request(request)
        if not user:
            raise HTTPException(status_code=503, detail="The site is in maintenance mode. Please try again soon.")


def _compute_event_availability(ev: dict, registered_count: int, today: str | None = None) -> dict:
    if today is None:
        today = today_iso()

    cap = int(ev.get("capacity") or 0)
    is_full = bool(cap > 0 and registered_count >= cap)
    spots_left = max(0, cap - registered_count) if cap > 0 else None

    # Dates
    open_d = (ev.get("reg_open_date") or "").strip()
    close_d = (ev.get("registration_deadline") or ev.get("reg_close_date") or "").strip()
    end_d = (ev.get("end_date") or ev.get("start_date") or "").strip()

    is_past = bool(end_d and today > end_d)
    is_deadline_passed = bool(close_d and today > close_d)
    is_upcoming = bool(open_d and today < open_d)
    manual_closed = ev.get("registration_open") is False

    # Detailed reason
    if manual_closed:
        closed_reason = "closed"
    elif is_past:
        closed_reason = "past"
    elif is_upcoming:
        closed_reason = "upcoming"
    elif is_full:
        closed_reason = "full"
    elif is_deadline_passed:
        closed_reason = "deadline"
    else:
        closed_reason = None

    registration_closed = bool(closed_reason in ("closed", "past", "upcoming", "full", "deadline"))

    if is_past:
        reg_status = "past"
    elif manual_closed or is_deadline_passed:
        reg_status = "closed"
    elif is_upcoming:
        reg_status = "upcoming"
    elif is_full:
        reg_status = "full"
    elif open_d and today >= open_d:
        reg_status = "open"
    else:
        reg_status = "open"

    return {
        "reg_status": reg_status,
        "is_full": is_full,
        "is_deadline_passed": is_deadline_passed,
        "registration_closed": registration_closed,
        "closed_reason": closed_reason,
        "registered_count": registered_count,
        "seats_left": spots_left,
        "spots_left": spots_left,
        "waitlist_open": not (manual_closed or is_past or is_upcoming or is_deadline_passed),
    }


def event_reg_status(ev: dict, today: str) -> dict:
    return _compute_event_availability(ev, 0, today)


async def with_seats(evs: list[dict], today: str) -> list[dict]:
    for ev in evs:
        ledger = await event_ledger(ev["id"])
        used = sum(entry["status"] in OCCUPIED for entry in ledger["entries"])
        avail = _compute_event_availability(ev, used, today)
        ev.update(avail)
    return evs


# ---------------------------------------------------------------- reads
@router.get("/public/settings", dependencies=[Depends(check_maintenance)])
async def public_settings(response: Response):
    async def _load():
        s = await get_settings()
        published_theme = (s.get("theme") or {}).get("published") or s.get("theme_tokens") or ThemeTokens().model_dump()
        # Explicit allowlist: never expose the whole settings document (Figma token
        # hashes/prefixes, retention policy, internal identifiers, audit metadata, ...).
        public_fields = (
            "site_title", "site_title_id", "short_name", "logo_url", "logo_url_dark",
            "its_logo_url", "contact", "social", "seo", "focus_areas",
            "language_default", "analytics_snippet", "maintenance_mode", "announcement",
        )
        out = {key: s.get(key) for key in public_fields}
        out["theme_tokens"] = published_theme
        out["theme_published"] = True
        out["server_today"] = today_iso()
        return jsonable(out)
    data, hit = await cached_public_json("settings", {"route": "settings"}, _load)
    response.headers["X-Cache"] = "HIT" if hit else "MISS"
    return data


@router.get("/public/stats", dependencies=[Depends(check_maintenance)])
async def public_stats(response: Response):
    async def _load():
        s = await get_settings()
        lecturers = await db.members.count_documents({"role": "lecturer", "published": True})
        assistants = await db.members.count_documents({"role": "assistant", "status": "active", "published": True})
        return {
            "lecturers": lecturers,
            "assistants": assistants,
            "research_tracks": len(s.get("focus_areas") or []),
            "room": (s.get("contact") or {}).get("room", "B-301"),
        }
    data, hit = await cached_public_json("stats", {"route": "stats"}, _load)
    response.headers["X-Cache"] = "HIT" if hit else "MISS"
    return data


@router.get("/public/pages/{slug}", dependencies=[Depends(check_maintenance)])
async def public_page(slug: str, response: Response):
    async def _load():
        page = await db.pages.find_one({"slug": slug, "status": "published"})
        if not page:
            raise HTTPException(status_code=404, detail="Page not found.")
        return jsonable(public_page_projection(page))
    data, hit = await cached_public_json("pages", {"slug": slug}, _load)
    response.headers["X-Cache"] = "HIT" if hit else "MISS"
    return data


@router.get("/public/members", dependencies=[Depends(check_maintenance)])
async def public_members(response: Response, status: str | None = None, batch: str | None = None):
    async def _load():
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
        return jsonable([public_content_projection(d) for d in out])
    data, hit = await cached_public_json("members", {"status": status, "batch": batch}, _load)
    response.headers["X-Cache"] = "HIT" if hit else "MISS"
    return data


@router.get("/public/posts", dependencies=[Depends(check_maintenance)])
async def public_posts(response: Response, category: str | None = None, q: str | None = None, tag: str | None = None,
                       limit: int = Query(24, ge=1, le=50), offset: int = Query(0, ge=0)):
    async def _load():
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
        return {"items": jsonable(brief), "total": total, "categories": [c for c in all_categories if c],
                "limit": limit, "offset": offset, "has_more": offset + len(brief) < total}
    data, hit = await cached_public_json(
        "posts", {"route": "list", "category": category, "q": q, "tag": tag, "limit": limit, "offset": offset}, _load
    )
    response.headers["X-Cache"] = "HIT" if hit else "MISS"
    return data


@router.get("/public/posts/{slug}", dependencies=[Depends(check_maintenance)])
async def public_post(slug: str, response: Response):
    async def _load():
        post = await db.posts.find_one({"slug": slug, "status": "published"})
        if not post:
            raise HTTPException(status_code=404, detail="Article not found.")
        related = await db.posts.find(
            {"status": "published", "slug": {"$ne": slug}, "category": post.get("category")}
        ).sort("published_at", -1).limit(3).to_list(3)
        post["related"] = [{k: r.get(k) for k in ("id", "slug", "title", "title_id", "cover_url", "cover_alt",
                                                  "category", "published_at")} for r in related]
        return jsonable(public_content_projection(post))
    data, hit = await cached_public_json("posts", {"route": "detail", "slug": slug}, _load)
    response.headers["X-Cache"] = "HIT" if hit else "MISS"
    return data


@router.get("/public/events", dependencies=[Depends(check_maintenance)])
async def public_events(response: Response, type: str | None = None, include_past: bool = True):
    async def _load():
        q: dict = {"status": "published"}
        if type:
            q["type"] = type
        docs = await db.events.find(q, EVENT_PRIVATE_PROJECTION).sort([("start_date", 1)]).to_list(200)
        today = today_iso()
        if not include_past:
            docs = [d for d in docs if event_reg_status(d, today)["reg_status"] != "past"]
        return jsonable([public_content_projection(d) for d in await with_seats(docs, today)])
    data, hit = await cached_public_json("events", {"route": "list", "type": type, "include_past": include_past}, _load, ttl_seconds=15)
    response.headers["X-Cache"] = "HIT" if hit else "MISS"
    return data


@router.get("/public/events/{slug}", dependencies=[Depends(check_maintenance)])
async def public_event(slug: str, response: Response):
    async def _load():
        ev = await db.events.find_one({"$or": [{"slug": slug}, {"id": slug}], "status": "published"},
                                      EVENT_PRIVATE_PROJECTION)
        if not ev:
            raise HTTPException(status_code=404, detail="Event not found.")
        return jsonable(public_content_projection((await with_seats([ev], today_iso()))[0]))
    data, hit = await cached_public_json("events", {"route": "detail", "slug": slug}, _load, ttl_seconds=15)
    response.headers["X-Cache"] = "HIT" if hit else "MISS"
    return data


@router.get("/public/activities", dependencies=[Depends(check_maintenance)])
async def public_activities(response: Response, category: str | None = None):
    async def _load():
        q: dict = {"published": True}
        if category:
            q["category"] = category
        docs = await db.activities.find(q).sort([("order", 1), ("date", -1)]).to_list(200)
        return jsonable([public_content_projection(d) for d in docs])
    data, hit = await cached_public_json("activities", {"category": category}, _load)
    response.headers["X-Cache"] = "HIT" if hit else "MISS"
    return data


@router.get("/public/projects", dependencies=[Depends(check_maintenance)])
async def public_projects(response: Response, kind: str | None = None):
    async def _load():
        q: dict = {"status": "published"}
        if kind in ("rd", "social"):
            q["kind"] = kind
        docs = await db.projects.find(q).sort([("year", -1), ("created_at", -1)]).to_list(200)
        return jsonable([public_content_projection(d) for d in docs])
    data, hit = await cached_public_json("projects", {"kind": kind}, _load)
    response.headers["X-Cache"] = "HIT" if hit else "MISS"
    return data


@router.get("/public/publications", dependencies=[Depends(check_maintenance)])
async def public_publications(response: Response, year: int | None = None, ptype: str | None = None, member_id: str | None = None):
    async def _load():
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
        return jsonable([public_content_projection(d) for d in docs])
    data, hit = await cached_public_json("publications", {"year": year, "ptype": ptype, "member_id": member_id}, _load)
    response.headers["X-Cache"] = "HIT" if hit else "MISS"
    return data


@router.get("/public/partners", dependencies=[Depends(check_maintenance)])
async def public_partners(response: Response):
    async def _load():
        docs = await db.partners.find({"published": True}).sort([("order", 1)]).to_list(100)
        return jsonable([public_content_projection(d) for d in docs])
    data, hit = await cached_public_json("partners", {"route": "list"}, _load)
    response.headers["X-Cache"] = "HIT" if hit else "MISS"
    return data


@router.get("/public/practicum", dependencies=[Depends(check_maintenance)])
async def public_practicum(request: Request):
    """Public practicum catalog (never cached: role-dependent module access).

    The curriculum (code, title, semester, summary, cover image, module count) is public so a
    visitor can read what the laboratory teaches. Download URLs and shift schedules are not:
    they are only attached for a signed-in laboratory assistant, and every response carries the
    `can_access_modules` flag so the client can render the locked state without guessing.
    """
    docs = await db.practicum.find({"published": True}).sort([("order", 1)]).to_list(100)
    can_access = await lab_assistant_for_request(request) is not None
    return [public_practicum_doc(jsonable(public_content_projection(doc)), can_access) for doc in docs]


@router.get("/public/equipment", dependencies=[Depends(check_maintenance)])
async def public_equipment(response: Response, category: str | None = None, status: str | None = None):
    async def _load():
        q: dict = {"published": True}
        if category:
            q["category"] = category
        if status:
            q["status"] = status
        docs = await db.equipment.find(
            q,
            {"serial_number": 0, "asset_code": 0, "internal_notes": 0, "needs_review": 0, "issues": 0}
        ).sort([("order", 1), ("created_at", -1)]).to_list(200)
        return jsonable([public_content_projection(d) for d in docs])
    data, hit = await cached_public_json("equipment", {"category": category, "status": status}, _load)
    response.headers["X-Cache"] = "HIT" if hit else "MISS"
    return data


@router.get("/public/collections", dependencies=[Depends(check_maintenance)])
async def public_collections(response: Response):
    async def _load():
        definitions = await db.collections_def.find({}).sort("name", 1).to_list(100)
        return [{k: definition.get(k) for k in ("key", "name", "fields", "template")} for definition in definitions]
    data, hit = await cached_public_json("collections", {"route": "list"}, _load)
    response.headers["X-Cache"] = "HIT" if hit else "MISS"
    return data


@router.get("/public/collections/{key}", dependencies=[Depends(check_maintenance)])
async def public_collection(key: str, response: Response, limit: int = Query(24, ge=1, le=100), offset: int = Query(0, ge=0)):
    async def _load():
        definition = await db.collections_def.find_one({"key": key})
        if not definition:
            raise HTTPException(404, "Collection not found.")
        query = {"collection_key": key, "status": "published"}
        total = await db.collection_items.count_documents(query)
        rows = await db.collection_items.find(query).sort([("created_at", -1), ("id", 1)]).skip(offset).limit(limit).to_list(limit)
        fields = {"id", "collection_key", "values", "status", "created_at", "updated_at"}
        return jsonable({"definition": {k: definition.get(k) for k in ("key", "name", "fields", "template")},
                         "items": [{k: v for k, v in public_content_projection(row).items() if k in fields} for row in rows],
                         "total": total, "offset": offset, "limit": limit, "has_more": offset + len(rows) < total})
    data, hit = await cached_public_json("collections", {"route": "detail", "key": key, "limit": limit, "offset": offset}, _load)
    response.headers["X-Cache"] = "HIT" if hit else "MISS"
    return data


# ---------------------------------------------------------------- contact inbox
class ContactIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: str = Field(min_length=3, max_length=254)
    subject: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=5000)
    company_website: str = ""  # honeypot

    @field_validator("name", "email", "subject", "message", mode="before")
    @classmethod
    def strip_text(cls, value):
        return value.strip() if isinstance(value, str) else value


@router.post("/contact")
async def submit_contact(payload: ContactIn, request: Request):
    await rate_limit_async("contact", f"contact:{client_ip(request)}", 5, 3600)
    if payload.company_website.strip():
        raise HTTPException(status_code=400, detail="Spam detected.")
    if not EMAIL_OK.fullmatch(payload.email):
        raise HTTPException(status_code=422, detail="Please enter a valid email address.")
    await db.messages.insert_one({
        "id": str(uuid.uuid4()), "name": payload.name.strip(), "email": payload.email.strip(),
        "subject": payload.subject.strip()[:200], "body": payload.message.strip()[:5000],
        "status": "new", "created_at": datetime.now(timezone.utc),
    })
    return {"ok": True, "message": "Thank you — your message has been received."}


# ---------------------------------------------------------------- registration engine
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


@router.post("/registrations/{event_id}")
async def submit_registration(event_id: str, request: Request):
    ev = await db.events.find_one({"$or": [{"id": event_id}, {"slug": event_id}], "status": "published"})
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found.")
    actual_event_id = ev["id"]

    today = today_iso()
    avail = _compute_event_availability(ev, 0, today)
    if avail["is_deadline_passed"]:
        raise HTTPException(status_code=409, detail="Batas waktu pendaftaran sudah berakhir.")
    if not avail["waitlist_open"]:
        raise HTTPException(status_code=400, detail=f"Registration is not open right now ({avail['reg_status']}).")

    form = await request.form(max_files=20, max_fields=110)
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
    await rate_limit_async("registration_try", f"regtry:{client_ip(request)}", 30, 3600)
    data, uploads = await validate_registration_form(ev.get("form_fields") or [], form, _upload_header_ok)
    email = next((v for k, v in data.items() if isinstance(v, str) and EMAIL_OK.match(v)), "")
    nim = next((data.get(field_key(f.get("label", "")), "") for f in ev.get("form_fields") or []
                if f.get("type") == "nim" or "nim" in field_key(f.get("label", ""))
                or "nrp" in field_key(f.get("label", ""))), "")
    if not email and nim:
        clean_nim = re.sub(r"\D", "", nim)
        email = f"{clean_nim}@student.its.ac.id"

    email, nim = normalize_email(email), normalize_nim(nim)
    await rate_limit_async("registration", f"reg:{client_ip(request)}", 8, 3600)
    await event_ledger(actual_event_id)
    now_utc = datetime.now(timezone.utc)
    reg = {
        "id": str(uuid.uuid4()), "event_id": actual_event_id, "event_title": ev.get("title", ""),
        "data": data, "email": email, "nim": nim, "status": "processing",
        "email_normalized": email, "nim_normalized": nim,
        "consent": True, "consent_timestamp": now_utc.isoformat(), "consent_policy_version": "2026.1",
        "notes": "",  # certificate_code/certificate_issued_at are added on check-in + issue only
        "created_at": now_utc,
    }
    # Persist attachment intent before writing bytes. A crash leaves a durable
    # processing row for the worker, rather than an unreferenced private file.
    for key, filename, content in uploads:
        safe = re.sub(r"[^A-Za-z0-9._-]", "_", filename)[-80:]
        name = f"reg_{uuid.uuid4().hex}_{safe}"
        rel = f"/api/media-files/uploads/{name}?sig={sign_upload(name)}"
        base = (os.environ.get("PUBLIC_SITE_URL") or "https://labtnl.site").rstrip("/")
        data[key] = {"url": rel, "absolute_url": base + rel, "name": filename}
    reg["uploads_ready"] = not uploads
    try:
        await db.registrations.insert_one(reg)
    except DuplicateKeyError:
        raise HTTPException(409, "This email or NIM/NRP has already registered for this event.")
    try:
        for key, _, content in uploads:
            name = data[key]["url"].split("?")[0].rsplit("/", 1)[-1]
            path = Path(os.environ.get("MEDIA_DIR", "/app/backend/media")) / "uploads" / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
        ready = await db.registrations.update_one({"id": reg["id"], "privacy_pending": {"$ne": True},
            "anonymized": {"$ne": True}}, {"$set": {"uploads_ready": True}})
    except Exception:
        from lib.privacy import request_erasure
        await request_erasure(reg["id"], delete=True)
        raise HTTPException(503, "Attachment storage failed; please retry.")
    if not ready.matched_count:
        from lib.privacy import delete_private_upload, request_erasure
        for key, _, _ in uploads:
            name = data[key]["url"].split("?")[0].rsplit("/", 1)[-1]
            delete_private_upload("uploads/" + name)
        await request_erasure(reg["id"], delete=True)
        raise HTTPException(409, "This registration was withdrawn while submitting.")
    ledger = await change_registration(actual_event_id, reg["id"], add=True)
    await invalidate_public_cache("events")
    state = next(entry["status"] for entry in ledger["entries"] if entry["id"] == reg["id"])
    await queue_registration_notifications(ledger)
    notification = await db.outbox.find_one({"id": f"registration:{reg['id']}:{state}"}, {"id": 1, "status": 1})
    msg = ("Pendaftaran berhasil diterima dan dikonfirmasi." if state == "accepted"
           else "Kuota penuh. Pendaftaran Anda masuk daftar tunggu.")
    response_payload: dict[str, Any] = {"ok": True, "id": reg["id"], "status": state, "message": msg,
                                        "notification": {"id": notification["id"], "status": notification["status"]} if notification else None}
    wa_url = (ev.get("whatsapp_group_url") or "").strip()
    if state == "accepted" and wa_url.startswith("https://"):
        response_payload["whatsapp_group_url"] = wa_url
    return response_payload


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
async def verify_certificate(code: str, request: Request):
    await rate_limit_async("cert_verify", f"cert-verify:{client_ip(request)}", 30, 300)
    reg = await db.registrations.find_one({"certificate_code": code.upper()})
    if (not reg or not await registration_data_is_servable(reg)
            or reg.get("status") != "attended" or not reg.get("certificate_code")
            or not reg.get("certificate_issued_at")):
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
    if (not reg or not await registration_data_is_servable(reg)
            or reg.get("status") != "attended" or not reg.get("certificate_code")
            or not reg.get("certificate_issued_at")):
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

