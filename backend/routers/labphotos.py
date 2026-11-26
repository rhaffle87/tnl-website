"""Lab photo slots: replace the illustrative stock imagery with the laboratory's own
photographs of B-301 without hand-editing page blocks.

Each slot points at one block prop on the home page (the hero portrait panel and the four
gallery frames). Uploading to a slot stores the file in the media library exactly like a
normal upload, rewrites the block prop, and clears the "illustrative" caption so the site
stops telling visitors the photo is not B-301.
"""

import os
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from lib.auth import audit, require
from lib.db import db
from lib.serialize import jsonable
from lib.storage import put_object, safe_name, sniff_content_type

router = APIRouter(tags=["lab-photos"])

IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/avif"}
MAX_BYTES = 10 * 1024 * 1024

# slot id -> (block type, human label, which gallery frame or None for the hero)
SLOTS: list[dict] = [
    {"id": "hero", "block": "hero", "index": None,
     "label": "Home hero panel",
     "hint": "The large photo beside the headline on the home page."},
    {"id": "gallery-1", "block": "gallery", "index": 0,
     "label": "Gallery frame 1", "hint": "First photo in the \u201cInside the laboratory\u201d gallery."},
    {"id": "gallery-2", "block": "gallery", "index": 1,
     "label": "Gallery frame 2", "hint": "Second photo in the gallery."},
    {"id": "gallery-3", "block": "gallery", "index": 2,
     "label": "Gallery frame 3", "hint": "Third photo in the gallery."},
    {"id": "gallery-4", "block": "gallery", "index": 3,
     "label": "Gallery frame 4", "hint": "Fourth photo in the gallery."},
]

ILLUSTRATIVE_MARK = "not a photo of Room B-301"


def _slot(slot_id: str) -> dict:
    found = next((s for s in SLOTS if s["id"] == slot_id), None)
    if not found:
        raise HTTPException(status_code=404, detail="Unknown photo slot.")
    return found


def _is_illustrative(url: str | None, alt: str | None) -> bool:
    """A slot still holds stock imagery when its file lives in the illustrative folder
    or its alt text carries the disclaimer the seed wrote."""
    return bool((url or "").find("/illustrative/") >= 0 or ILLUSTRATIVE_MARK in (alt or ""))


async def _home() -> dict:
    page = await db.pages.find_one({"slug": "home"})
    if not page:
        raise HTTPException(status_code=404, detail="The home page does not exist.")
    return page


def _read_slot(page: dict, slot: dict) -> dict:
    block = next((b for b in page.get("blocks", []) if b.get("type") == slot["block"]), None)
    props = (block or {}).get("props", {}) or {}
    if slot["index"] is None:
        url, alt = props.get("image_url"), props.get("image_alt")
    else:
        images = props.get("images") or []
        img = images[slot["index"]] if slot["index"] < len(images) else {}
        url, alt = img.get("url"), img.get("alt")
    return {
        "id": slot["id"], "label": slot["label"], "hint": slot["hint"],
        "url": url, "alt": alt,
        "is_illustrative": _is_illustrative(url, alt),
        "has_photo": bool(url),
    }


@router.get("/admin/lab-photos", dependencies=[Depends(require("media:manage"))])
async def list_lab_photos():
    """Every replaceable photo slot, flagged so editors can see what is still stock."""
    page = await _home()
    slots = [_read_slot(page, s) for s in SLOTS]
    return jsonable({
        "slots": slots,
        "illustrative_count": sum(1 for s in slots if s["is_illustrative"]),
    })


