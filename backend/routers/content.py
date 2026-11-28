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
from math import isfinite
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import ValidationError

from lib.auth import allowed, audit, can_write_division, is_lab_assistant, principal, require
from lib.cache import invalidate_public_cache
from lib.db import db
from lib.advisor import review_draft
from lib.quality import publish_blockers, run_scan, scan_social_reuse
from lib.publishing import (
    admin_document, document_content, editorial_document, is_published,
    replace_editorial, safe_url, sanitize_html, set_publication, working_document,
)
from lib.serialize import jsonable
from models.content import CONTENT_MODELS, TITLE_FIELD

router = APIRouter(prefix="/admin", tags=["content"])

RESOURCES = CONTENT_MODELS
# Secrets and personal data that only roles able to edit content may read back through the admin API.
# Read-only roles (viewer, registrar) get the item without these fields.
PRIVATE_FIELDS = {
    "events": ("whatsapp_group_url",),
    "members": ("phone", "email_personal", "nim"),
    # Practicum module files and shift schedules are laboratory-assistant material, so a
    # read-only CMS session never receives the download URLs.
    "practicum": ("resources", "shifts"),
}
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


def _can_see_private(resource: str, user: dict) -> bool:
    role = user.get("role")
    if role in ("super_admin", "admin"):
        return True
    if resource == "events":
        return allowed(principal(user), "content:edit") and can_write_division(user, resource)
    if resource == "practicum":
        # Module URLs follow the laboratory-assistant rule, not content:edit: a registrar reads
        # them, a read-only viewer does not.
        return is_lab_assistant(user)
    return allowed(principal(user), "content:edit")


def _redact(resource: str, doc: dict, user: dict) -> dict:
    doc = admin_document(doc)
    doc.pop("revisions", None)
    if _can_see_private(resource, user):
        return doc
    return {k: v for k, v in doc.items() if k not in PRIVATE_FIELDS.get(resource, ())}


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
    """Rule-based gates + the local draft review, merged into one issue list."""
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
    ai = review_draft(resource, _plain(text))
    if ai.get("ai_ok"):
        issues.extend(ai.get("ai_issues", []))
    doc["ai_review"] = {k: v for k, v in ai.items() if k != "ai_issues"}
    doc["issues"] = issues
    doc["needs_review"] = bool(publish_blockers(issues))
    return doc


FLAG_RESOURCES = {"members", "activities", "partners", "practicum", "equipment"}


def _publish_request(resource: str, payload: dict) -> bool:
    field = "published" if resource in FLAG_RESOURCES else "status"
    return payload.get(field) is True if field == "published" else payload.get(field) == "published"


def _require_publish(user: dict) -> None:
    if not allowed(principal(user), "content:publish"):
        raise HTTPException(403, detail="Contributors cannot publish or unpublish live content. Save a draft for an Editor to approve.")


def _check_publish(doc: dict) -> None:
    blockers = publish_blockers(doc.get("issues") or [])
    if blockers:
        raise HTTPException(422, detail={"message": "This item cannot be published until these issues are fixed.", "issues": blockers})


def _validate_content(resource: str, payload: dict) -> dict:
    model = _model(resource)
    for field in HTML_FIELDS.get(resource, ()):
        if isinstance(payload.get(field), str):
            payload[field] = sanitize_html(payload[field])
    try:
        doc = model(**{k: v for k, v in payload.items() if k in model.model_fields}).model_dump()
    except ValidationError as exc:
        raise HTTPException(422, detail=exc.errors(include_url=False))
    if resource not in FLAG_RESOURCES and doc.get("status") not in {"draft", "published"}:
        raise HTTPException(422, detail="Status must be draft or published.")
    if resource == "events" and doc.get("capacity", 0) < 0:
        raise HTTPException(422, detail="Event capacity cannot be negative.")
    return doc


async def _invalidate_resource(resource: str) -> None:
    targets = [resource]
    if resource == "members":
        targets.extend(["stats", "publications"])
    await invalidate_public_cache(*targets)


