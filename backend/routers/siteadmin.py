"""Admin: page builder (blocks, reorder, duplicate, hide, revisions, restore,
publish behind quality gates) + global settings + theme token editor with a
WCAG-AA contrast check that blocks publishing an unreadable theme."""

import re
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from lib.auth import allowed, audit, principal, require
from lib.cache import invalidate_public_cache
from lib.db import db
from lib.quality import publish_blockers, run_scan
from lib.publishing import (
    admin_document, editorial_document, public_page_projection, replace_editorial,
    sanitize_block, sanitize_blocks,
)
from lib.serialize import jsonable
from lib.settings import get_settings
from models.content import PageDoc
from models.core import BlockAdd, BlockPatch, PagePatch, PageUpsert, ReorderIn, SettingsUpdate, ThemeTokens

router = APIRouter(prefix="/admin", tags=["pages-settings"])

def _sanitize_props(block: dict) -> dict:
    return sanitize_block(block)


async def _get_page(page_id: str) -> dict:
    page = await db.pages.find_one({"id": page_id})
    if not page:
        raise HTTPException(status_code=404, detail="Page not found.")
    view = admin_document(page)
    view["_cms_version"] = page.get("_cms_version")
    return view


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-") or "page"


async def _save_page(page: dict, request: Request, *, publish: bool = False, unpublish: bool = False) -> dict:
    """Save a working version without replacing the approved live version."""
    current = await db.pages.find_one({"id": page["id"]})
    if not current:
        raise HTTPException(404, detail="Page not found.")
    if current.get("_cms_version") != page.get("_cms_version"):
        raise HTTPException(409, detail="This page changed in another session. Reload before saving.")
    actor = getattr(request.state, "user", None) or {}
    if (publish or unpublish) and not allowed(principal(actor), "pages:publish"):
        raise HTTPException(403, detail="Your role cannot publish or unpublish pages.")
    page["blocks"] = sanitize_blocks(page.get("blocks", []))
    issues = run_scan("pages", {"title": page.get("title"), "title_id": page.get("title_id"),
                               "meta_description": page.get("meta_description"), "meta_description_id": page.get("meta_description_id"),
                               "blocks": page["blocks"]})
    page["issues"] = issues
    page["needs_review"] = bool(publish_blockers(issues))
    if publish and page["needs_review"]:
        raise HTTPException(422, detail={"message": "This page cannot be published until these issues are fixed.", "issues": publish_blockers(issues)})
    updated = editorial_document(current, page, actor.get("email", ""), publish=publish, unpublish=unpublish)
    await replace_editorial(db.pages, current, updated)
    await invalidate_public_cache("pages")
    page.clear()
    page.update(admin_document(updated))
    return page


# ---------------------------------------------------------------- pages
@router.get("/pages", dependencies=[Depends(require("content:read"))])
async def list_pages():
    docs = await db.pages.find({}, {"revisions": 0}).sort("created_at", 1).to_list(200)
    return {"items": jsonable([{k: v for k, v in admin_document(d).items() if k != "revisions"} for d in docs])}


@router.get("/pages/{page_id}", dependencies=[Depends(require("content:read"))])
async def get_page(page_id: str):
    return jsonable({k: v for k, v in (await _get_page(page_id)).items() if not k.startswith("_")})


@router.get("/pages/{page_id}/preview", dependencies=[Depends(require("pages:edit"))])
async def preview_page(page_id: str, response: Response):
    response.headers["Cache-Control"] = "private, no-store, max-age=0"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    return jsonable(public_page_projection(await _get_page(page_id)))


@router.post("/pages", status_code=201, dependencies=[Depends(require("pages:edit"))])
async def create_page(payload: PageUpsert, request: Request):
    slug = slugify(payload.slug or payload.title)
    if await db.pages.find_one({"slug": slug}):
        raise HTTPException(status_code=409, detail="A page with this web address already exists.")
    page = PageDoc(slug=slug, title=payload.title, title_id=payload.title_id, status="draft").model_dump()
    page.update({"meta_description": getattr(payload, "meta_description", None),
                 "meta_description_id": getattr(payload, "meta_description_id", None)})
    await db.pages.insert_one(page)
    await invalidate_public_cache("pages")
    await audit(request, "create", "pages", page["id"], {"slug": slug})
    return jsonable(page)


