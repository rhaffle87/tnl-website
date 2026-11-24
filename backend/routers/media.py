"""Media library: upload with WebP + responsive derivatives, folders, search,
mandatory alt text, "used in N places", and delete protection for files in use.
YouTube links are stored as video items. Scoped asset attachment for TNL Studio DAM."""

import os
import re
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse

from lib.auth import (allowed, audit, lab_assistant_for_request, principal, require, user_for_request,
                      verify_upload_sig)
from lib.practicum_access import RESTRICTED_MEDIA_NOTE, media_path_is_restricted
from lib.db import db
from lib.serialize import jsonable
from lib.storage import MEDIA_DIR, delete_object, local_path, put_object, safe_name

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

DISALLOWED_FOLDERS = {"uploads"}
ALLOWED_FOLDERS = {
    "general",
    "events",
    "members",
    "posts",
    "partners",
    "practicum",
    "equipment",
    "pages",
    "lab",
    "facilities",
    "academic",
    "test",
}

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
    """WebP master + responsive widths. Pillow missing -> originals only, never an error."""
    out: dict = {}
    try:
        import io
        from PIL import Image, ImageOps
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA" if "transparency" in img.info or img.mode in ("P", "LA") else "RGB")
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
            small = img.resize((target, max(1, int(height * ratio))), getattr(Image, "Resampling", Image).LANCZOS)
            sbuf = io.BytesIO()
            small.save(sbuf, format="WEBP", quality=80, method=4)
            sizes[str(target)] = put_object(sbuf.getvalue(), f"{base_key}-{target}.webp", "image/webp")
        out["sizes"] = sizes
    except Exception:  # noqa: BLE001
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
        ("events", ["cover_image", "poster_urls", "gallery_images", "documentation"]),
        ("activities", ["cover_image", "gallery_images", "images"]),
        ("projects", ["images"]),
        ("partners", ["logo_url"]),
        ("practicum", ["cover_image", "gallery_images", "resources"]),
        ("equipment", ["photo_url", "gallery_images"]),
    ):
        for field in fields:
            total += await db[coll].count_documents({field: needle})
    settings = await db.settings.find_one({"id": "settings"}) or {}
    for key in ("logo_url", "logo_url_dark", "its_logo_url"):
        if settings.get(key) == url:
            total += 1
    return total


