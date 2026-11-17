"""Generic admin CRUD for every content type, behind role + division checks.

One route family serves all resources (posts, members, events, activities,
projects, publications, partners, practicum) because the shape of the work is
identical: validate against the Pydantic model, run the quality gates, block
publishing while errors remain, write an audit entry.

Admin-defined "Collections" (custom content types) live at the bottom: an admin
can declare fields and a list/detail template with no code.
"""

import csv
import io
import re
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import ValidationError

from lib.auth import audit, can_write_division, require
from lib.db import db
from lib.jev import review_draft
from lib.quality import publish_blockers, run_scan, scan_social_reuse
from lib.sanitize import sanitize_html
from lib.serialize import jsonable
from models.content import CONTENT_MODELS, TITLE_FIELD

router = APIRouter(prefix="/admin", tags=["content"])

RESOURCES = CONTENT_MODELS
HTML_FIELDS = {"posts": ("body", "body_id")}
SEARCH_FIELDS = {
    "posts": ("title", "excerpt", "category"),
    "members": ("name", "division", "batch", "position"),
    "events": ("title", "type", "location"),
    "activities": ("title", "category"),
    "projects": ("title", "cluster", "focus"),
    "publications": ("title", "authors", "venue"),
    "partners": ("name",),
    "practicum": ("name", "code", "semester"),
    "equipment": ("name", "category", "specs", "location", "status"),
}
# Fields the AI draft review reads, per resource.
REVIEW_TEXT = {
    "posts": ("title", "excerpt", "body"),
    "events": ("title", "description"),
    "activities": ("title", "description"),
    "projects": ("title", "description", "background"),
    "members": ("name", "bio"),
    "publications": ("title", "abstract"),
    "practicum": ("name", "description"),
    "partners": ("name",),
    "equipment": ("name", "specs"),
}


def _model(resource: str):
    model = RESOURCES.get(resource)
    if model is None:
        raise HTTPException(status_code=404, detail="Unknown content type.")
    return model


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-") or "item"


async def _unique_slug(resource: str, base: str, own_id: str | None = None) -> str:
    slug = slugify(base)
    n = 1
    while True:
        clash = await db[resource].find_one({"slug": slug})
        if not clash or clash.get("id") == own_id:
            return slug
        n += 1
        slug = f"{slugify(base)}-{n}"


def _plain(html: str) -> str:
    return re.sub(r"<[^>]+>", " ", html or "")


async def _apply_gates(resource: str, doc: dict) -> dict:
    """Rule-based gates + the Jev draft review, merged into one issue list."""
    issues = run_scan(resource, {k: v for k, v in doc.items()
                                 if k not in ("issues", "needs_review", "revisions")})
    if resource == "members":
        members = await db.members.find({}, {"name": 1, "social": 1, "id": 1}).to_list(1000)
        others = [m for m in members if m.get("id") != doc.get("id")] + [doc]
        reused = scan_social_reuse(others)
        own = {(v or "").strip().rstrip("/").lower() for v in (doc.get("social") or {}).values() if isinstance(v, str) and v.strip()}
        for url, names in reused.items():
            if url in own:
                issues.append({
                    "field": "social", "severity": "warning", "code": "social_reused",
                    "message": f"This social link is used by more than one person ({', '.join(sorted(set(names)))}).",
                    "hint": url,
                })
        for platform, url in (doc.get("social") or {}).items():
            if not isinstance(url, str) or not url.strip() or platform == "cv_url":
                continue
            domains = {"instagram": "instagram.com", "linkedin": "linkedin.com", "github": "github.com",
                       "scholar": "scholar.google", "sinta": "sinta.kemdikbud.go.id", "scopus": "scopus.com"}
            want = domains.get(platform)
            if want and want not in url.lower():
                issues.append({
                    "field": f"social.{platform}", "severity": "error", "code": "social_domain_mismatch",
                    "message": f"This {platform} link does not point at {want}. Paste the correct profile URL.",
                })

    text = " ".join(str(doc.get(f) or "") for f in REVIEW_TEXT.get(resource, ("title",)))
    ai = await review_draft(resource, _plain(text))
    if ai.get("ai_ok"):
        issues.extend(ai.get("ai_issues", []))
    doc["ai_review"] = {k: v for k, v in ai.items() if k != "ai_issues"}
    doc["issues"] = issues
    doc["needs_review"] = bool(publish_blockers(issues))
    return doc


