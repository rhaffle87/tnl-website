"""Public REST/JSON API v1 with scoped API keys + OpenAPI docs + bulk JSON importer.

Read keys (`scopes: ["read"]`) serve published content; write keys additionally
publish News and Members for automation scripts. Keys travel in `X-API-Key`.
"""

import hashlib
import re
import secrets
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Request

from lib.auth import audit, lab_assistant_for_request, require
from lib.practicum_access import public_practicum_doc
from lib.db import db
from lib.quality import publish_blockers, run_scan
from lib.sanitize import sanitize_html
from lib.serialize import jsonable
from models.content import Member, Post
from models.core import ApiKeyCreate, V1Import

router = APIRouter(tags=["api-v1"])

WRITE_RESOURCES = {"posts": Post, "members": Member}


def hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def api_key_principal(x_api_key: str | None = Header(default=None)) -> dict:
    if not x_api_key:
        raise HTTPException(status_code=401, detail="Missing X-API-Key header.")
    doc = await db.api_keys.find_one({"key_hash": hash_key(x_api_key), "active": True})
    if not doc:
        raise HTTPException(status_code=401, detail="Invalid or revoked API key.")
    await db.api_keys.update_one({"id": doc["id"]}, {"$set": {"last_used_at": datetime.now(timezone.utc)},
                                                    "$inc": {"calls": 1}})
    return {"principal_type": "api_key", "key_id": doc["id"], "name": doc.get("name"),
            "scopes": doc.get("scopes") or ["read"]}


def require_scope(scope: str):
    async def dep(principal: dict = Depends(api_key_principal)) -> dict:
        if scope not in principal["scopes"]:
            raise HTTPException(status_code=403, detail=f"This API key does not have the “{scope}” scope.")
        return principal
    return dep


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-") or "item"


# ---------------------------------------------------------------- key management (Super Admin)
@router.get("/admin/api-keys", dependencies=[Depends(require("users:manage"))])
async def list_keys():
    docs = await db.api_keys.find({}, {"key_hash": 0}).sort("created_at", -1).to_list(100)
    return {"items": jsonable(docs)}


@router.post("/admin/api-keys", status_code=201, dependencies=[Depends(require("users:manage"))])
async def create_key(payload: ApiKeyCreate, request: Request):
    raw = "tnl_" + secrets.token_urlsafe(28)
    doc = {
        "id": str(uuid4()), "name": payload.name.strip() or "Unnamed key",
        "scopes": payload.scopes or ["read"], "key_hash": hash_key(raw),
        "prefix": raw[:12], "active": True, "calls": 0,
        "created_at": datetime.now(timezone.utc), "last_used_at": None,
    }
    await db.api_keys.insert_one(doc)
    await audit(request, "create", "api_keys", doc["id"], {"name": doc["name"], "scopes": doc["scopes"]})
    out = jsonable({k: v for k, v in doc.items() if k != "key_hash"})
    out["key"] = raw  # shown once
    return out


