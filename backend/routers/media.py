"""Media library: upload with WebP + responsive derivatives, folders, search,
mandatory alt text, "used in N places", and delete protection for files in use.
YouTube links are stored as video items."""

import os
import re
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from lib.auth import audit, require
from lib.db import db
from lib.serialize import jsonable
from lib.storage import delete_object, local_path, put_object, safe_name

router = APIRouter(tags=["media"])

IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"}
DOC_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip",
    "application/x-zip-compressed",
    "text/plain",
    "text/x-python",
    "application/x-python-code",
    "text/csv",
    "application/json",
}
DOC_EXTENSIONS = {".pdf", ".doc", ".docx", ".pkt", ".py", ".zip", ".txt", ".csv", ".json"}
MAX_BYTES = 10 * 1024 * 1024
DERIVATIVES = (480, 960, 1600)

YOUTUBE = re.compile(r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([A-Za-z0-9_-]{6,})")


def youtube_id(url: str) -> str | None:
    m = YOUTUBE.search(url or "")
    return m.group(1) if m else None


def _validate_magic_bytes(data: bytes, ctype: str, ext: str) -> bool:
    """Validate header magic bytes for common web media to prevent mime spoofing."""
    if not data:
        return False
    if ctype == "image/jpeg" or ext in (".jpg", ".jpeg"):
        return data.startswith(b"\xff\xd8\xff")
    if ctype == "image/png" or ext == ".png":
        return data.startswith(b"\x89PNG\r\n\x1a\n")
    if ctype == "image/gif" or ext == ".gif":
        return data.startswith(b"GIF87a") or data.startswith(b"GIF89a")
    if ctype == "image/webp" or ext == ".webp":
        return len(data) >= 12 and data.startswith(b"RIFF") and data[8:12] == b"WEBP"
    if ctype == "application/pdf" or ext == ".pdf":
        return data.startswith(b"%PDF-")
    return True


def _derive(data: bytes, base_key: str) -> dict:
    """WebP master + responsive widths. Pillow missing → originals only, never an error."""
    out: dict = {}
    try:
        import io
        from PIL import Image
        img = Image.open(io.BytesIO(data))
        img = img.convert("RGB") if img.mode in ("P", "RGBA", "LA") else img
        width, height = img.size
        out["width"], out["height"] = width, height
        buf = io.BytesIO()
        img.save(buf, format="WEBP", quality=82, method=4)
        out["webp_url"] = put_object(buf.getvalue(), f"{base_key}.webp", "image/webp")
        sizes = {}
        for target in DERIVATIVES:
            if width <= target:
                continue
            ratio = target / float(width)
            small = img.resize((target, max(1, int(height * ratio))), Image.LANCZOS)
            sbuf = io.BytesIO()
            small.save(sbuf, format="WEBP", quality=80, method=4)
            sizes[str(target)] = put_object(sbuf.getvalue(), f"{base_key}-{target}.webp", "image/webp")
        out["sizes"] = sizes
    except Exception:  # noqa: BLE001 — derivatives are an optimisation, not a requirement
        out.setdefault("sizes", {})
    return out


async def usage_count(url: str) -> int:
    """How many published/draft documents reference this file."""
    if not url:
        return 0
    total = 0
    needle = {"$regex": re.escape(url)}
    for coll, fields in (
        ("pages", ["blocks"]),
        ("posts", ["cover_url", "body", "body_id", "seo.og_image_url"]),
        ("members", ["photo_url", "social.cv_url"]),
        ("events", ["poster_urls", "documentation"]),
        ("activities", ["images"]),
        ("projects", ["images"]),
        ("partners", ["logo_url"]),
    ):
        for field in fields:
            total += await db[coll].count_documents({field: needle})
    settings = await db.settings.find_one({"id": "settings"}) or {}
    for key in ("logo_url", "logo_url_dark", "its_logo_url"):
        if settings.get(key) == url:
            total += 1
    return total


@router.get("/admin/media", dependencies=[Depends(require("media:manage"))])
async def list_media(folder: str | None = None, q: str | None = None, kind: str | None = None):
    query: dict = {}
    if folder and folder != "all":
        query["folder"] = folder
    if kind in ("image", "video", "document"):
        query["kind"] = kind
    if q:
        query["$or"] = [{"filename": {"$regex": re.escape(q), "$options": "i"}},
                        {"alt": {"$regex": re.escape(q), "$options": "i"}}]
    docs = await db.media.find(query).sort("created_at", -1).to_list(500)
    for d in docs:
        d["used_in"] = await usage_count(d.get("url", ""))
    folders = await db.media.distinct("folder")
    return {"items": jsonable(docs), "folders": sorted([f for f in folders if f])}


@router.post("/admin/media", status_code=201, dependencies=[Depends(require("media:manage"))])
@router.post("/admin/media/upload", status_code=201, dependencies=[Depends(require("media:manage"))])
async def upload_media(request: Request, file: UploadFile = File(...), alt: str = Form(...),
                       folder: str = Form("general")):
    if not alt.strip():
        raise HTTPException(status_code=422, detail="Alt text is required: describe what the file shows or contains.")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Files must be under 10 MB.")
    ctype = file.content_type or "application/octet-stream"
    ext = os.path.splitext(file.filename or "")[1].lower()
    is_image = ctype in IMAGE_TYPES
    is_doc = (ctype in DOC_TYPES) or (ext in DOC_EXTENSIONS)
    if not (is_image or is_doc):
        raise HTTPException(
            status_code=415,
            detail="Only images (JPG, PNG, WebP, GIF) and academic/lab documents (PDF, Word, PKT, Python, ZIP) are allowed."
        )
    if not _validate_magic_bytes(data, ctype, ext):
        raise HTTPException(
            status_code=422,
            detail="File content header does not match the claimed file type."
        )
    kind = "image" if is_image else "document"
    key = f"{folder or 'general'}/{safe_name(file.filename or 'file')}"
    url = put_object(data, key, ctype)
    doc: dict = {
        "id": str(uuid4()), "filename": file.filename or "file", "url": url, "key": key,
        "alt": alt.strip(), "folder": folder or "general", "kind": kind,
        "content_type": ctype, "bytes": len(data),
        "created_at": datetime.now(timezone.utc),
    }
    if kind == "image":
        doc.update(_derive(data, key.rsplit(".", 1)[0]))
    await db.media.insert_one(doc)
    await audit(request, "upload", "media", doc["id"], {"filename": doc["filename"]})
    doc["used_in"] = 0
    return jsonable(doc)


@router.post("/admin/media/video", status_code=201, dependencies=[Depends(require("media:manage"))])
async def add_video(payload: dict, request: Request):
    url = (payload.get("url") or "").strip()
    alt = (payload.get("alt") or "").strip()
    vid = youtube_id(url)
    if not vid:
        raise HTTPException(status_code=422, detail="Paste a YouTube link (youtube.com/watch?v=… or youtu.be/…).")
    if not alt:
        raise HTTPException(status_code=422, detail="Describe the video so screen readers can announce it.")
    doc = {
        "id": str(uuid4()), "filename": f"YouTube {vid}", "url": f"https://www.youtube.com/embed/{vid}",
        "key": "", "alt": alt, "folder": payload.get("folder") or "video", "kind": "video",
        "youtube_id": vid, "thumbnail": f"https://img.youtube.com/vi/{vid}/hqdefault.jpg",
        "content_type": "video/youtube", "bytes": 0, "created_at": datetime.now(timezone.utc),
    }
    await db.media.insert_one(doc)
    await audit(request, "add-video", "media", doc["id"], {"youtube_id": vid})
    doc["used_in"] = 0
    return jsonable(doc)


@router.patch("/admin/media/{media_id}", dependencies=[Depends(require("media:manage"))])
async def patch_media(media_id: str, payload: dict, request: Request):
    doc = await db.media.find_one({"id": media_id})
    if not doc:
        raise HTTPException(status_code=404, detail="File not found.")
    patch: dict = {}
    if "alt" in payload:
        if not (payload.get("alt") or "").strip():
            raise HTTPException(status_code=422, detail="Alt text cannot be empty.")
        patch["alt"] = payload["alt"].strip()
    if "folder" in payload:
        patch["folder"] = (payload.get("folder") or "general").strip() or "general"
    if patch:
        await db.media.update_one({"id": media_id}, {"$set": patch})
    await audit(request, "update", "media", media_id, patch)
    fresh = await db.media.find_one({"id": media_id})
    fresh["used_in"] = await usage_count(fresh.get("url", ""))
    return jsonable(fresh)


@router.delete("/admin/media/{media_id}", dependencies=[Depends(require("media:manage"))])
async def delete_media(media_id: str, request: Request):
    doc = await db.media.find_one({"id": media_id})
    if not doc:
        raise HTTPException(status_code=404, detail="File not found.")
    used = await usage_count(doc.get("url", ""))
    if used:
        raise HTTPException(status_code=400, detail=(
            f"This file is used in {used} place(s). Remove it there first, then delete it here."))
    if doc.get("key"):
        delete_object(doc["key"])
        for size_url in (doc.get("sizes") or {}).values():
            pass  # derivative keys follow the master key; removed with the folder sweep below
        base = doc["key"].rsplit(".", 1)[0]
        delete_object(f"{base}.webp")
        for target in DERIVATIVES:
            delete_object(f"{base}-{target}.webp")
    await db.media.delete_one({"id": media_id})
    await audit(request, "delete", "media", media_id, {"filename": doc.get("filename")})
    return {"ok": True}


@router.get("/media-files/{path:path}")
async def serve_media(path: str):
    """Serve locally stored media. Path traversal is strictly rejected before touching disk."""
    if ".." in path or path.startswith("/") or "\\" in path:
        raise HTTPException(status_code=400, detail="Invalid path.")
    full = os.path.abspath(local_path(path))
    media_root = os.path.abspath(MEDIA_DIR)
    try:
        if os.path.commonpath([media_root, full]) != media_root:
            raise HTTPException(status_code=403, detail="Access denied.")
    except (ValueError, Exception):
        raise HTTPException(status_code=400, detail="Invalid path.")
    if not os.path.isfile(full):
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(full, headers={"Cache-Control": "public, max-age=86400"})
