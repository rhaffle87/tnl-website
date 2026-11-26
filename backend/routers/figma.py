"""Figma to TNL Studio CMS Integration Router.

Provides secure endpoints for:
1. Generating/rotating Figma sync tokens for private plugins and CI/CD.
2. Importing W3C / Tokens Studio design tokens into GSM theme tokens.
3. Synchronising Figma frames/sections directly as draft pages in the CMS Page Builder.

Guarantees:
- All incoming frames are saved as 'draft' (never directly published).
- All changes are recorded in the immutable audit log.
- Accepts both active admin session cookies and Bearer / X-Figma-Token credentials.
"""

import hashlib
import re
import secrets
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

from lib.auth import allowed, audit, principal, require, user_for_request
from lib.db import db
from lib.serialize import jsonable
from models.core import ThemeTokens
from routers.siteadmin import theme_contrast_report

router = APIRouter(prefix="/admin/figma", tags=["figma-sync"])


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.strip().encode("utf-8")).hexdigest()


async def get_figma_actor(
    request: Request,
    x_figma_token: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict:
    """Authenticates request via session cookie OR Figma sync token."""
    # 1. Check session cookie
    user = await user_for_request(request)
    if user:
        request.state.user = user
        return {"actor_type": "user", "id": user.get("id"), "email": user.get("email")}

    # 2. Extract token from header
    token = x_figma_token
    if not token and authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()

    if not token:
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Provide an active admin session or a valid X-Figma-Token / Bearer token.",
        )

    # 3. Validate against stored hash in settings
    settings = await db.settings.find_one({"id": "settings"}) or {}
    expected_hash = settings.get("figma_sync_token_hash")
    if not expected_hash or hash_token(token) != expected_hash:
        raise HTTPException(status_code=401, detail="Invalid or revoked Figma Sync Token.")

    actor = {"actor_type": "figma_plugin", "id": "figma_plugin", "email": "figma-plugin@labtnl.site"}
    request.state.user = {"id": "figma_plugin", "email": "figma-plugin@labtnl.site", "role": "editor"}
    return actor


