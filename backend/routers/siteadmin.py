"""Admin: page builder (blocks, reorder, duplicate, hide, revisions, restore,
publish behind quality gates) + global settings + theme token editor with a
WCAG-AA contrast check that blocks publishing an unreadable theme."""

import re
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request

from lib.auth import audit, require
from lib.db import db
from lib.quality import publish_blockers, run_scan
from lib.sanitize import sanitize_html
from lib.serialize import jsonable
from lib.settings import get_settings
from models.content import BlockModel, PageDoc
from models.core import BlockAdd, BlockPatch, PagePatch, PageUpsert, ReorderIn, SettingsUpdate, ThemeTokens

router = APIRouter(prefix="/admin", tags=["pages-settings"])

RICH_KEYS = ("html", "body", "content")
MAX_REVISIONS = 20


def _sanitize_props(block: dict) -> dict:
    """Custom HTML and rich text are stored sanitized — never trust stored markup."""
    if block.get("type") in ("html", "rich_text"):
        props = block.setdefault("props", {})
        for key in RICH_KEYS:
            if isinstance(props.get(key), str):
                props[key] = sanitize_html(props[key])
    return block


async def _get_page(page_id: str) -> dict:
    page = await db.pages.find_one({"id": page_id})
    if not page:
        raise HTTPException(status_code=404, detail="Page not found.")
    return page


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-") or "page"


async def _save_page(page: dict, request: Request, snapshot: bool = True) -> dict:
    """Persist a page: scan quality gates, keep a revision, bump updated_at."""
    issues = run_scan("pages", {"title": page.get("title"), "blocks": page.get("blocks", [])})
    page["issues"] = issues
    page["needs_review"] = bool(publish_blockers(issues))
    page["updated_at"] = datetime.now(timezone.utc)
    if snapshot:
        actor = (getattr(request.state, "user", None) or {}).get("email", "")
        revisions = page.get("revisions") or []
        revisions.append({
            "id": str(uuid4()),
            "saved_at": datetime.now(timezone.utc),
            "saved_by": actor,
            "title": page.get("title", ""),
            "blocks": [dict(b) for b in page.get("blocks", [])],
        })
        page["revisions"] = revisions[-MAX_REVISIONS:]
    await db.pages.replace_one({"id": page["id"]}, page)
    return page


# ---------------------------------------------------------------- pages
@router.get("/pages", dependencies=[Depends(require("content:read"))])
async def list_pages():
    docs = await db.pages.find({}, {"revisions": 0}).sort("created_at", 1).to_list(200)
    return {"items": jsonable(docs)}


@router.get("/pages/{page_id}", dependencies=[Depends(require("content:read"))])
async def get_page(page_id: str):
    return jsonable(await _get_page(page_id))


@router.post("/pages", status_code=201, dependencies=[Depends(require("pages:edit"))])
async def create_page(payload: PageUpsert, request: Request):
    slug = slugify(payload.slug or payload.title)
    if await db.pages.find_one({"slug": slug}):
        raise HTTPException(status_code=409, detail="A page with this web address already exists.")
    page = PageDoc(slug=slug, title=payload.title, title_id=payload.title_id, status="draft").model_dump()
    await db.pages.insert_one(page)
    await audit(request, "create", "pages", page["id"], {"slug": slug})
    return jsonable(page)


@router.patch("/pages/{page_id}", dependencies=[Depends(require("pages:edit"))])
async def patch_page(page_id: str, payload: PagePatch, request: Request):
    page = await _get_page(page_id)
    patch = payload.model_dump(exclude_unset=True)
    if patch.get("status") == "published":
        blockers = publish_blockers(run_scan("pages", {"title": page.get("title"), "blocks": page.get("blocks", [])}))
        if blockers:
            raise HTTPException(status_code=422, detail={
                "message": "This page cannot be published until these issues are fixed.",
                "issues": blockers,
            })
    page.update(patch)
    await _save_page(page, request, snapshot=False)
    await audit(request, "update", "pages", page_id, patch)
    return jsonable(page)