@router.patch("/pages/{page_id}", dependencies=[Depends(require("pages:edit"))])
async def patch_page(page_id: str, payload: PagePatch, request: Request):
    page = await _get_page(page_id)
    patch = payload.model_dump(exclude_unset=True)
    if "status" in patch and patch["status"] not in {"draft", "published"}:
        raise HTTPException(422, detail="Status must be draft or published.")
    if "title" in patch and (not isinstance(patch["title"], str) or not patch["title"].strip()):
        raise HTTPException(422, detail="A page title is required.")
    page.update(patch)
    await _save_page(page, request, publish=patch.get("status") == "published", unpublish=patch.get("status") == "draft")
    await audit(request, "update", "pages", page_id, patch)
    return jsonable(page)


@router.delete("/pages/{page_id}", dependencies=[Depends(require("content:delete"))])
async def delete_page(page_id: str, request: Request):
    page = await _get_page(page_id)
    if page.get("is_system"):
        raise HTTPException(status_code=400, detail="Built-in pages cannot be deleted. You can unpublish them instead.")
    await db.pages.delete_one({"id": page_id})
    await invalidate_public_cache("pages")
    await audit(request, "delete", "pages", page_id, {"slug": page.get("slug")})
    return {"ok": True}


# ---------------------------------------------------------------- blocks
@router.post("/pages/{page_id}/blocks", status_code=201, dependencies=[Depends(require("pages:edit"))])
async def add_block(page_id: str, payload: BlockAdd, request: Request):
    page = await _get_page(page_id)
    block = sanitize_block({"type": payload.type, "props": payload.props})
    page.setdefault("blocks", []).append(block)
    await _save_page(page, request)
    await audit(request, "add-block", "pages", page_id, {"type": payload.type})
    return jsonable(page)