@router.delete("/admin/api-keys/{key_id}", dependencies=[Depends(require("users:manage"))])
async def revoke_key(key_id: str, request: Request):
    res = await db.api_keys.update_one({"id": key_id}, {"$set": {"active": False}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="API key not found.")
    await audit(request, "revoke", "api_keys", key_id)
    return {"ok": True}


# ---------------------------------------------------------------- v1 reads
V1_READ = {
    "news": ("posts", {"status": "published"}),
    "members": ("members", {"published": True}),
    "events": ("events", {"status": "published"}),
    "activities": ("activities", {"published": True}),
    "projects": ("projects", {"status": "published"}),
    "publications": ("publications", {"status": "published"}),
    "partners": ("partners", {"published": True}),
    "practicum": ("practicum", {"published": True}),
}


# Fields never returned by the public v1 reads. The sheet webhook is a write credential for the
# registrant spreadsheet, and the WhatsApp group URL must only be revealed post-registration, so a
# read-scope key must not be able to see them.
V1_PROJECTION = {"issues": 0, "ai_review": 0, "nim": 0, "email_personal": 0, "phone": 0,
                 "spreadsheet_webhook_url": 0, "whatsapp_group_url": 0}


async def _practicum_view(request: Request, items: list) -> list:
    """Apply the same module redaction as the public catalog, session-aware."""
    can_access = await lab_assistant_for_request(request) is not None
    return [public_practicum_doc(doc, can_access) for doc in items]


@router.get("/v1/{resource}")
async def v1_list(resource: str, request: Request, limit: int = 50, offset: int = 0,
                  principal: dict = Depends(require_scope("read"))):
    spec = V1_READ.get(resource)
    if not spec:
        raise HTTPException(status_code=404, detail=f"Unknown resource. Available: {', '.join(sorted(V1_READ))}")
    coll, query = spec
    projection = V1_PROJECTION
    total = await db[coll].count_documents(query)
    docs = await db[coll].find(query, projection).sort("created_at", -1).skip(offset).limit(min(limit, 100)).to_list(100)
    items = jsonable(docs)
    if coll == "practicum":
        items = await _practicum_view(request, items)
    return {"resource": resource, "total": total, "limit": limit, "offset": offset, "items": items}


@router.get("/v1/{resource}/{item_id}")
async def v1_get(resource: str, item_id: str, request: Request,
                 principal: dict = Depends(require_scope("read"))):
    spec = V1_READ.get(resource)
    if not spec:
        raise HTTPException(status_code=404, detail="Unknown resource.")
    coll, query = spec
    doc = await db[coll].find_one({**query, "$or": [{"id": item_id}, {"slug": item_id}]},
                                  V1_PROJECTION)
    if not doc:
        raise HTTPException(status_code=404, detail="Item not found.")
    item = jsonable(doc)
    if coll == "practicum":
        item = (await _practicum_view(request, [item]))[0]
    return item


# ---------------------------------------------------------------- v1 writes
@router.post("/v1/{resource}", status_code=201)
async def v1_create(resource: str, payload: dict, principal: dict = Depends(require_scope("write"))):
    key = {"news": "posts", "members": "members"}.get(resource, resource)
    model = WRITE_RESOURCES.get(key)
    if not model:
        raise HTTPException(status_code=404, detail="This resource is read-only. Writable: news, members.")
    payload.pop("id", None)
    if key == "posts" and isinstance(payload.get("body"), str):
        payload["body"] = sanitize_html(payload["body"])
    try:
        doc = model(**payload).model_dump()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=str(exc))
    issues = run_scan(key, doc)
    doc["issues"] = issues
    doc["needs_review"] = bool(publish_blockers(issues))
    publishing = doc.get("status") == "published" or doc.get("published") is True
    if publishing and publish_blockers(issues):
        raise HTTPException(status_code=422, detail={
            "message": "Content failed the quality checks and was not created.",
            "issues": publish_blockers(issues)})
    if key == "posts":
        base = slugify(doc.get("slug") or doc.get("title", ""))
        slug, n = base, 1
        while await db.posts.find_one({"slug": slug}):
            n += 1
            slug = f"{base}-{n}"
        doc["slug"] = slug
        if publishing and not doc.get("published_at"):
            doc["published_at"] = datetime.now(timezone.utc)
    await db[key].insert_one(doc)
    await db.audit_log.insert_one({
        "id": str(uuid4()), "actor_id": principal["key_id"],
        "actor_email": f"api-key:{principal['name']}", "action": "create",
        "resource": key, "target_id": doc["id"], "detail": {"via": "v1"},
        "created_at": datetime.now(timezone.utc),
    })
    return jsonable(doc)


