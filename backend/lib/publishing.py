"""Shared CMS boundaries: safe blocks, editorial snapshots and public projections."""

from copy import deepcopy
from datetime import datetime, timezone
from html import unescape
from math import isfinite
from urllib.parse import unquote, urlsplit
from uuid import uuid4

import nh3
from fastapi import HTTPException

MAX_REVISIONS = 20
BLOCK_TYPES = {
    "hero", "inner_hero", "rich_text", "html", "image", "gallery", "video",
    "feature_tiles", "stats", "numbered_cards", "about", "carousel", "quick_links",
    "member_sections", "news_feed", "partners", "cta_band", "contact_panel",
    "contact_form", "map", "timeline", "accordion", "download_list",
    "activity_tabs", "publication_list", "collection_list",
}
INTERNAL_FIELDS = {"draft", "revisions", "has_draft", "live_status", "issues", "needs_review", "ai_review"}
HTML_TAGS = {
    "p", "br", "hr", "strong", "b", "em", "i", "u", "s", "a", "ul", "ol", "li",
    "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "img", "figure", "figcaption",
    "span", "div", "table", "thead", "tbody", "tr", "td", "th", "code", "pre", "small", "sup", "sub",
}
HTML_ATTRIBUTES = {
    "a": {"href", "title", "target"}, "img": {"src", "alt", "title", "width", "height", "loading"},
    "td": {"colspan", "rowspan"}, "th": {"colspan", "rowspan", "scope"},
}
ARRAY_PROPS = {"tiles", "slides", "images", "links", "steps", "items", "cards", "sections", "downloads"}
TEXT_PROPS = {"title", "heading", "description", "label", "alt", "caption", "eyebrow", "text", "html", "body", "content", "url", "href", "link", "src", "image", "poster", "thumbnail", "website"}


def sanitize_html(value: str) -> str:
    return nh3.clean(
        value or "", tags=HTML_TAGS, attributes=HTML_ATTRIBUTES,
        clean_content_tags={"script", "style", "iframe", "object", "embed", "form", "svg", "math", "template"},
        url_schemes={"http", "https", "mailto", "tel"}, link_rel="noopener noreferrer",
    )


def safe_url(value: str, field: str = "url") -> str:
    value = unescape(value).strip()
    if not value:
        return ""
    decoded = unquote(value)
    if any(ord(c) < 32 or ord(c) == 127 for c in decoded) or "\\" in decoded or decoded.startswith("//"):
        raise HTTPException(422, detail=f"{field} must be a safe site path or http(s) URL.")
    try:
        parsed = urlsplit(value)
    except ValueError:
        raise HTTPException(422, detail=f"{field} contains an invalid URL.")
    if value.startswith(("/", "#")) or (parsed.scheme.lower() in {"http", "https"} and parsed.netloc):
        return value
    if parsed.scheme.lower() in {"mailto", "tel"} and parsed.path:
        return value
    raise HTTPException(422, detail=f"{field} must be a safe site path or http(s) URL.")


def _clean_props(value, key: str = "", depth: int = 0):
    if depth > 12:
        raise HTTPException(422, detail="Block properties are nested too deeply.")
    base_key = key.removesuffix("_id")
    if value is not None and (base_key in TEXT_PROPS or base_key.endswith(("_url", "_href"))) and not isinstance(value, str):
        raise HTTPException(422, detail=f"Block property {key} must be text.")
    if isinstance(value, dict):
        if len(value) > 100:
            raise HTTPException(422, detail="Too many block properties.")
        return {str(k): _clean_props(v, str(k), depth + 1) for k, v in value.items() if not str(k).startswith(("$", "_"))}
    if isinstance(value, list):
        if len(value) > 500:
            raise HTTPException(422, detail="A block list may contain at most 500 entries.")
        return [_clean_props(v, key, depth + 1) for v in value]
    if isinstance(value, str):
        if len(value) > 500_000:
            raise HTTPException(422, detail="Block text is too long.")
        if key in {"html", "body", "content", "html_id", "body_id", "content_id"}:
            return sanitize_html(value)
        if key in {"url", "href", "link", "src", "image", "poster", "thumbnail", "website"} or key.endswith(("_url", "_href")):
            return safe_url(value, key)
        return value
    if isinstance(value, float) and not isfinite(value):
        raise HTTPException(422, detail="Block numbers must be finite.")
    if value is None or isinstance(value, (int, float, bool)):
        return value
    raise HTTPException(422, detail="Block properties must contain JSON values.")