async def _persist_content(resource: str, current: dict, updated: dict, *, publish: bool = False) -> None:
    if resource == "events":
        from lib.registration_workflow import persist_event_document
        await persist_event_document(current, updated, publish=publish)
    else:
        await replace_editorial(db[resource], current, updated)


async def _delete_content(resource: str, current: dict) -> None:
    query = {"id": current["id"]}
    if resource == "events":
        from lib.registration_workflow import recover_event_publication
        await recover_event_publication(current["id"])
        version = current.get("_cms_version")
        query.update({"_cms_version": version if version is not None else {"$exists": False},
                      "_capacity_publication": {"$exists": False}})
    result = await db[resource].delete_one(query)
    if not result.deleted_count:
        raise HTTPException(409, detail="This item changed or is being published. Reload before deleting.")


# ---------------------------------------------------------------- list / read
@router.get("/content/{resource}")
async def list_items(resource: str, q: str | None = None, status: str | None = None,
                     limit: int = 100, offset: int = 0, user: dict = Depends(require("content:read"))):
    _model(resource)
    if limit < 1 or offset < 0:
        raise HTTPException(422, detail="limit must be positive and offset non-negative.")
    query: dict = {}
    if status == "needs_review":
        query["$or"] = [{"needs_review": True}, {"draft.needs_review": True}]
    elif status == "draft":
        flag = "published" if resource in FLAG_RESOURCES else "status"
        query["$or"] = [{flag: False if flag == "published" else "draft"}, {"draft": {"$type": "object"}}]
    elif status:
        if resource in ("members", "activities", "partners", "practicum", "equipment") and status in ("published", "draft"):
            query["published"] = status == "published"
        else:
            query["status"] = status
    if q:
        fields = SEARCH_FIELDS.get(resource, ("title",))
        search = {"$or": [{f: {"$regex": re.escape(q), "$options": "i"}} for f in fields] + [{f"draft.{f}": {"$regex": re.escape(q), "$options": "i"}} for f in fields]}
        query = {"$and": [query, search]} if query else search
    total = await db[resource].count_documents(query)
    sort = [("order", 1), ("created_at", -1)] if resource in ("members", "activities", "partners", "practicum", "equipment") \
        else [("created_at", -1)]
    docs = await db[resource].find(query).sort(sort).skip(offset).limit(min(limit, 200)).to_list(200)
    return {"items": [jsonable(_redact(resource, d, user)) for d in docs], "total": total}