@router.get("/admin/media", dependencies=[Depends(require("media:manage"))])
async def list_media(
    folder: str | None = Query(None),
    q: str | None = Query(None),
    kind: str | None = Query(None),
    attached_resource: str | None = Query(None),
    attached_item_id: str | None = Query(None),
    limit: int = Query(48, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    query: dict = {}
    if folder and folder != "all":
        query["folder"] = folder
    if kind and kind != "all":
        query["kind"] = kind
    if attached_resource:
        query["attached_to.resource"] = attached_resource
    if attached_item_id:
        query["attached_to.item_id"] = attached_item_id
    if q and q.strip():
        escaped_q = re.escape(q.strip())
        query["$or"] = [
            {"filename": {"$regex": escaped_q, "$options": "i"}},
            {"original_name": {"$regex": escaped_q, "$options": "i"}},
            {"alt": {"$regex": escaped_q, "$options": "i"}},
        ]

    total = await db.media.count_documents(query)
    docs = await db.media.find(query).sort("created_at", -1).skip(offset).limit(limit).to_list(limit)

    for d in docs:
        d["used_in"] = await usage_count(d.get("url", ""))
        d.setdefault("size_bytes", d.get("bytes", 0))
        d.setdefault("bytes", d.get("size_bytes", 0))

    folders = await db.media.distinct("folder")
    clean_folders = sorted([f for f in folders if f and f not in DISALLOWED_FOLDERS])
    return {
        "items": jsonable(docs),
        "folders": clean_folders,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("/admin/media", status_code=201, dependencies=[Depends(require("media:manage"))])
@router.post("/admin/media/upload", status_code=201, dependencies=[Depends(require("media:manage"))])
async def upload_media(
    request: Request,
    file: UploadFile = File(...),
    alt: str = Form(""),
    folder: str = Form("general"),
    attached_resource: str | None = Form(None),
    attached_item_id: str | None = Form(None),
    optimize: bool = Form(True),
    auto_alt: bool = Form(False),
):
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Files must be under 10 MB.")

    clean_folder = (folder or "general").strip().lower()
    if (
        clean_folder in DISALLOWED_FOLDERS
        or ".." in clean_folder
        or "/" in clean_folder
        or "\\" in clean_folder
        or clean_folder not in ALLOWED_FOLDERS
    ):
        raise HTTPException(
            status_code=422,
            detail=f"Invalid folder '{clean_folder}'. Uploads to private directory or path traversal are disallowed.",
        )

    clean_alt = (alt or "").strip()
    if not clean_alt:
        if auto_alt:
            raw_stem = os.path.splitext(file.filename or "file")[0]
            clean_stem = re.sub(r"[-_]+", " ", raw_stem).strip()
            clean_alt = clean_stem.capitalize() if clean_stem else "Media asset"
        else:
            raise HTTPException(
                status_code=422,
                detail="Alt text is required: describe what the file shows or contains.",
            )

    ctype = file.content_type or "application/octet-stream"
    original_filename = file.filename or "file"
    ext = os.path.splitext(original_filename)[1].lower()
    is_image = ctype in IMAGE_TYPES
    is_doc = (ctype in DOC_TYPES) or (ext in DOC_EXTENSIONS)

    if not (is_image or is_doc):
        raise HTTPException(
            status_code=415,
            detail="Only images (JPG, PNG, WebP, GIF) and academic/lab documents (PDF, Word, PKT, Python, ZIP) are allowed.",
        )

    if not _validate_magic_bytes(data, ctype, ext):
        raise HTTPException(
            status_code=422,
            detail="File content header does not match the claimed file type.",
        )

    kind = "image" if is_image else "document"
    width, height = None, None
    final_data = data
    final_ctype = ctype
    final_filename = original_filename

    # Optimization logic for raster images
    is_raster = ctype in ("image/jpeg", "image/png") or ext in (".jpg", ".jpeg", ".png")
    if is_image and optimize and is_raster:
        try:
            import io
            from PIL import Image, ImageOps

            img = Image.open(io.BytesIO(data))
            img = ImageOps.exif_transpose(img)

            # Max dimension clamping to 1920px
            if max(img.size) > 1920:
                resample_filter = getattr(Image, "Resampling", Image).LANCZOS
                img.thumbnail((1920, 1920), resample_filter)

            width, height = img.size
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGBA" if "transparency" in img.info or img.mode in ("P", "LA") else "RGB")

            buf = io.BytesIO()
            img.save(buf, format="WEBP", quality=82, method=4)
            final_data = buf.getvalue()
            final_ctype = "image/webp"

            stem = os.path.splitext(original_filename)[0]
            final_filename = f"{stem}.webp"
        except Exception:  # noqa: BLE001
            # Fallback to original bytes if optimization encounters issues
            final_data = data
            final_ctype = ctype

    # Determine dimensions for un-optimized images (e.g. GIF, existing WebP)
    if is_image and (width is None or height is None):
        try:
            import io
            from PIL import Image
            img = Image.open(io.BytesIO(final_data))
            width, height = img.size
        except Exception:  # noqa: BLE001
            pass

    key = f"{clean_folder}/{safe_name(final_filename)}"
    url = put_object(final_data, key, final_ctype)

    attached_to = None
    if attached_resource:
        attached_to = {
            "resource": attached_resource.strip(),
            "item_id": attached_item_id.strip() if attached_item_id else None,
        }

    doc: dict = {
        "id": str(uuid4()),
        "filename": final_filename,
        "original_name": original_filename,
        "url": url,
        "key": key,
        "alt": clean_alt,
        "folder": clean_folder,
        "kind": kind,
        "content_type": final_ctype,
        "bytes": len(final_data),
        "size_bytes": len(final_data),
        "width": width,
        "height": height,
        "attached_to": attached_to,
        "created_at": datetime.now(timezone.utc),
    }

    if kind == "image":
        doc.update(_derive(final_data, key.rsplit(".", 1)[0]))

    await db.media.insert_one(doc)
    await audit(request, "upload", "media", doc["id"], {"filename": doc["filename"], "folder": clean_folder})
    doc["used_in"] = 0
    return jsonable(doc)


@router.post("/admin/media/video", status_code=201, dependencies=[Depends(require("media:manage"))])
async def add_video(payload: dict, request: Request):
    url = (payload.get("url") or "").strip()
    alt = (payload.get("alt") or "").strip()
    vid = youtube_id(url)
    if not vid:
        raise HTTPException(status_code=422, detail="Paste a YouTube link (youtube.com/watch?v=... or youtu.be/...).")
    if not alt:
        raise HTTPException(status_code=422, detail="Describe the video so screen readers can announce it.")
    doc = {
        "id": str(uuid4()),
        "filename": f"YouTube {vid}",
        "original_name": f"YouTube {vid}",
        "url": f"https://www.youtube.com/embed/{vid}",
        "key": "",
        "alt": alt,
        "folder": payload.get("folder") or "video",
        "kind": "video",
        "youtube_id": vid,
        "thumbnail": f"https://img.youtube.com/vi/{vid}/hqdefault.jpg",
        "content_type": "video/youtube",
        "bytes": 0,
        "size_bytes": 0,
        "created_at": datetime.now(timezone.utc),
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
        f = (payload.get("folder") or "general").strip().lower()
        if f in DISALLOWED_FOLDERS or ".." in f or "/" in f or "\\" in f or f not in ALLOWED_FOLDERS:
            raise HTTPException(status_code=422, detail="Invalid folder.")
        patch["folder"] = f
    if "attached_to" in payload:
        patch["attached_to"] = payload["attached_to"]

    if patch:
        await db.media.update_one({"id": media_id}, {"$set": patch})
    await audit(request, "update", "media", media_id, patch)
    fresh = await db.media.find_one({"id": media_id})
    fresh["used_in"] = await usage_count(fresh.get("url", ""))
    fresh.setdefault("size_bytes", fresh.get("bytes", 0))
    fresh.setdefault("bytes", fresh.get("size_bytes", 0))
    return jsonable(fresh)


@router.delete("/admin/media/{media_id}", dependencies=[Depends(require("media:manage"))])
async def delete_media(media_id: str, request: Request):
    doc = await db.media.find_one({"id": media_id})
    if not doc:
        raise HTTPException(status_code=404, detail="File not found.")
    used = await usage_count(doc.get("url", ""))
    if used:
        raise HTTPException(
            status_code=400,
            detail=f"This file is used in {used} place(s). Remove it there first, then delete it here.",
        )
    if doc.get("key"):
        key = doc["key"]
        # Explicit guard: never touch participant uploads directory
        if not (key.startswith("uploads/") or key == "uploads"):
            delete_object(key)
            base = key.rsplit(".", 1)[0]
            delete_object(f"{base}.webp")
            for target in DERIVATIVES:
                delete_object(f"{base}-{target}.webp")
    await db.media.delete_one({"id": media_id})
    await audit(request, "delete", "media", media_id, {"filename": doc.get("filename")})
    return {"ok": True}


@router.api_route("/media-files/{path:path}", methods=["GET", "HEAD"])
async def serve_media(path: str, request: Request):
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

    # Restrict uploads subfolder (participant registrations) to authorized staff or signed URLs
    is_upload = path.startswith("uploads/") or path == "uploads"
    if is_upload:
        sig = request.query_params.get("sig")
        filename = os.path.basename(full)
        has_valid_sig = verify_upload_sig(filename, sig)
        if not has_valid_sig:
            user = await user_for_request(request)
            if not user or not allowed(principal(user), "registrations:read"):
                raise HTTPException(
                    status_code=403,
                    detail="Access denied. Staff session or valid signed link required.",
                )
        return FileResponse(
            full,
            headers={
                "Cache-Control": "private, no-store, max-age=0",
                "X-Robots-Tag": "noindex, nofollow",
            },
        )

    # Practicum module files live under academic/ — laboratory assistants only, never indexed.
    if media_path_is_restricted(path):
        if await lab_assistant_for_request(request) is None:
            raise HTTPException(
                status_code=403,
                detail=RESTRICTED_MEDIA_NOTE,
                headers={"X-Robots-Tag": "noindex, nofollow"},
            )
        return FileResponse(
            full,
            headers={
                "Cache-Control": "private, no-store, max-age=0",
                "X-Robots-Tag": "noindex, nofollow",
            },
        )

    return FileResponse(full, headers={"Cache-Control": "public, max-age=86400"})