def sanitize_block(block: dict) -> dict:
    if not isinstance(block, dict) or block.get("type") not in BLOCK_TYPES:
        raise HTTPException(422, detail="Choose a supported block type.")
    props = block.get("props", {})
    if not isinstance(props, dict):
        raise HTTPException(422, detail="Block properties must be an object.")
    for name in ARRAY_PROPS:
        if name in props and not isinstance(props[name], list):
            raise HTTPException(422, detail=f"Block property {name} must be an array, not serialized text.")
        if name in props and any(not isinstance(item, dict) for item in props[name]):
            raise HTTPException(422, detail=f"Block property {name} must contain objects.")
    hidden = block.get("hidden", False)
    if not isinstance(hidden, bool):
        raise HTTPException(422, detail="Block hidden must be a boolean.")
    props = _clean_props(props)
    if block["type"] in {"html", "rich_text"}:
        for language in ("", "_id"):
            if not props.get("html" + language):
                props["html" + language] = props.get("body" + language) or props.get("content" + language) or ""
    if block["type"] == "video" and props.get("url"):
        parsed = urlsplit(props["url"])
        if parsed.scheme != "https" or parsed.hostname not in {"www.youtube.com", "youtube.com", "www.youtube-nocookie.com"} or not parsed.path.startswith("/embed/"):
            raise HTTPException(422, detail="Video blocks require an HTTPS YouTube embed URL.")
    return {"id": str(block.get("id") or uuid4()), "type": block["type"], "props": props, "hidden": hidden}


def sanitize_blocks(blocks: list) -> list[dict]:
    if not isinstance(blocks, list) or len(blocks) > 200:
        raise HTTPException(422, detail="A page must contain at most 200 blocks.")
    cleaned = [sanitize_block(block) for block in blocks]
    ids = [b["id"] for b in cleaned]
    if len(ids) != len(set(ids)):
        raise HTTPException(422, detail="Every block must have a unique ID.")
    return cleaned


def is_published(doc: dict) -> bool:
    return doc.get("status") == "published" or doc.get("published") is True


def set_publication(doc: dict, published: bool) -> None:
    if "published" in doc and "status" not in doc:
        doc["published"] = published
    elif "published" in doc and doc.get("status") not in {"draft", "published"}:
        doc["published"] = published
    else:
        doc["status"] = "published" if published else "draft"


def document_content(doc: dict) -> dict:
    return deepcopy({k: v for k, v in doc.items() if not k.startswith("_") and k not in {"draft", "revisions", "has_draft", "live_status"}})


def working_document(doc: dict) -> dict:
    result = document_content(doc)
    if isinstance(doc.get("draft"), dict):
        result.update(deepcopy(doc["draft"]))
    result["revisions"] = deepcopy(doc.get("revisions") or [])
    return result


def admin_document(doc: dict) -> dict:
    result = working_document(doc)
    result["has_draft"] = isinstance(doc.get("draft"), dict)
    result["live_status"] = "published" if is_published(doc) else "draft"
    return result


def editorial_document(current: dict, candidate: dict, actor: str, *, publish: bool = False, unpublish: bool = False) -> dict:
    """Snapshot BEFORE mutation; keep existing live fields until explicit publication."""
    now = datetime.now(timezone.utc)
    revisions = deepcopy(current.get("revisions") or [])
    before = document_content(working_document(current))
    revisions.append({**before, "id": str(uuid4()), "saved_at": now, "saved_by": actor})
    candidate = document_content(candidate)
    candidate["updated_at"] = now
    set_publication(candidate, publish)
    if is_published(current) and not publish and not unpublish:
        result = deepcopy(current)
        result.pop("_id", None)
        result["draft"] = candidate
    else:
        result = candidate
    result["revisions"] = revisions[-MAX_REVISIONS:]
    result["_cms_version"] = int(current.get("_cms_version") or 0) + 1
    return result


async def replace_editorial(collection, current: dict, updated: dict) -> None:
    version = current.get("_cms_version")
    query = {"id": current["id"], "_cms_version": version if version is not None else {"$exists": False}}
    result = await collection.replace_one(query, updated)
    if not result.matched_count:
        raise HTTPException(409, detail="This item changed in another session. Reload before saving.")


def public_content_projection(doc: dict) -> dict:
    return deepcopy({k: v for k, v in doc.items() if not k.startswith("_") and k not in INTERNAL_FIELDS})


def public_page_projection(page: dict) -> dict:
    fields = {"id", "slug", "title", "title_id", "meta_description", "meta_description_id", "status", "created_at", "updated_at"}
    result = deepcopy({k: v for k, v in page.items() if k in fields})
    result["blocks"] = []
    for block in page.get("blocks") or []:
        if not isinstance(block, dict) or block.get("hidden"):
            continue
        try:
            result["blocks"].append(sanitize_block(block))
        except HTTPException:
            # Invalid legacy blocks must never become a public injection surface.
            continue
    return result