@router.delete("/pages/{page_id}", dependencies=[Depends(require("content:delete"))])
async def delete_page(page_id: str, request: Request):
    page = await _get_page(page_id)
    if page.get("is_system"):
        raise HTTPException(status_code=400, detail="Built-in pages cannot be deleted. You can unpublish them instead.")
    await db.pages.delete_one({"id": page_id})
    await audit(request, "delete", "pages", page_id, {"slug": page.get("slug")})
    return {"ok": True}


# ---------------------------------------------------------------- blocks
@router.post("/pages/{page_id}/blocks", status_code=201, dependencies=[Depends(require("pages:edit"))])
async def add_block(page_id: str, payload: BlockAdd, request: Request):
    page = await _get_page(page_id)
    block = _sanitize_props(BlockModel(type=payload.type, props=payload.props).model_dump())
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
        _sanitize_props(target)
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
    if set(payload.order) != set(by_id.keys()):
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
    name = (payload.get("name") or "").strip()
    block = payload.get("block") or {}
    if not name or not block.get("type"):
        raise HTTPException(status_code=422, detail="A name and a block are required.")
    doc = {"id": str(uuid4()), "name": name, "block": _sanitize_props(dict(block)),
           "created_at": datetime.now(timezone.utc)}
    await db.saved_blocks.insert_one(doc)
    await audit(request, "create", "saved_blocks", doc["id"], {"name": name})
    return jsonable(doc)


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
    await audit(request, "update", "settings", "settings", {"keys": list(patch.keys())})
    return jsonable(await get_settings())


# ---------------------------------------------------------------- theme tokens
def _luminance(hex_color: str) -> float:
    h = (hex_color or "").lstrip("#")
    if len(h) != 6:
        return 0.0
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
    await db.settings.update_one({"id": "settings"}, {"$set": {"theme.draft": tokens}}, upsert=True)
    await audit(request, "update", "theme", "draft")
    return {"draft": tokens, "contrast": theme_contrast_report(tokens)}


@router.post("/theme/publish", dependencies=[Depends(require("settings:write"))])
async def publish_theme(request: Request):
    s = await get_settings()
    draft = (s.get("theme") or {}).get("draft") or ThemeTokens().model_dump()
    report = theme_contrast_report(draft)
    failing = [c for c in report if not c["passes"]]
    if failing:
        raise HTTPException(status_code=422, detail={
            "message": "This theme cannot be published: some color pairs are too low-contrast to read (WCAG AA).",
            "failing": failing,
        })
    await db.settings.update_one({"id": "settings"}, {"$set": {"theme.published": draft, "theme_tokens": draft}}, upsert=True)
    await audit(request, "publish", "theme", "published")
    return {"published": draft, "contrast": report}


@router.post("/theme/reset", dependencies=[Depends(require("settings:write"))])
async def reset_theme(request: Request):
    tokens = ThemeTokens().model_dump()
    await db.settings.update_one({"id": "settings"}, {"$set": {"theme.draft": tokens}}, upsert=True)
    await audit(request, "reset", "theme", "draft")
    return {"draft": tokens, "contrast": theme_contrast_report(tokens)}


# ---------------------------------------------------------------- audit log
@router.get("/audit", dependencies=[Depends(require("audit:read"))])
async def list_audit(limit: int = 100, offset: int = 0, action: str | None = None):
    q: dict = {}
    if action:
        q["action"] = action
    total = await db.audit_log.count_documents(q)
    docs = await db.audit_log.find(q).sort("created_at", -1).skip(offset).limit(min(limit, 500)).to_list(500)
    return {"items": jsonable(docs), "total": total}


@router.get("/audit/export", dependencies=[Depends(require("audit:read"))])
async def export_audit():
    import csv
    import io
    from fastapi.responses import Response
    docs = await db.audit_log.find({}).sort("created_at", -1).to_list(5000)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["when", "who", "action", "resource", "target", "detail"])
    for d in docs:
        when = d.get("created_at")
        w.writerow([when.isoformat() if hasattr(when, "isoformat") else when,
                    d.get("actor_email"), d.get("action"), d.get("resource"),
                    d.get("target_id") or "", str(d.get("detail") or "")])
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="tnl-audit-log.csv"'})


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
        needs_review += await db[coll].count_documents({"needs_review": True})
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