@router.post("/admin/lab-photos/{slot_id}", dependencies=[Depends(require("media:manage"))])
async def replace_lab_photo(slot_id: str, request: Request,
                            file: UploadFile = File(...), alt: str = Form(...)):
    """Upload a real photo into a slot. Alt text is mandatory, as everywhere else."""
    slot = _slot(slot_id)
    if not alt.strip():
        raise HTTPException(status_code=422, detail="Alt text is required: describe what the photo shows.")
    if ILLUSTRATIVE_MARK in alt:
        raise HTTPException(
            status_code=422,
            detail="This is a real photo of the laboratory — remove the \u201cnot a photo of Room B-301\u201d note from the alt text.",
        )
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Photos must be under 10 MB.")
    sniffed = sniff_content_type(data)
    if not sniffed or sniffed[0] not in IMAGE_TYPES:
        raise HTTPException(status_code=422, detail="File content does not match a real JPG, PNG or WebP image.")
    ctype, ext = sniffed
    stem = os.path.splitext(file.filename or "photo.jpg")[0]
    filename = safe_name(f"{stem}{ext}")
    key = f"lab-photos/{filename}"
    url = put_object(data, key, ctype)
    media_doc = {
        "id": str(uuid4()), "filename": filename, "url": url, "key": key,
        "alt": alt.strip(), "folder": "lab-photos", "kind": "image",
        "content_type": ctype, "bytes": len(data), "sizes": {},
        "created_at": datetime.now(timezone.utc),
    }
    await db.media.insert_one(media_doc)

    page = await _home()
    blocks = page.get("blocks", [])
    block = next((b for b in blocks if b.get("type") == slot["block"]), None)
    if not block:
        raise HTTPException(status_code=409, detail="That block is no longer on the home page.")
    props = dict(block.get("props") or {})

    if slot["index"] is None:
        props["image_url"] = url
        props["image_alt"] = alt.strip()
        # A real photo of the lab needs no "this is not B-301" disclaimer.
        props["image_caption"] = ""
        props["image_caption_id"] = ""
    else:
        images = [dict(i) for i in (props.get("images") or [])]
        while len(images) <= slot["index"]:
            images.append({"url": "", "alt": ""})
        images[slot["index"]] = {"url": url, "alt": alt.strip()}
        props["images"] = images
        # Drop the gallery disclaimer once every frame holds a real photo.
        if not any(_is_illustrative(i.get("url"), i.get("alt")) for i in images):
            props["note"] = ""
            props["note_id"] = ""
    block["props"] = props

    await db.pages.update_one(
        {"id": page["id"]},
        {"$set": {"blocks": blocks, "updated_at": datetime.now(timezone.utc)}},
    )
    await audit(request, "replace", "lab-photo", slot_id, {"filename": media_doc["filename"]})
    page = await _home()
    return jsonable({"ok": True, "slot": _read_slot(page, slot), "media_id": media_doc["id"]})


@router.delete("/admin/lab-photos/{slot_id}", dependencies=[Depends(require("media:manage"))])
async def clear_lab_photo(slot_id: str, request: Request):
    """Empty a slot. The hero falls back to the TNL monogram, a gallery frame disappears."""
    slot = _slot(slot_id)
    page = await _home()
    blocks = page.get("blocks", [])
    block = next((b for b in blocks if b.get("type") == slot["block"]), None)
    if not block:
        raise HTTPException(status_code=409, detail="That block is no longer on the home page.")
    props = dict(block.get("props") or {})
    if slot["index"] is None:
        props["image_url"] = ""
        props["image_alt"] = ""
        props["image_caption"] = ""
        props["image_caption_id"] = ""
    else:
        images = [dict(i) for i in (props.get("images") or [])]
        if slot["index"] < len(images):
            images.pop(slot["index"])
        props["images"] = images
    block["props"] = props
    await db.pages.update_one(
        {"id": page["id"]},
        {"$set": {"blocks": blocks, "updated_at": datetime.now(timezone.utc)}},
    )
    await audit(request, "clear", "lab-photo", slot_id, {})
    page = await _home()
    return jsonable({"ok": True, "slot": _read_slot(page, slot)})


@router.get("/admin/lab-photos/storage", dependencies=[Depends(require("media:manage"))])
async def storage_info():
    """Where uploaded photos physically live — useful when setting up backups."""
    return {
        "backend": os.environ.get("STORAGE_BACKEND", "local"),
        "media_dir": os.environ.get("MEDIA_DIR", "/app/backend/media"),
    }