@router.patch("/pages/{page_id}/blocks/{block_id}", dependencies=[Depends(require("pages:edit"))])
async def patch_block(page_id: str, block_id: str, payload: BlockPatch, request: Request):
    page = await _get_page(page_id)
    blocks = page.get("blocks", [])
    target = next((b for b in blocks if b.get("id") == block_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Block not found.")
    patch = payload.model_dump(exclude_unset=True)
    if "props" in patch and patch["props"] is not None:
        target["props"] = patch["props"]
        target.update(sanitize_block(target))
    if "hidden" in patch and patch["hidden"] is not None:
        target["hidden"] = patch["hidden"]
    await _save_page(page, request)
    await audit(request, "update-block", "pages", page_id, {"block": block_id})
    return jsonable(page)


@router.post("/pages/{page_id}/blocks/{block_id}/duplicate", dependencies=[Depends(require("pages:edit"))])
async def duplicate_block(page_id: str, block_id: str, request: Request):
    page = await _get_page(page_id)
    blocks = page.get("blocks", [])
    idx = next((i for i, b in enumerate(blocks) if b.get("id") == block_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Block not found.")
    copy = dict(blocks[idx])
    copy["id"] = str(uuid4())
    blocks.insert(idx + 1, copy)
    await _save_page(page, request)
    await audit(request, "duplicate-block", "pages", page_id, {"block": block_id})
    return jsonable(page)


@router.delete("/pages/{page_id}/blocks/{block_id}", dependencies=[Depends(require("pages:edit"))])
async def delete_block(page_id: str, block_id: str, request: Request):
    page = await _get_page(page_id)
    before = len(page.get("blocks", []))
    page["blocks"] = [b for b in page.get("blocks", []) if b.get("id") != block_id]
    if len(page["blocks"]) == before:
        raise HTTPException(status_code=404, detail="Block not found.")
    await _save_page(page, request)
    await audit(request, "delete-block", "pages", page_id, {"block": block_id})
    return jsonable(page)


@router.post("/pages/{page_id}/reorder", dependencies=[Depends(require("pages:edit"))])
async def reorder_blocks(page_id: str, payload: ReorderIn, request: Request):
    page = await _get_page(page_id)
    by_id = {b.get("id"): b for b in page.get("blocks", [])}
    if len(payload.order) != len(by_id) or set(payload.order) != set(by_id.keys()):
        raise HTTPException(status_code=422, detail="The new order must list every block exactly once.")
    page["blocks"] = [by_id[bid] for bid in payload.order]
    await _save_page(page, request)
    await audit(request, "reorder-blocks", "pages", page_id)
    return jsonable(page)


# ---------------------------------------------------------------- revisions
@router.get("/pages/{page_id}/revisions", dependencies=[Depends(require("content:read"))])
async def list_revisions(page_id: str):
    page = await _get_page(page_id)
    revs = [{"id": r.get("id"), "saved_at": r.get("saved_at"), "saved_by": r.get("saved_by"),
             "title": r.get("title"), "block_count": len(r.get("blocks", []))}
            for r in reversed(page.get("revisions", []))]
    return {"items": jsonable(revs)}


@router.post("/pages/{page_id}/revisions/{revision_id}/restore", dependencies=[Depends(require("pages:edit"))])
async def restore_revision(page_id: str, revision_id: str, request: Request):
    page = await _get_page(page_id)
    rev = next((r for r in page.get("revisions", []) if r.get("id") == revision_id), None)
    if not rev:
        raise HTTPException(status_code=404, detail="Revision not found.")
    page["title"] = rev.get("title", page.get("title"))
    page["title_id"] = rev.get("title_id", page.get("title_id"))
    for field in ("meta_description", "meta_description_id"):
        if field in rev:
            page[field] = rev[field]
    page["blocks"] = [dict(b) for b in rev.get("blocks", [])]
    await _save_page(page, request)
    await audit(request, "restore-revision", "pages", page_id, {"revision": revision_id})
    return jsonable(page)


# ---------------------------------------------------------------- saved (reusable) blocks
@router.get("/saved-blocks", dependencies=[Depends(require("content:read"))])
async def list_saved_blocks():
    docs = await db.saved_blocks.find({}).sort("created_at", -1).to_list(200)
    return {"items": jsonable(docs)}


@router.post("/saved-blocks", status_code=201, dependencies=[Depends(require("pages:edit"))])
async def save_block(payload: dict, request: Request):
    name = payload.get("name")
    block = payload.get("block") or {}
    if not isinstance(name, str) or not name.strip() or not isinstance(block, dict) or not block.get("type"):
        raise HTTPException(status_code=422, detail="A name and a block are required.")
    doc = {"id": str(uuid4()), "name": name.strip(), "block": _sanitize_props(dict(block)),
           "created_at": datetime.now(timezone.utc)}
    await db.saved_blocks.insert_one(doc)
    await audit(request, "create", "saved_blocks", doc["id"], {"name": name})
    return jsonable(doc)


@router.get("/saved-blocks/{block_id}", dependencies=[Depends(require("content:read"))])
async def get_saved_block(block_id: str):
    doc = await db.saved_blocks.find_one({"id": block_id})
    if not doc:
        raise HTTPException(404, detail="Saved block not found.")
    return jsonable(doc)


@router.put("/saved-blocks/{block_id}", dependencies=[Depends(require("pages:edit"))])
@router.patch("/saved-blocks/{block_id}", dependencies=[Depends(require("pages:edit"))])
async def update_saved_block(block_id: str, payload: dict, request: Request):
    current = await db.saved_blocks.find_one({"id": block_id})
    if not current:
        raise HTTPException(404, detail="Saved block not found.")
    name = payload.get("name", current.get("name"))
    if not isinstance(name, str) or not name.strip():
        raise HTTPException(422, detail="A saved block name is required.")
    block = sanitize_block(payload.get("block", current["block"]))
    await db.saved_blocks.update_one({"id": block_id}, {"$set": {"name": name.strip(), "block": block, "updated_at": datetime.now(timezone.utc)}})
    await audit(request, "update", "saved_blocks", block_id)
    return jsonable(await db.saved_blocks.find_one({"id": block_id}))


@router.post("/pages/{page_id}/saved-blocks/{block_id}", dependencies=[Depends(require("pages:edit"))])
async def insert_saved_block(page_id: str, block_id: str, request: Request):
    saved = await db.saved_blocks.find_one({"id": block_id})
    if not saved:
        raise HTTPException(404, detail="Saved block not found.")
    page = await _get_page(page_id)
    block = sanitize_block({**saved["block"], "id": str(uuid4())})
    page.setdefault("blocks", []).append(block)
    await _save_page(page, request)
    await audit(request, "insert-saved-block", "pages", page_id, {"saved_block": block_id})
    return jsonable(page)


@router.delete("/saved-blocks/{block_id}", dependencies=[Depends(require("pages:edit"))])
async def delete_saved_block(block_id: str, request: Request):
    res = await db.saved_blocks.delete_one({"id": block_id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Saved block not found.")
    await audit(request, "delete", "saved_blocks", block_id)
    return {"ok": True}


# ---------------------------------------------------------------- settings
@router.get("/settings", dependencies=[Depends(require("settings:read"))])
async def admin_settings():
    return jsonable(await get_settings())


@router.put("/settings", dependencies=[Depends(require("settings:write"))])
async def update_settings(payload: SettingsUpdate, request: Request):
    patch = payload.model_dump(exclude_unset=True)
    if "analytics_snippet" in patch and patch["analytics_snippet"]:
        patch["analytics_snippet"] = patch["analytics_snippet"][:4000]
    if patch.get("announcement"):
        current = await get_settings()
        prev = (current.get("announcement") or {}).get("version", 0)
        patch["announcement"]["version"] = prev + 1
    patch["updated_at"] = datetime.now(timezone.utc)
    await db.settings.update_one({"id": "settings"}, {"$set": patch}, upsert=True)
    await invalidate_public_cache("settings", "stats")
    await audit(request, "update", "settings", "settings", {"keys": list(patch.keys())})
    return jsonable(await get_settings())


# ---------------------------------------------------------------- theme tokens
def _luminance(hex_color: str) -> float:
    h = (hex_color or "").lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if not re.fullmatch(r"[0-9A-Fa-f]{6}", h):
        raise HTTPException(422, detail="Contrast colors must use #RGB or #RRGGBB hex notation.")
    def chan(v: float) -> float:
        v /= 255.0
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (chan(int(h[i:i + 2], 16)) for i in (0, 2, 4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_ratio(a: str, b: str) -> float:
    la, lb = _luminance(a), _luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return round((hi + 0.05) / (lo + 0.05), 2)


def theme_contrast_report(t: dict) -> list[dict]:
    """AA checks that matter for this palette; publishing is blocked while any fails."""
    primary = t.get("primary_color") or t.get("color_green") or "#223027"
    accent = t.get("accent_color") or t.get("color_tan") or "#A8977B"
    obsidian = t.get("obsidian_color") or t.get("color_black") or "#0C100E"
    emerald = t.get("emerald_color") or "#5D8A6B"
    accent_ink = "#111613"

    checks = [
        ("Body text on page surface", t.get("color_body"), t.get("color_surface"), 4.5),
        ("Primary action on white", primary, "#ffffff", 4.5),
        ("Small tan text on white", t.get("color_tan_text"), "#ffffff", 4.5),
        ("White text on obsidian canvas", "#ffffff", obsidian, 4.5),
        ("Accent text on button (WCAG AA)", accent_ink, accent, 4.5),
        ("Accent on dark canvas", accent, obsidian, 3.0),
        ("Emerald accent on dark canvas", emerald, obsidian, 3.0),
        ("White text on primary button", "#ffffff", primary, 4.5),
    ]
    out = []
    for label, fg, bg, need in checks:
        ratio = contrast_ratio(fg or "", bg or "")
        out.append({"label": label, "foreground": fg, "background": bg,
                    "ratio": ratio, "required": need, "passes": ratio >= need})
    return out


@router.post("/theme/contrast", dependencies=[Depends(require("settings:read"))])
async def preview_theme_contrast(payload: ThemeTokens):
    return {"contrast": theme_contrast_report(payload.model_dump())}


@router.get("/theme", dependencies=[Depends(require("settings:read"))])
async def get_theme():
    s = await get_settings()
    theme = s.get("theme") or {"draft": ThemeTokens().model_dump(), "published": ThemeTokens().model_dump()}
    return {
        "draft": jsonable(theme.get("draft")),
        "published": jsonable(theme.get("published")),
        "contrast": theme_contrast_report(theme.get("draft") or {}),
        "default": ThemeTokens().model_dump(),
    }


@router.put("/theme/draft", dependencies=[Depends(require("settings:write"))])
async def save_theme_draft(payload: ThemeTokens, request: Request):
    tokens = payload.model_dump()
    report = theme_contrast_report(tokens)
    await db.settings.update_one({"id": "settings"}, {"$set": {"theme.draft": tokens}}, upsert=True)
    await audit(request, "update", "theme", "draft")
    return {"draft": tokens, "contrast": report}


@router.post("/theme/publish", dependencies=[Depends(require("settings:write"))])
async def publish_theme(request: Request, payload: ThemeTokens | None = None):
    s = await get_settings()
    draft = payload.model_dump() if payload is not None else (s.get("theme") or {}).get("draft") or ThemeTokens().model_dump()
    report = theme_contrast_report(draft)
    failing = [c for c in report if not c["passes"]]
    if failing:
        raise HTTPException(status_code=422, detail={
            "message": "This theme cannot be published: some color pairs are too low-contrast to read (WCAG AA).",
            "failing": failing,
        })
    await db.settings.update_one({"id": "settings"}, {"$set": {"theme.draft": draft, "theme.published": draft, "theme_tokens": draft}}, upsert=True)
    await invalidate_public_cache("settings")
    await audit(request, "publish", "theme", "published")
    return {"published": draft, "contrast": report}


@router.post("/theme/reset", dependencies=[Depends(require("settings:write"))])
async def reset_theme(request: Request):
    tokens = ThemeTokens().model_dump()
    await db.settings.update_one({"id": "settings"}, {"$set": {"theme.draft": tokens}}, upsert=True)
    await audit(request, "reset", "theme", "draft")
    return {"draft": tokens, "contrast": theme_contrast_report(tokens)}


# ---------------------------------------------------------------- audit log
AUDIT_RANGES = {
    "hour": timedelta(hours=1),
    "day": timedelta(days=1),
    "week": timedelta(days=7),
    "month": timedelta(days=30),
    "year": timedelta(days=365),
}


def _audit_query(action: str | None, period: str | None) -> dict:
    q: dict = {}
    if action:
        q["action"] = action
    if period:
        if period not in AUDIT_RANGES:
            raise HTTPException(status_code=422, detail="period must be hour, day, week, month or year.")
        q["created_at"] = {"$gte": datetime.now(timezone.utc) - AUDIT_RANGES[period]}
    return q


@router.get("/audit", dependencies=[Depends(require("audit:read"))])
async def list_audit(limit: int = 100, offset: int = 0, action: str | None = None, period: str | None = None):
    q = _audit_query(action, period)
    total = await db.audit_log.count_documents(q)
    docs = await db.audit_log.find(q).sort("created_at", -1).skip(offset).limit(min(limit, 500)).to_list(500)
    return {"items": jsonable(docs), "total": total}


@router.get("/audit/verify", dependencies=[Depends(require("audit:read"))])
async def verify_audit(limit: int | None = None):
    """Re-walk the hash chain and report the first tampered/missing link."""
    from lib.auth import verify_audit_chain
    return await verify_audit_chain(limit)


@router.get("/audit/export", dependencies=[Depends(require("audit:read"))])
async def export_audit(period: str | None = None, limit: int = 1000, offset: int = 0):
    import csv
    import io
    from fastapi.responses import Response
    if limit < 1 or limit > 5000 or offset < 0:
        raise HTTPException(status_code=422, detail="limit must be 1..5000 and offset must be non-negative.")
    docs = await db.audit_log.find(_audit_query(None, period)).sort("created_at", -1).skip(offset).limit(limit).to_list(limit)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["when", "who", "action", "resource", "target", "detail"])
    for d in docs:
        when = d.get("created_at")
        w.writerow([when.isoformat() if hasattr(when, "isoformat") else when,
                    d.get("actor_email"), d.get("action"), d.get("resource"),
                    d.get("target_id") or "", str(d.get("detail") or "")])
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="tnl-audit-log.csv"',
                             **({"X-Audit-Truncated": "true"} if len(docs) >= limit else {})})


# ---------------------------------------------------------------- dashboard
@router.get("/dashboard", dependencies=[Depends(require("content:read"))])
async def dashboard():
    from lib.dates import today_iso
    today = today_iso()
    open_events = 0
    for ev in await db.events.find({"status": "published"}).to_list(200):
        close = ev.get("reg_close_date")
        open_d = ev.get("reg_open_date")
        if open_d and open_d <= today and (not close or close >= today):
            open_events += 1
    needs_review = 0
    for coll in ("posts", "members", "events", "activities", "projects", "publications", "partners", "practicum", "pages"):
        needs_review += await db[coll].count_documents({"$or": [{"needs_review": True}, {"draft.needs_review": True}]})
    return {
        "posts": await db.posts.count_documents({}),
        "published_posts": await db.posts.count_documents({"status": "published"}),
        "members": await db.members.count_documents({}),
        "events": await db.events.count_documents({}),
        "open_events": open_events,
        "registrations": await db.registrations.count_documents({}),
        "pending_registrations": await db.registrations.count_documents({"status": "pending"}),
        "new_messages": await db.messages.count_documents({"status": "new"}),
        "media": await db.media.count_documents({}),
        "needs_review": needs_review,
    }