@router.get("/content/{resource}/{item_id}")
async def get_item(resource: str, item_id: str, user: dict = Depends(require("content:read"))):
    _model(resource)
    doc = await db[resource].find_one({"id": item_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Item not found.")
    return jsonable(_redact(resource, doc, user))


# ---------------------------------------------------------------- create / update / delete
@router.post("/content/{resource}", status_code=201)
async def create_item(resource: str, payload: dict, request: Request,
                      user: dict = Depends(require("content:create"))):
    _model(resource)
    if not can_write_division(user, resource):
        raise HTTPException(status_code=403, detail="Your division does not manage this content type.")
    payload = dict(payload)
    save_as_draft = payload.pop("save_as_draft", False)
    if not isinstance(save_as_draft, bool):
        raise HTTPException(422, detail="save_as_draft must be a boolean.")
    payload.pop("id", None)
    for key in ("issues", "needs_review", "ai_review", "created_at", "updated_at", "draft", "revisions", "has_draft", "live_status"):
        payload.pop(key, None)
    # Contributors may only create drafts — publishing needs approval.
    if user.get("role") == "contributor":
        if resource in FLAG_RESOURCES:
            payload["published"] = False
        else:
            payload["status"] = "draft"
    doc = _validate_content(resource, payload)
    if save_as_draft:
        set_publication(doc, False)
    if resource in ("posts", "events"):
        doc["slug"] = await _unique_slug(resource, doc.get("slug") or doc.get("title", ""))
    doc = await _apply_gates(resource, doc)
    if is_published(doc):
        _require_publish(user)
        _check_publish(doc)
        if resource == "posts" and not doc.get("published_at"):
            doc["published_at"] = datetime.now(timezone.utc)
    await db[resource].insert_one(doc)
    await _invalidate_resource(resource)
    await audit(request, "create", resource, doc["id"], {"title": doc.get(TITLE_FIELD[resource])})
    return jsonable(_redact(resource, doc, user))


@router.put("/content/{resource}/{item_id}")
@router.patch("/content/{resource}/{item_id}")
async def update_item(resource: str, item_id: str, payload: dict, request: Request,
                      user: dict = Depends(require("content:edit"))):
    _model(resource)
    if not can_write_division(user, resource):
        raise HTTPException(status_code=403, detail="Your division does not manage this content type.")
    current = await db[resource].find_one({"id": item_id})
    if not current:
        raise HTTPException(status_code=404, detail="Item not found.")
    payload = dict(payload)
    save_as_draft = payload.pop("save_as_draft", False)
    if not isinstance(save_as_draft, bool):
        raise HTTPException(422, detail="save_as_draft must be a boolean.")
    publish = _publish_request(resource, payload) and not save_as_draft
    flag = "published" if resource in FLAG_RESOURCES else "status"
    unpublish = flag in payload and not _publish_request(resource, payload) and not save_as_draft and is_published(current)
    if publish or unpublish:
        _require_publish(user)
    for key in ("id", "issues", "needs_review", "ai_review", "created_at", "updated_at", "draft", "revisions", "has_draft", "live_status"):
        payload.pop(key, None)
    merged = {**document_content(working_document(current)), **payload}
    merged["updated_at"] = datetime.now(timezone.utc)
    doc = _validate_content(resource, merged)
    if resource in ("posts", "events"):
        doc["slug"] = await _unique_slug(resource, payload.get("slug") or current.get("slug") or doc.get("title", ""), item_id)
    doc = await _apply_gates(resource, doc)
    if publish:
        _check_publish(doc)
        if resource == "posts" and not doc.get("published_at"):
            doc["published_at"] = datetime.now(timezone.utc)
    updated = editorial_document(current, doc, user.get("email", ""), publish=publish, unpublish=unpublish)
    await _persist_content(resource, current, updated, publish=publish)
    await _invalidate_resource(resource)
    await audit(request, "update", resource, item_id, {"title": doc.get(TITLE_FIELD[resource])})
    return jsonable(_redact(resource, updated, user))


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
                f"This event has {count} registration(s). Set status to Draft to hide it temporarily, or export and delete the registrations first before deleting permanently."))
    await _delete_content(resource, doc)
    await _invalidate_resource(resource)
    await audit(request, "delete", resource, item_id, {"title": doc.get(TITLE_FIELD[resource]), "restore": jsonable(doc)})
    return {"ok": True, "undo_token": item_id}


@router.post("/content/{resource}/{item_id}/undo-delete")
async def undo_delete(resource: str, item_id: str, request: Request,
                      user: dict = Depends(require("content:delete"))):
    """Undo the most recent delete of this item, replayed from the audit entry."""
    _model(resource)
    if not can_write_division(user, resource):
        raise HTTPException(status_code=403, detail="Your division does not manage this content type.")
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
    restored = await _apply_gates(resource, _validate_content(resource, document_content(doc)))
    if is_published(restored):
        _require_publish(user)
        blockers = publish_blockers(restored.get("issues") or [])
        if blockers:
            raise HTTPException(status_code=422, detail={
                "message": "This item cannot be restored to published state until these issues are fixed.",
                "issues": blockers})
    if isinstance(doc.get("draft"), dict):
        draft = await _apply_gates(resource, _validate_content(resource, {**doc["draft"], "id": item_id}))
        set_publication(draft, False)
        restored["draft"] = draft
    restored["revisions"] = doc.get("revisions") or []
    await db[resource].insert_one(restored)
    await _invalidate_resource(resource)
    await audit(request, "undo-delete", resource, item_id)
    return jsonable(_redact(resource, restored, user))


