"""Shared Mongo handle — import `client`/`db` from here (server.py, routers, seed.py)."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

load_dotenv(Path(__file__).parent.parent / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

logger = logging.getLogger(__name__)

# Insertion-time fence: leases can expire between reading the head and inserting.
# Sparse keeps pre-sequence legacy rows out of the uniqueness constraint.
AUDIT_SEQUENCE_INDEX = IndexModel(
    [("seq", DESCENDING)], name="audit_seq_unique", unique=True, sparse=True,
)

# One entry per collection: every field a route filters, sorts, or dedupes on. Applied by ensure_indexes() at startup.
INDEXES: dict[str, list[IndexModel]] = {
    "users": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("email", ASCENDING)], name="email", unique=True),
        IndexModel([("invite_token", ASCENDING)], name="invite_token", sparse=True),
    ],
    "sessions": [
        IndexModel([("token", ASCENDING)], name="token", unique=True),
        IndexModel([("user_id", ASCENDING)], name="user_id"),
        IndexModel([("expires_at", ASCENDING)], name="ttl", expireAfterSeconds=0),
    ],
    "pages": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("slug", ASCENDING)], name="slug", unique=True),
        IndexModel([("status", ASCENDING)], name="status"),
    ],
    "posts": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("slug", ASCENDING)], name="slug", unique=True),
        IndexModel([("status", ASCENDING), ("published_at", DESCENDING)], name="status_published"),
        IndexModel([("category", ASCENDING)], name="category"),
        IndexModel([("tags", ASCENDING)], name="tags"),
        IndexModel([("needs_review", ASCENDING)], name="needs_review"),
    ],
    "members": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("published", ASCENDING), ("order", ASCENDING)], name="published_order"),
        IndexModel([("role", ASCENDING), ("status", ASCENDING)], name="role_status"),
        IndexModel([("batch", ASCENDING)], name="batch"),
        IndexModel([("needs_review", ASCENDING)], name="needs_review"),
    ],
    "events": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("slug", ASCENDING)], name="slug", unique=True),
        IndexModel([("status", ASCENDING), ("start_date", ASCENDING)], name="status_start"),
        IndexModel([("type", ASCENDING)], name="type"),
        IndexModel([("needs_review", ASCENDING)], name="needs_review"),
    ],
    "activities": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("published", ASCENDING), ("order", ASCENDING)], name="published_order"),
        IndexModel([("category", ASCENDING)], name="category"),
        IndexModel([("needs_review", ASCENDING)], name="needs_review"),
    ],
    "equipment": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("published", ASCENDING), ("order", ASCENDING)], name="published_order"),
        IndexModel([("category", ASCENDING)], name="category"),
        IndexModel([("needs_review", ASCENDING)], name="needs_review"),
    ],
    "projects": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("status", ASCENDING), ("kind", ASCENDING)], name="status_kind"),
        IndexModel([("needs_review", ASCENDING)], name="needs_review"),
    ],
    "publications": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("status", ASCENDING), ("year", DESCENDING)], name="status_year"),
        IndexModel([("needs_review", ASCENDING)], name="needs_review"),
    ],
    "partners": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("published", ASCENDING), ("order", ASCENDING)], name="published_order"),
        IndexModel([("needs_review", ASCENDING)], name="needs_review"),
    ],
    "practicum": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("published", ASCENDING), ("order", ASCENDING)], name="published_order"),
        IndexModel([("needs_review", ASCENDING)], name="needs_review"),
    ],
    "registrations": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("event_id", ASCENDING), ("status", ASCENDING)], name="event_status"),
        IndexModel([("event_id", ASCENDING), ("email", ASCENDING)], name="event_email"),
        IndexModel([("event_id", ASCENDING), ("nim", ASCENDING)], name="event_nim"),
        IndexModel([("event_id", ASCENDING), ("email_normalized", ASCENDING)], name="event_email_unique",
                   unique=True, partialFilterExpression={"email_normalized": {"$type": "string", "$gt": ""}}),
        IndexModel([("event_id", ASCENDING), ("nim_normalized", ASCENDING)], name="event_nim_unique",
                   unique=True, partialFilterExpression={"nim_normalized": {"$type": "string", "$gt": ""}}),
        IndexModel([("certificate_code", ASCENDING)], name="certificate_code", sparse=True),
        IndexModel([("created_at", DESCENDING)], name="created_desc"),
    ],
    "messages": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("status", ASCENDING), ("created_at", DESCENDING)], name="status_created"),
    ],
    "media": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("folder", ASCENDING), ("created_at", DESCENDING)], name="folder_created"),
        IndexModel([("kind", ASCENDING)], name="kind"),
    ],
    "api_keys": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("key_hash", ASCENDING)], name="key_hash", unique=True),
        IndexModel([("active", ASCENDING)], name="api_keys_active"),
    ],
    "audit_log": [
        IndexModel([("created_at", DESCENDING)], name="created_desc"),
        IndexModel([("created_at", DESCENDING), ("action", ASCENDING)], name="audit_created_action"),
        IndexModel([("resource", ASCENDING), ("target_id", ASCENDING), ("action", ASCENDING)], name="resource_target"),
        # Unique seq fences stale writers at insert, including after lease expiry.
        AUDIT_SEQUENCE_INDEX,
        # One root ("") and no duplicate prev_hash is what an unforked chain means.
        IndexModel([("prev_hash", ASCENDING)], name="prev_hash"),
    ],
    "audit_locks": [
        IndexModel([("expires_at", ASCENDING)], name="lock_expires"),
    ],
    "settings": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
    "saved_blocks": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
    "collections_def": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("key", ASCENDING)], name="key", unique=True),
    ],
    "collection_items": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("collection_key", ASCENDING), ("created_at", DESCENDING)], name="collection_created"),
    ],
    "outbox": [
        IndexModel([("id", ASCENDING)], name="notification_id", unique=True, sparse=True),
        IndexModel([("created_at", DESCENDING)], name="created_desc"),
        IndexModel([("status", ASCENDING), ("next_attempt_at", ASCENDING)], name="delivery_due"),
    ],
    "privacy_jobs": [
        IndexModel([("keys", ASCENDING)], name="erasure_upload_keys"),
        IndexModel([("key_hashes", ASCENDING)], name="erasure_upload_hashes"),
        IndexModel([("status", ASCENDING), ("next_attempt_at", ASCENDING)], name="erasure_due"),
    ],
}


async def ensure_indexes() -> None:
    from lib.registration_integrity import migrate_registration_keys
    preflight = await migrate_registration_keys(db)
    if preflight["conflicts"]:
        raise RuntimeError("Registration duplicate preflight failed. Run python -m lib.registration_integrity; "
                           "resolve the reported IDs explicitly before startup. No rows were deleted.")
    # Populated normalized keys are mandatory for legacy rows as well. Perform
    # this safe backfill only after the complete read-only duplicate preflight.
    if preflight["keys_to_backfill"]:
        await migrate_registration_keys(db, apply=True)
    safety_indexes = {("registrations", "id"), ("registrations", "event_email_unique"),
                      ("registrations", "event_nim_unique"), ("outbox", "notification_id")}
    for collection, models in INDEXES.items():
        for model in models:  # one at a time so a bad spec skips only itself
            try:
                spec = dict(model.document)
                keys = list(spec.pop("key").items())
                existing = (await db[collection].index_information()).get(spec["name"])
                if existing:
                    if (list(existing["key"]) != keys or bool(existing.get("unique")) != bool(spec.get("unique"))
                            or bool(existing.get("sparse")) != bool(spec.get("sparse"))
                            or existing.get("partialFilterExpression") != spec.get("partialFilterExpression")):
                        raise RuntimeError("Index options do not match the required definition")
                    continue
                if "partialFilterExpression" in spec:
                    await db[collection].create_index(keys, **spec)
                else:
                    await db[collection].create_indexes([model])
            except Exception as exc:
                name = model.document["name"]
                if (collection, name) in safety_indexes:
                    raise RuntimeError(f"Required safety index unavailable: {collection}.{name}") from exc
                logger.error("ensure_indexes(%s.%s) failed (%s)", collection, name, type(exc).__name__)