def slugify(text: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", (text or "").lower()).strip("-")
    return s or f"figma-page-{secrets.token_hex(4)}"


def require_actor_permission(request: Request, actor: dict, action: str) -> None:
    """A session cookie alone is not authority: enforce the user's CMS permission.

    Plugin/token actors are scoped by their token capability and stay unaffected."""
    if actor.get("actor_type") != "user":
        return
    user = getattr(request.state, "user", None) or {}
    if not allowed(principal(user), action):
        raise HTTPException(status_code=403, detail="Your role does not allow this Figma action.")


# ---------------------------------------------------------------- token management
@router.post("/token", dependencies=[Depends(require("settings:write"))])
async def generate_figma_token(request: Request):
    """Generate or rotate the Figma Sync Token."""
    raw_token = f"tnl_figma_{secrets.token_urlsafe(32)}"
    token_hash = hash_token(raw_token)
    prefix = f"{raw_token[:14]}..."
    now = datetime.now(timezone.utc)

    await db.settings.update_one(
        {"id": "settings"},
        {
            "$set": {
                "figma_sync_token_hash": token_hash,
                "figma_sync_token_prefix": prefix,
                "figma_sync_token_created_at": now,
            }
        },
        upsert=True,
    )
    await audit(request, "generate_token", "figma_sync", detail={"prefix": prefix})
    return {
        "ok": True,
        "token": raw_token,
        "prefix": prefix,
        "created_at": now.isoformat(),
        "message": "Token generated. Copy it now; the full token cannot be retrieved again.",
    }


@router.get("/status", dependencies=[Depends(require("settings:read"))])
async def get_figma_status():
    """Retrieve the current Figma sync configuration status."""
    settings = await db.settings.find_one({"id": "settings"}) or {}
    has_token = bool(settings.get("figma_sync_token_hash"))
    prefix = settings.get("figma_sync_token_prefix")
    created_at = settings.get("figma_sync_token_created_at")

    return {
        "configured": has_token,
        "prefix": prefix,
        "created_at": created_at.isoformat() if hasattr(created_at, "isoformat") else created_at,
        "endpoint_sync_frame": "https://labtnl.site/api/admin/figma/sync-frame",
        "endpoint_import_tokens": "https://labtnl.site/api/admin/figma/import-tokens",
    }


# ---------------------------------------------------------------- token importer
def extract_hex(value: Any) -> str | None:
    if isinstance(value, str):
        v = value.strip()
        if re.match(r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$", v):
            return v[:7]  # trim alpha if present
    elif isinstance(value, dict):
        if "value" in value:
            return extract_hex(value["value"])
        if "$value" in value:
            return extract_hex(value["$value"])
    return None


def search_nested_token(data: Any, candidate_keys: list[str]) -> str | None:
    """Recursively search for color values matching candidate key names."""
    if not isinstance(data, dict):
        return None

    # Direct match on current dict
    for k in candidate_keys:
        if k in data:
            hex_val = extract_hex(data[k])
            if hex_val:
                return hex_val

    # Traverse sub-dictionaries
    for _, v in data.items():
        if isinstance(v, dict):
            res = search_nested_token(v, candidate_keys)
            if res:
                return res
    return None


@router.post("/import-tokens")
async def import_figma_tokens(
    request: Request,
    payload: dict[str, Any],
    actor: dict = Depends(get_figma_actor),
):
    """Import design tokens from Tokens Studio, W3C Design Tokens, or flat JSON.

    Validates colors, evaluates WCAG AA contrast, and saves to settings draft.
    """
    require_actor_permission(request, actor, "settings:write")
    settings = await db.settings.find_one({"id": "settings"}) or {}
    current_tokens = settings.get("theme", {}).get("draft") or settings.get("theme_tokens") or ThemeTokens().model_dump()

    # Normalize extracted colors
    extracted: dict[str, str] = {}

    primary = (
        search_nested_token(payload, ["primary_color", "primary", "deep_forest", "forest", "brand-primary", "color_green"])
        or current_tokens.get("primary_color")
        or "#223027"
    )
    emerald = (
        search_nested_token(payload, ["emerald_color", "emerald", "pulse", "glow", "brand-emerald"])
        or current_tokens.get("emerald_color")
        or "#5D8A6B"
    )
    obsidian = (
        search_nested_token(payload, ["obsidian_color", "obsidian", "dark", "canvas_dark", "brand-obsidian", "color_black"])
        or current_tokens.get("obsidian_color")
        or "#0C100E"
    )
    accent = (
        search_nested_token(payload, ["accent_color", "accent", "warm_sand", "sand", "gold", "tan", "color_tan"])
        or current_tokens.get("accent_color")
        or "#A8977B"
    )
    accent_hover = (
        search_nested_token(payload, ["accent_hover_color", "accent_hover", "tan_hover", "hover_sand"])
        or current_tokens.get("accent_hover_color")
        or "#C2B091"
    )

    edition_label = payload.get("edition_label") or payload.get("gsm_edition_label") or current_tokens.get("gsm_edition_label") or "GSM Sync from Figma"

    updated_tokens = {
        **current_tokens,
        "primary_color": primary,
        "emerald_color": emerald,
        "obsidian_color": obsidian,
        "accent_color": accent,
        "accent_hover_color": accent_hover,
        "gsm_edition_label": str(edition_label),
        # keep legacy tokens aligned
        "color_green": primary,
        "color_black": obsidian,
        "color_tan": accent,
        "color_tan_text": accent_hover,
    }

    # Run contrast evaluation
    contrast = theme_contrast_report(updated_tokens)
    all_pass = all(c.get("passes", False) for c in contrast)

    # Persist as draft theme tokens
    await db.settings.update_one(
        {"id": "settings"},
        {"$set": {"theme.draft": updated_tokens, "theme_tokens": updated_tokens, "updated_at": datetime.now(timezone.utc)}},
        upsert=True,
    )

    await audit(
        request,
        "import_tokens",
        "figma_theme",
        detail={
            "edition": edition_label,
            "primary": primary,
            "accent": accent,
            "wcag_passes": all_pass,
            "actor": actor.get("email"),
        },
    )

    return {
        "ok": True,
        "tokens": updated_tokens,
        "contrast": contrast,
        "all_pass": all_pass,
        "message": "Figma design tokens successfully imported into theme draft. Review in /admin/theme.",
    }


# ---------------------------------------------------------------- frame / section sync
class CardItem(BaseModel):
    title: str
    description: str = ""
    link: str | None = None
    icon: str | None = None


class SyncFramePayload(BaseModel):
    title: str = Field(..., description="Title of the page or frame")
    slug: str | None = Field(default=None, description="Optional URL slug")
    description: str | None = None
    frame_name: str | None = None
    heading: str | None = None
    subheading: str | None = None
    cards: list[CardItem] = []
    cta_label: str | None = None
    cta_url: str | None = None
    blocks: list[dict[str, Any]] = []


@router.post("/sync-frame")
async def sync_figma_frame(
    request: Request,
    payload: SyncFramePayload,
    actor: dict = Depends(get_figma_actor),
):
    """Import a Figma frame/layout and save it as a draft page in CMS Page Builder.

    GUARANTEE: The created/updated page is ALWAYS saved as 'draft' (published: False)
    so administrators retain full editorial control before going live.
    """
    require_actor_permission(request, actor, "pages:edit")
    slug = slugify(payload.slug or payload.title or payload.frame_name or "figma-draft")
    now = datetime.now(timezone.utc)

    # 1. Assemble valid Blocks for the Page Builder
    assembled_blocks: list[dict[str, Any]] = []

    # If explicit blocks passed
    if payload.blocks:
        for b in payload.blocks:
            assembled_blocks.append({
                "id": str(b.get("id") or uuid4()),
                "type": b.get("type", "rich_text"),
                "props": b.get("props", {}),
                "hidden": bool(b.get("hidden", False)),
            })
    else:
        # Synthesize blocks from structured frame data
        # Hero / Header block
        if payload.heading or payload.title:
            assembled_blocks.append({
                "id": str(uuid4()),
                "type": "inner_hero",
                "props": {
                    "eyebrow": payload.frame_name or "TNL Lab Showcase",
                    "title": payload.heading or payload.title,
                    "title_id": payload.heading or payload.title,
                    "lead": payload.subheading or payload.description or "",
                    "lead_id": payload.subheading or payload.description or "",
                },
                "hidden": False,
            })

        # Feature tiles from cards
        if payload.cards:
            assembled_blocks.append({
                "id": str(uuid4()),
                "type": "feature_tiles",
                "props": {
                    "heading": "Highlights & Agenda",
                    "heading_id": "Sorotan & Agenda",
                    "items": [c.model_dump() for c in payload.cards],
                },
                "hidden": False,
            })

        # CTA Band
        if payload.cta_label:
            assembled_blocks.append({
                "id": str(uuid4()),
                "type": "cta_band",
                "props": {
                    "title": "Ingin Berkolaborasi dengan Lab TNL?",
                    "body": "Hubungi tim kami atau ikuti kegiatan riset dan praktikum di Laboratorium Jaringan Telekomunikasi ITS.",
                    "button_label": payload.cta_label,
                    "button_url": payload.cta_url or "/contact",
                },
                "hidden": False,
            })

    # If still empty, supply a default rich text block
    if not assembled_blocks:
        assembled_blocks.append({
            "id": str(uuid4()),
            "type": "rich_text",
            "props": {
                "content": f"<h2>{payload.title}</h2><p>{payload.description or 'Konten draf dari Figma.'}</p>",
            },
            "hidden": False,
        })

    # 2. Check for existing page by slug
    existing = await db.pages.find_one({"slug": slug})
    page_id = existing["id"] if existing else str(uuid4())

    page_doc = {
        "id": page_id,
        "slug": slug,
        "title": payload.title,
        "title_id": payload.title,
        "blocks": assembled_blocks,
        "status": "draft",  # STRICTLY DRAFT
        "is_system": False,
        "needs_review": True,
        "issues": [],
        "revisions": (existing.get("revisions") or []) if existing else [],
        "updated_at": now,
    }
    if not existing:
        page_doc["created_at"] = now

    await db.pages.update_one({"slug": slug}, {"$set": page_doc}, upsert=True)

    await audit(
        request,
        "sync_frame",
        "figma_page_draft",
        target_id=page_id,
        detail={
            "slug": slug,
            "title": payload.title,
            "blocks_count": len(assembled_blocks),
            "status": "draft",
            "actor": actor.get("email"),
        },
    )

    return {
        "ok": True,
        "page_id": page_id,
        "slug": slug,
        "title": payload.title,
        "status": "draft",
        "blocks_count": len(assembled_blocks),
        "admin_page_url": f"/admin/pages/{page_id}",
        "message": f"Frame successfully synced as draft page '/{slug}'. Admin review required before publishing.",
    }