# ---------------------------------------------------------------- bulk actions
@router.post("/content/{resource}/bulk")
async def bulk_action(resource: str, payload: dict, request: Request,
                      user: dict = Depends(require("content:edit"))):
    _model(resource)
    if not can_write_division(user, resource):
        raise HTTPException(status_code=403, detail="Your division does not manage this content type.")
    ids = payload.get("ids") or []
    action = payload.get("action")
    if not isinstance(ids, list) or not ids or len(ids) > 200 or any(not isinstance(i, str) for i in ids) or action not in ("publish", "unpublish", "delete"):
        raise HTTPException(status_code=422, detail="Choose items and a valid action.")
    ids = list(dict.fromkeys(ids))
    if action in {"publish", "unpublish"}:
        _require_publish(user)
    if action == "delete" and not allowed(principal(user), "content:delete"):
        raise HTTPException(403, detail="Your role cannot delete items.")
    if action == "delete" and resource == "events":
        for item_id in ids:
            if await db.registrations.count_documents({"event_id": item_id}):
                raise HTTPException(400, detail=f"Event {item_id} has registrations. Export or delete them before deleting the event.")
    done, skipped = 0, []
    for item_id in ids:
        doc = await db[resource].find_one({"id": item_id})
        if not doc:
            continue
        if action == "delete":
            if user.get("role") not in ("super_admin", "editor"):
                raise HTTPException(status_code=403, detail="Your role cannot delete items.")
            if resource == "events":
                count = await db.registrations.count_documents({"event_id": item_id})
                if count:
                    raise HTTPException(status_code=400, detail=(
                        f"Event {item_id} has {count} registration(s). Export or delete them first before deleting permanently."))
            await _delete_content(resource, doc)
            await audit(request, "delete", resource, item_id, {"restore": jsonable(doc)})
            done += 1
            continue
        if action == "publish":
            candidate = await _apply_gates(resource, _validate_content(resource, document_content(working_document(doc))))
            if publish_blockers(candidate["issues"]):
                skipped.append({"id": item_id, "title": candidate.get(TITLE_FIELD[resource]),
                                 "reason": "Failed the content quality checks."})
                continue
        else:
            candidate = _validate_content(resource, document_content(working_document(doc)))
        if resource == "posts" and action == "publish" and not candidate.get("published_at"):
            candidate["published_at"] = datetime.now(timezone.utc)
        updated = editorial_document(doc, candidate, user.get("email", ""), publish=action == "publish", unpublish=action == "unpublish")
        await _persist_content(resource, doc, updated, publish=action == "publish")
        done += 1
    if done:
        await _invalidate_resource(resource)
    await audit(request, f"bulk-{action}", resource, None, {"count": done})
    return {"ok": True, "updated": done, "skipped": skipped}


@router.get("/content/{resource}/{item_id}/revisions")
async def content_revisions(resource: str, item_id: str, user: dict = Depends(require("content:read"))):
    _model(resource)
    doc = await db[resource].find_one({"id": item_id})
    if not doc:
        raise HTTPException(404, detail="Item not found.")
    return {"items": jsonable([{k: r.get(k) for k in ("id", "saved_at", "saved_by", TITLE_FIELD[resource])} for r in reversed(doc.get("revisions") or [])])}