def _is_publishing(resource: str, patch: dict, current: dict) -> bool:
    if "status" in patch:
        return patch["status"] == "published"
    if "published" in patch:
        return bool(patch["published"])
    return False


# ---------------------------------------------------------------- list / read
@router.get("/content/{resource}", dependencies=[Depends(require("content:read"))])
async def list_items(resource: str, q: str | None = None, status: str | None = None,
                     limit: int = 100, offset: int = 0):
    _model(resource)
    query: dict = {}
    if status:
        if resource in ("members", "activities", "partners", "practicum", "equipment") and status in ("published", "draft"):
            query["published"] = status == "published"
        else:
            query["status"] = status
    if q:
        fields = SEARCH_FIELDS.get(resource, ("title",))
        query["$or"] = [{f: {"$regex": re.escape(q), "$options": "i"}} for f in fields]
    total = await db[resource].count_documents(query)
    sort = [("order", 1), ("created_at", -1)] if resource in ("members", "activities", "partners", "practicum", "equipment") \
        else [("created_at", -1)]
    docs = await db[resource].find(query).sort(sort).skip(offset).limit(min(limit, 200)).to_list(200)
    return {"items": jsonable(docs), "total": total}


@router.get("/content/{resource}/{item_id}", dependencies=[Depends(require("content:read"))])
async def get_item(resource: str, item_id: str):
    _model(resource)
    doc = await db[resource].find_one({"id": item_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Item not found.")
    return jsonable(doc)


# ---------------------------------------------------------------- create / update / delete
@router.post("/content/{resource}", status_code=201)
async def create_item(resource: str, payload: dict, request: Request,
                      user: dict = Depends(require("content:create"))):
    model = _model(resource)
    if not can_write_division(user, resource):
        raise HTTPException(status_code=403, detail="Your division does not manage this content type.")
    payload.pop("id", None)
    for key in ("issues", "needs_review", "ai_review", "created_at", "updated_at"):
        payload.pop(key, None)
    # Contributors may only create drafts — publishing needs approval.
    if user.get("role") == "contributor":
        if resource in ("members", "activities", "partners", "practicum", "equipment"):
            payload["published"] = False
        else:
            payload["status"] = "draft"
    for field in HTML_FIELDS.get(resource, ()):
        if isinstance(payload.get(field), str):
            payload[field] = sanitize_html(payload[field])
    try:
        doc = model(**payload).model_dump()
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors(include_url=False))
    if resource in ("posts", "events"):
        doc["slug"] = await _unique_slug(resource, doc.get("slug") or doc.get("title", ""))
    if _is_publishing(resource, payload, {}):
        doc = await _apply_gates(resource, doc)
        blockers = publish_blockers(doc["issues"])
        if blockers:
            raise HTTPException(status_code=422, detail={
                "message": "This item cannot be published until these issues are fixed.", "issues": blockers})
        if resource == "posts" and not doc.get("published_at"):
            doc["published_at"] = datetime.now(timezone.utc)
    else:
        doc = await _apply_gates(resource, doc)
    await db[resource].insert_one(doc)
    await audit(request, "create", resource, doc["id"], {"title": doc.get(TITLE_FIELD[resource])})
    return jsonable(doc)


@router.put("/content/{resource}/{item_id}")
async def update_item(resource: str, item_id: str, payload: dict, request: Request,
                      user: dict = Depends(require("content:edit"))):
    model = _model(resource)
    if not can_write_division(user, resource):
        raise HTTPException(status_code=403, detail="Your division does not manage this content type.")
    current = await db[resource].find_one({"id": item_id})
    if not current:
        raise HTTPException(status_code=404, detail="Item not found.")
    for key in ("id", "issues", "needs_review", "ai_review", "created_at"):
        payload.pop(key, None)
    if user.get("role") == "contributor" and _is_publishing(resource, payload, current):
        raise HTTPException(status_code=403,
                            detail="Contributors cannot publish. Save as a draft and ask an Editor to approve it.")
    for field in HTML_FIELDS.get(resource, ()):
        if isinstance(payload.get(field), str):
            payload[field] = sanitize_html(payload[field])
    merged = {**{k: v for k, v in current.items() if not str(k).startswith("_")}, **payload}
    merged["updated_at"] = datetime.now(timezone.utc)
    try:
        doc = model(**{k: v for k, v in merged.items()
                       if k in model.model_fields}).model_dump()
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors(include_url=False))
    if resource in ("posts", "events"):
        doc["slug"] = await _unique_slug(resource, payload.get("slug") or current.get("slug") or doc.get("title", ""), item_id)
    doc = await _apply_gates(resource, doc)
    if _is_publishing(resource, payload, current):
        blockers = publish_blockers(doc["issues"])
        if blockers:
            raise HTTPException(status_code=422, detail={
                "message": "This item cannot be published until these issues are fixed.", "issues": blockers})
        if resource == "posts" and not doc.get("published_at"):
            doc["published_at"] = datetime.now(timezone.utc)
    await db[resource].replace_one({"id": item_id}, doc)
    await audit(request, "update", resource, item_id, {"title": doc.get(TITLE_FIELD[resource])})
    return jsonable(doc)