@router.post("/v1/{resource}/import")
async def v1_import(resource: str, payload: V1Import, principal: dict = Depends(require_scope("write"))):
    """Bulk JSON importer — validates every item, reports per-row results."""
    key = {"news": "posts", "members": "members"}.get(resource, resource)
    model = WRITE_RESOURCES.get(key)
    if not model:
        raise HTTPException(status_code=404, detail="This resource cannot be imported. Importable: news, members.")
    created, failed = 0, []
    for index, item in enumerate(payload.items):
        try:
            item.pop("id", None)
            if key == "posts" and isinstance(item.get("body"), str):
                item["body"] = sanitize_html(item["body"])
            doc = model(**item).model_dump()
            issues = run_scan(key, doc)
            doc["issues"] = issues
            doc["needs_review"] = bool(publish_blockers(issues))
            if (doc.get("status") == "published" or doc.get("published") is True) and publish_blockers(issues):
                failed.append({"row": index, "error": "Failed quality checks",
                               "issues": publish_blockers(issues)})
                continue
            if key == "posts":
                base = slugify(doc.get("slug") or doc.get("title", ""))
                slug, n = base, 1
                while await db.posts.find_one({"slug": slug}):
                    n += 1
                    slug = f"{base}-{n}"
                doc["slug"] = slug
            await db[key].insert_one(doc)
            created += 1
        except Exception as exc:  # noqa: BLE001 — one bad row must not abort the import
            failed.append({"row": index, "error": str(exc)})
    await db.audit_log.insert_one({
        "id": str(uuid4()), "actor_id": principal["key_id"],
        "actor_email": f"api-key:{principal['name']}", "action": "import",
        "resource": key, "target_id": None,
        "detail": {"created": created, "failed": len(failed)},
        "created_at": datetime.now(timezone.utc),
    })
    return {"created": created, "failed": failed}


@router.get("/v1-docs/openapi")
async def v1_openapi():
    """Hand-written OpenAPI 3.1 description of the public v1 API (key-scoped)."""
    resources = sorted(V1_READ)
    return {
        "openapi": "3.1.0",
        "info": {
            "title": "TNL Studio Public API",
            "version": "1.0.0",
            "description": ("Read published laboratory content, and publish News and Members from "
                            "automation scripts. Authenticate with an `X-API-Key` header. Read keys "
                            "can only read; write keys can also create."),
        },
        "servers": [{"url": "/api"}],
        "components": {
            "securitySchemes": {"ApiKeyAuth": {"type": "apiKey", "in": "header", "name": "X-API-Key"}},
        },
        "security": [{"ApiKeyAuth": []}],
        "paths": {
            "/v1/{resource}": {
                "get": {
                    "summary": "List published items",
                    "parameters": [
                        {"name": "resource", "in": "path", "required": True,
                         "schema": {"type": "string", "enum": resources}},
                        {"name": "limit", "in": "query", "schema": {"type": "integer", "default": 50, "maximum": 100}},
                        {"name": "offset", "in": "query", "schema": {"type": "integer", "default": 0}},
                    ],
                    "responses": {"200": {"description": "A page of items"},
                                  "401": {"description": "Missing or invalid key"}},
                },
                "post": {
                    "summary": "Create an item (write scope; news and members only)",
                    "parameters": [{"name": "resource", "in": "path", "required": True,
                                    "schema": {"type": "string", "enum": ["news", "members"]}}],
                    "responses": {"201": {"description": "Created"},
                                  "403": {"description": "Key lacks the write scope"},
                                  "422": {"description": "Validation or quality-gate failure"}},
                },
            },
            "/v1/{resource}/{id}": {
                "get": {
                    "summary": "Fetch one item by id or slug",
                    "parameters": [
                        {"name": "resource", "in": "path", "required": True,
                         "schema": {"type": "string", "enum": resources}},
                        {"name": "id", "in": "path", "required": True, "schema": {"type": "string"}},
                    ],
                    "responses": {"200": {"description": "The item"}, "404": {"description": "Not found"}},
                },
            },
            "/v1/{resource}/import": {
                "post": {
                    "summary": "Bulk import items from JSON (write scope)",
                    "requestBody": {"required": True, "content": {"application/json": {"schema": {
                        "type": "object", "properties": {"items": {"type": "array", "items": {"type": "object"}}},
                        "required": ["items"]}}}},
                    "responses": {"200": {"description": "Per-row import result"}},
                },
            },
        },
    }