@router.post("/content/{resource}/{item_id}/revisions/{revision_id}/restore")
async def restore_content_revision(resource: str, item_id: str, revision_id: str, request: Request,
                                   user: dict = Depends(require("content:edit"))):
    _model(resource)
    if not can_write_division(user, resource):
        raise HTTPException(403, detail="Your division does not manage this content type.")
    current = await db[resource].find_one({"id": item_id})
    if not current:
        raise HTTPException(404, detail="Item not found.")
    revision = next((r for r in current.get("revisions", []) if r.get("id") == revision_id), None)
    if not revision:
        raise HTTPException(404, detail="Revision not found.")
    candidate = _validate_content(resource, {**revision, "id": item_id})
    candidate = await _apply_gates(resource, candidate)
    updated = editorial_document(current, candidate, user.get("email", ""))
    await _persist_content(resource, current, updated)
    await _invalidate_resource(resource)
    await audit(request, "restore-revision", resource, item_id, {"revision": revision_id})
    return jsonable(_redact(resource, updated, user))


@router.get("/content/{resource}/export/csv")
async def export_resource(resource: str, user: dict = Depends(require("content:read"))):
    model = _model(resource)
    docs = [working_document(d) for d in await db[resource].find({}).to_list(2000)]
    hidden = () if _can_see_private(resource, user) else PRIVATE_FIELDS.get(resource, ())
    cols = [f for f in model.model_fields if f not in ("issues", "revisions", "ai_review") + tuple(hidden)]
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


COLLECTION_FIELD_TYPES = {"text", "textarea", "html", "number", "boolean", "checkbox", "select", "tags", "url", "media", "date"}


def _collection_schema(payload: dict, current: dict | None = None) -> dict:
    merged = {**(current or {}), **payload}
    name = merged.get("name", "")
    fields = merged.get("fields")
    if not isinstance(name, str) or not name.strip():
        raise HTTPException(422, detail="Give the collection a name.")
    if not isinstance(fields, list) or not fields or len(fields) > 50:
        raise HTTPException(422, detail="Define between 1 and 50 collection fields.")
    keys, cleaned = set(), []
    for field in fields:
        if not isinstance(field, dict):
            raise HTTPException(422, detail="Each collection field must be an object.")
        key, kind = field.get("key"), field.get("type", "text")
        if not isinstance(key, str) or not re.fullmatch(r"[a-z][a-z0-9_]{0,63}", key) or key in keys or kind not in COLLECTION_FIELD_TYPES:
            raise HTTPException(422, detail="Collection fields need unique simple keys and a supported type.")
        options = field.get("options", [])
        if not isinstance(options, list) or any(not isinstance(o, str) for o in options) or (kind == "select" and not options):
            raise HTTPException(422, detail="Select fields need a list of text options.")
        keys.add(key)
        cleaned.append({"key": key, "label": str(field.get("label") or key), "type": kind, "required": bool(field.get("required", False)), "options": options})
    if merged.get("template", "cards") not in {"cards", "list", "table"}:
        raise HTTPException(422, detail="Template must be cards, list or table.")
    divisions = merged.get("divisions", [])
    if not isinstance(divisions, list) or any(d not in {"media", "academics", "event", "research"} for d in divisions):
        raise HTTPException(422, detail="Choose valid collection divisions.")
    return {"name": name.strip(), "fields": cleaned, "template": merged.get("template", "cards"), "divisions": divisions}


async def _collection_definition(key_or_id: str) -> dict:
    definition = await db.collections_def.find_one({"$or": [{"key": key_or_id}, {"id": key_or_id}]})
    if not definition:
        raise HTTPException(404, detail="Collection not found.")
    return definition


def _collection_scope(definition: dict, user: dict) -> None:
    divisions = definition.get("divisions") or []
    own = user.get("divisions") or []
    if user.get("role") != "super_admin" and divisions and own and not set(divisions).intersection(own):
        raise HTTPException(403, detail="Your division does not manage this collection.")