@router.delete("/content/{resource}/{item_id}")
async def delete_item(resource: str, item_id: str, request: Request,
                      user: dict = Depends(require("content:delete"))):
    _model(resource)
    if not can_write_division(user, resource):
        raise HTTPException(status_code=403, detail="Your division does not manage this content type.")
    doc = await db[resource].find_one({"id": item_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Item not found.")
    if resource == "events":
        count = await db.registrations.count_documents({"event_id": item_id})
        if count:
            raise HTTPException(status_code=400, detail=(
                f"This event has {count} registration(s). Export them first, then delete the registrations."))
    await db[resource].delete_one({"id": item_id})
    await audit(request, "delete", resource, item_id, {"title": doc.get(TITLE_FIELD[resource]), "restore": jsonable(doc)})
    return {"ok": True, "undo_token": item_id}


@router.post("/content/{resource}/{item_id}/undo-delete")
async def undo_delete(resource: str, item_id: str, request: Request,
                      user: dict = Depends(require("content:delete"))):
    """Undo the most recent delete of this item, replayed from the audit entry."""
    _model(resource)
    entry = await db.audit_log.find_one(
        {"resource": resource, "target_id": item_id, "action": "delete"}, sort=[("created_at", -1)])
    if not entry or not (entry.get("detail") or {}).get("restore"):
        raise HTTPException(status_code=404, detail="Nothing to undo for this item.")
    doc = entry["detail"]["restore"]
    if await db[resource].find_one({"id": item_id}):
        raise HTTPException(status_code=409, detail="This item already exists.")
    for key in ("created_at", "updated_at", "published_at"):
        if isinstance(doc.get(key), str):
            try:
                doc[key] = datetime.fromisoformat(doc[key])
            except ValueError:
                doc[key] = datetime.now(timezone.utc)
    await db[resource].insert_one(doc)
    await audit(request, "undo-delete", resource, item_id)
    return jsonable(doc)


# ---------------------------------------------------------------- bulk actions
@router.post("/content/{resource}/bulk")
async def bulk_action(resource: str, payload: dict, request: Request,
                      user: dict = Depends(require("content:edit"))):
    _model(resource)
    if not can_write_division(user, resource):
        raise HTTPException(status_code=403, detail="Your division does not manage this content type.")
    ids = payload.get("ids") or []
    action = payload.get("action")
    if not ids or action not in ("publish", "unpublish", "delete"):
        raise HTTPException(status_code=422, detail="Choose items and a valid action.")
    flag_field = "published" if resource in ("members", "activities", "partners", "practicum", "equipment") else "status"
    done, skipped = 0, []
    for item_id in ids:
        doc = await db[resource].find_one({"id": item_id})
        if not doc:
            continue
        if action == "delete":
            if user.get("role") not in ("super_admin", "editor"):
                raise HTTPException(status_code=403, detail="Your role cannot delete items.")
            await db[resource].delete_one({"id": item_id})
            await audit(request, "delete", resource, item_id, {"restore": jsonable(doc)})
            done += 1
            continue
        if action == "publish":
            if user.get("role") == "contributor":
                raise HTTPException(status_code=403, detail="Contributors cannot publish.")
            doc = await _apply_gates(resource, doc)
            if publish_blockers(doc["issues"]):
                skipped.append({"id": item_id, "title": doc.get(TITLE_FIELD[resource]),
                                "reason": "Failed the content quality checks."})
                await db[resource].replace_one({"id": item_id}, doc)
                continue
        value = (action == "publish") if flag_field == "published" else ("published" if action == "publish" else "draft")
        update: dict = {flag_field: value, "updated_at": datetime.now(timezone.utc)}
        if resource == "posts" and action == "publish" and not doc.get("published_at"):
            update["published_at"] = datetime.now(timezone.utc)
        await db[resource].update_one({"id": item_id}, {"$set": update})
        done += 1
    await audit(request, f"bulk-{action}", resource, None, {"count": done})
    return {"ok": True, "updated": done, "skipped": skipped}


@router.get("/content/{resource}/export/csv", dependencies=[Depends(require("content:read"))])
async def export_resource(resource: str):
    model = _model(resource)
    docs = await db[resource].find({}).to_list(2000)
    cols = [f for f in model.model_fields if f not in ("issues", "revisions", "ai_review")]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(cols)
    for d in docs:
        w.writerow([str(d.get(c, "")) for c in cols])
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="tnl-{resource}.csv"'})


# ---------------------------------------------------------------- admin-defined Collections
@router.get("/collections", dependencies=[Depends(require("content:read"))])
async def list_collections():
    docs = await db.collections_def.find({}).sort("created_at", 1).to_list(100)
    return {"items": jsonable(docs)}


@router.post("/collections", status_code=201, dependencies=[Depends(require("content:create"))])
async def create_collection(payload: dict, request: Request):
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="Give the collection a name.")
    key = slugify(name)
    if key in RESOURCES or await db.collections_def.find_one({"key": key}):
        raise HTTPException(status_code=409, detail="A content type with this name already exists.")
    doc = {
        "id": str(uuid4()), "key": key, "name": name,
        "fields": payload.get("fields") or [{"key": "title", "label": "Title", "type": "text", "required": True}],
        "template": payload.get("template") or "cards",
        "created_at": datetime.now(timezone.utc),
    }
    await db.collections_def.insert_one(doc)
    await audit(request, "create", "collections", doc["id"], {"name": name})
    return jsonable(doc)


@router.delete("/collections/{coll_id}", dependencies=[Depends(require("content:delete"))])
async def delete_collection(coll_id: str, request: Request):
    doc = await db.collections_def.find_one({"id": coll_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Collection not found.")
    await db.collections_def.delete_one({"id": coll_id})
    await db.collection_items.delete_many({"collection_key": doc["key"]})
    await audit(request, "delete", "collections", coll_id, {"name": doc.get("name")})
    return {"ok": True}


@router.get("/collections/{key}/items", dependencies=[Depends(require("content:read"))])
async def list_collection_items(key: str):
    docs = await db.collection_items.find({"collection_key": key}).sort("created_at", -1).to_list(500)
    return {"items": jsonable(docs)}


@router.post("/collections/{key}/items", status_code=201, dependencies=[Depends(require("content:create"))])
async def create_collection_item(key: str, payload: dict, request: Request):
    definition = await db.collections_def.find_one({"key": key})
    if not definition:
        raise HTTPException(status_code=404, detail="Collection not found.")
    values = payload.get("values") or {}
    for field in definition.get("fields", []):
        if field.get("required") and not str(values.get(field["key"], "")).strip():
            raise HTTPException(status_code=422, detail=f"“{field.get('label', field['key'])}” is required.")
    issues = run_scan(key, values)
    doc = {
        "id": str(uuid4()), "collection_key": key, "values": values,
        "status": payload.get("status", "draft"),
        "issues": issues, "needs_review": bool(publish_blockers(issues)),
        "created_at": datetime.now(timezone.utc), "updated_at": datetime.now(timezone.utc),
    }
    if doc["status"] == "published" and doc["needs_review"]:
        raise HTTPException(status_code=422, detail={
            "message": "This item cannot be published until these issues are fixed.",
            "issues": publish_blockers(issues)})
    await db.collection_items.insert_one(doc)
    await audit(request, "create", f"collection:{key}", doc["id"])
    return jsonable(doc)


@router.delete("/collections/{key}/items/{item_id}", dependencies=[Depends(require("content:delete"))])
async def delete_collection_item(key: str, item_id: str, request: Request):
    res = await db.collection_items.delete_one({"collection_key": key, "id": item_id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Item not found.")
    await audit(request, "delete", f"collection:{key}", item_id)
    return {"ok": True}