def _collection_values(definition: dict, values: dict) -> dict:
    if not isinstance(values, dict):
        raise HTTPException(422, detail="Collection values must be an object.")
    fields = {f["key"]: f for f in definition.get("fields", [])}
    if set(values) - set(fields):
        raise HTTPException(422, detail="Values contain fields not defined by this collection.")
    result = {}
    for key, field in fields.items():
        value = values.get(key)
        if value is None or (isinstance(value, str) and not value.strip()) or value == []:
            if field.get("required"):
                raise HTTPException(422, detail=f"{field.get('label', key)} is required.")
            if key in values:
                result[key] = value
            continue
        kind = field.get("type", "text")
        if kind == "number":
            valid = isinstance(value, (int, float)) and not isinstance(value, bool) and isfinite(value)
        elif kind in {"boolean", "checkbox"}:
            valid = isinstance(value, bool)
        elif kind == "tags":
            valid = isinstance(value, list) and all(isinstance(v, str) for v in value)
        else:
            valid = isinstance(value, str)
        if not valid:
            raise HTTPException(422, detail=f"{key} must match its {kind} field type.")
        if kind == "select" and value not in field.get("options", []):
            raise HTTPException(422, detail=f"Choose a configured option for {key}.")
        if kind == "date":
            try:
                datetime.strptime(value, "%Y-%m-%d")
            except ValueError:
                raise HTTPException(422, detail=f"{key} must be a YYYY-MM-DD date.")
        if kind == "html":
            value = sanitize_html(value)
        elif kind in {"url", "media"}:
            value = safe_url(value, key)
        result[key] = value
    return result


def _collection_candidate(definition: dict, payload: dict, current: dict | None = None) -> dict:
    merged = {**(document_content(working_document(current)) if current else {}), **payload}
    status = merged.get("status", "draft")
    if status not in {"draft", "published"}:
        raise HTTPException(422, detail="Status must be draft or published.")
    values = _collection_values(definition, merged.get("values", {}))
    issues = run_scan(definition["key"], values)
    return {"id": current["id"] if current else str(uuid4()), "collection_key": definition["key"],
            "values": values, "status": status, "issues": issues, "needs_review": bool(publish_blockers(issues)),
            "created_at": current.get("created_at") if current else datetime.now(timezone.utc), "updated_at": datetime.now(timezone.utc)}


@router.post("/collections", status_code=201, dependencies=[Depends(require("settings:write"))])
async def create_collection(payload: dict, request: Request):
    name = payload.get("name")
    if not isinstance(name, str) or not name.strip():
        raise HTTPException(status_code=422, detail="Give the collection a name.")
    name = name.strip()
    key = slugify(payload.get("key") or name)
    if key in RESOURCES or await db.collections_def.find_one({"key": key}):
        raise HTTPException(status_code=409, detail="A content type with this name already exists.")
    payload.setdefault("fields", [{"key": "title", "label": "Title", "type": "text", "required": True}])
    doc = {"id": str(uuid4()), "key": key, **_collection_schema(payload), "created_at": datetime.now(timezone.utc)}
    await db.collections_def.insert_one(doc)
    await invalidate_public_cache("collections")
    await audit(request, "create", "collections", doc["id"], {"name": name})
    return jsonable(doc)


@router.get("/collections/{coll_id}", dependencies=[Depends(require("content:read"))])
async def get_collection(coll_id: str):
    return jsonable(await _collection_definition(coll_id))


@router.put("/collections/{coll_id}", dependencies=[Depends(require("settings:write"))])
@router.patch("/collections/{coll_id}", dependencies=[Depends(require("settings:write"))])
async def update_collection(coll_id: str, payload: dict, request: Request):
    current = await _collection_definition(coll_id)
    if "key" in payload and payload["key"] != current["key"]:
        raise HTTPException(422, detail="A collection key cannot change after creation.")
    update = _collection_schema(payload, current)
    async for item in db.collection_items.find({"collection_key": current["key"], "status": "published"}):
        _collection_values(update, item.get("values") or {})
    update["updated_at"] = datetime.now(timezone.utc)
    await db.collections_def.update_one({"id": current["id"]}, {"$set": update})
    await invalidate_public_cache("collections")
    await audit(request, "update", "collections", current["id"])
    return jsonable({**current, **update})


@router.delete("/collections/{coll_id}", dependencies=[Depends(require("content:delete"))])
async def delete_collection(coll_id: str, request: Request):
    doc = await _collection_definition(coll_id)
    await db.collections_def.delete_one({"id": doc["id"]})
    await db.collection_items.delete_many({"collection_key": doc["key"]})
    await invalidate_public_cache("collections")
    await audit(request, "delete", "collections", coll_id, {"name": doc.get("name")})
    return {"ok": True}


@router.get("/collections/{key}/items", dependencies=[Depends(require("content:read"))])
async def list_collection_items(key: str, limit: int = 100, offset: int = 0):
    definition = await _collection_definition(key)
    if limit < 1 or limit > 200 or offset < 0:
        raise HTTPException(422, detail="limit must be 1..200 and offset non-negative.")
    query = {"collection_key": definition["key"]}
    docs = await db.collection_items.find(query).sort("created_at", -1).skip(offset).limit(limit).to_list(limit)
    return {"items": jsonable([admin_document(d) for d in docs]), "total": await db.collection_items.count_documents(query)}


@router.post("/collections/{key}/items", status_code=201)
async def create_collection_item(key: str, payload: dict, request: Request, user: dict = Depends(require("content:create"))):
    definition = await _collection_definition(key)
    _collection_scope(definition, user)
    doc = _collection_candidate(definition, payload)
    if user.get("role") == "contributor" or payload.get("save_as_draft") is True:
        doc["status"] = "draft"
    if is_published(doc):
        _require_publish(user)
        _check_publish(doc)
    await db.collection_items.insert_one(doc)
    await invalidate_public_cache("collections")
    await audit(request, "create", f"collection:{key}", doc["id"])
    return jsonable(admin_document(doc))


@router.get("/collections/{key}/items/{item_id}", dependencies=[Depends(require("content:read"))])
async def get_collection_item(key: str, item_id: str):
    definition = await _collection_definition(key)
    doc = await db.collection_items.find_one({"collection_key": definition["key"], "id": item_id})
    if not doc:
        raise HTTPException(404, detail="Item not found.")
    return jsonable(admin_document(doc))


@router.put("/collections/{key}/items/{item_id}")
@router.patch("/collections/{key}/items/{item_id}")
async def update_collection_item(key: str, item_id: str, payload: dict, request: Request, user: dict = Depends(require("content:edit"))):
    definition = await _collection_definition(key)
    _collection_scope(definition, user)
    current = await db.collection_items.find_one({"collection_key": definition["key"], "id": item_id})
    if not current:
        raise HTTPException(404, detail="Item not found.")
    if "save_as_draft" in payload and not isinstance(payload["save_as_draft"], bool):
        raise HTTPException(422, detail="save_as_draft must be a boolean.")
    publish = payload.get("status") == "published" and not payload.get("save_as_draft")
    unpublish = payload.get("status") == "draft" and not payload.get("save_as_draft") and is_published(current)
    if publish or unpublish:
        _require_publish(user)
    merged_payload = dict(payload)
    if "values" in payload and isinstance(payload["values"], dict):
        merged_payload["values"] = {**working_document(current).get("values", {}), **payload["values"]}
    candidate = _collection_candidate(definition, merged_payload, current)
    if publish:
        _check_publish(candidate)
    updated = editorial_document(current, candidate, user.get("email", ""), publish=publish, unpublish=unpublish)
    await replace_editorial(db.collection_items, current, updated)
    await invalidate_public_cache("collections")
    await audit(request, "update", f"collection:{definition['key']}", item_id)
    return jsonable(admin_document(updated))


@router.delete("/collections/{key}/items/{item_id}")
async def delete_collection_item(key: str, item_id: str, request: Request, user: dict = Depends(require("content:delete"))):
    definition = await _collection_definition(key)
    _collection_scope(definition, user)
    res = await db.collection_items.delete_one({"collection_key": definition["key"], "id": item_id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Item not found.")
    await invalidate_public_cache("collections")
    await audit(request, "delete", f"collection:{key}", item_id)
    return {"ok": True}
