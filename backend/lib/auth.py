"""Auth & authorization primitives: bcrypt passwords, httpOnly cookie sessions,
RBAC (Super Admin / Editor / Contributor / Registrar / Viewer), division scoping,
login rate limiting and optional TOTP (RFC 6238).

One decision point: `require(action)` — every admin route declares the action it
needs; deny-by-default. Division scoping narrows WRITES per user via `can_write_division`.
"""

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import struct
import time
import asyncio
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import HTTPException, Request
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from lib.db import AUDIT_SEQUENCE_INDEX, db

logger = logging.getLogger(__name__)

SESSION_COOKIE = "tnl_session"
SESSION_TTL_DAYS = 14

ROLES = ("super_admin", "editor", "contributor", "registrar", "viewer")
ROLE_LABELS = {
    "super_admin": "Super Admin",
    "editor": "Editor",
    "contributor": "Contributor",
    "registrar": "Registrar",
    "viewer": "Viewer",
}

PERMS: dict[str, set[str]] = {
    "super_admin": {"*"},
    "editor": {
        "content:create", "content:edit", "content:delete", "content:publish", "content:read",
        "pages:edit", "pages:publish", "media:manage",
        "messages:manage", "registrations:read", "audit:read", "settings:read", "settings:write",
    },
    "contributor": {"content:create", "content:edit", "content:read", "media:manage"},
    "registrar": {
        "registrations:read", "registrations:manage", "messages:manage",
        "content:read", "audit:read",
    },
    "viewer": {"content:read", "audit:read"},
}

# Division scoping: when a staff user has divisions set, writes to these resources
# require the matching division. Super Admin is never scoped.
DIVISION_OF = {
    "posts": "media",
    "practicum": "academics",
    "activities": "event",
    "events": "event",
    "equipment": "research",
}
DIVISION_LABELS = {
    "media": "Media",
    "academics": "Academics",
    "event": "Event",
    "research": "Research",
}
UNSCOPED_ROLES = ("super_admin",)


def hash_password(password: str) -> str:
    if len(password.encode("utf-8")) > 72:
        raise ValueError("Passwords may contain at most 72 UTF-8 bytes.")
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        if len(password.encode("utf-8")) > 72:
            return False
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("ascii"))
    except (ValueError, TypeError):
        return False


def aware(dt: datetime) -> datetime:
    """Motor returns naive UTC datetimes — normalise before comparing/serialising."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# ---------------------------------------------------------------- sessions
async def create_session(user_id: str, *, auth_version: int | None = None) -> str:
    user = await db.users.find_one({"id": user_id, "active": True})
    if not user or (auth_version is not None and user.get("auth_version", 0) != auth_version):
        raise HTTPException(status_code=401, detail="Sign in again to continue.")
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    await db.sessions.insert_one({
        "token": token,
        "user_id": user_id,
        "auth_version": user.get("auth_version", 0),
        "created_at": now,
        "expires_at": now + timedelta(days=SESSION_TTL_DAYS),
    })
    return token


async def destroy_session(token: str) -> None:
    await db.sessions.delete_one({"token": token})


async def user_for_request(request: Request) -> dict | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    sess = await db.sessions.find_one({"token": token})
    if not sess:
        return None
    if aware(sess["expires_at"]) < datetime.now(timezone.utc):
        await db.sessions.delete_one({"_id": sess["_id"]})
        return None
    user = await db.users.find_one({"id": sess["user_id"]})
    if not user or not user.get("active", False) or sess.get("auth_version", 0) != user.get("auth_version", 0):
        return None
    return user


def set_session_cookie(response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE, token,
        max_age=SESSION_TTL_DAYS * 24 * 3600,
        httponly=True, samesite="lax", path="/",
        secure=os.environ.get("COOKIE_SECURE", "false").lower() == "true",
    )


def clear_session_cookie(response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")


# ---------------------------------------------------------------- authorization
def principal(user: dict) -> dict:
    return {
        "user_id": user.get("id", ""),
        "email": user.get("email", ""),
        "role": user.get("role", "viewer"),
        "divisions": user.get("divisions") or [],
    }


# ---------------------------------------------------------------- laboratory assistant access
# Practicum modules, laboratory guides and shift schedules are staff-only: every signed-in,
# active staff role except the read-only `viewer`. This tuple is the single switch for that rule
# — the public API, the v1 API, the media file gate and the CMS read redaction all read it.
ASSISTANT_ROLES = ("super_admin", "editor", "contributor", "registrar")


def is_lab_assistant(user: dict | None) -> bool:
    """True when a signed-in, active user is entitled to practicum module files."""
    if not user or not user.get("active", False):
        return False
    return user.get("role") in ASSISTANT_ROLES


async def lab_assistant_for_request(request: Request) -> dict | None:
    """The session user when they qualify as a laboratory assistant, else None."""
    user = await user_for_request(request)
    return user if is_lab_assistant(user) else None


def allowed(p: dict, action: str) -> bool:
    perms = PERMS.get(p["role"], set())
    return "*" in perms or action in perms


def can_write_division(user: dict, resource: str) -> bool:
    if user.get("role") in UNSCOPED_ROLES:
        return True
    divisions = user.get("divisions") or []
    if not divisions:
        return True
    needed = DIVISION_OF.get(resource)
    return needed is None or needed in divisions


def require(action: str):
    """FastAPI dependency factory: 401 when signed out, 403 when the role lacks the action."""
    async def dep(request: Request) -> dict:
        user = await user_for_request(request)
        if user is None:
            raise HTTPException(status_code=401, detail="Sign in required.")
        if not allowed(principal(user), action):
            raise HTTPException(status_code=403, detail="Your role does not allow this action.")
        request.state.user = user
        return user

    # Expose the required action on the dependency so route guards can be audited
    # (see tests/test_permission_matrix.py: no permission may be granted to zero roles).
    dep.permission = action
    return dep


def client_ip(request: Request) -> str:
    """Use the peer validated by Uvicorn's trusted-proxy middleware, never raw headers."""
    return request.client.host if request.client else "unknown"


def login_failure_key(email: str, ip: str) -> str:
    """Scope limits to the IP and account so an attacker cannot lock out another IP."""
    digest = hashlib.sha256(email.strip().lower().encode("utf-8")).hexdigest()[:16]
    return f"login-attempt:{ip}:{digest}"


# ---------------------------------------------------------------- optional TOTP (RFC 6238)
def new_totp_secret() -> str:
    return base64.b32encode(os.urandom(20)).decode("ascii")


def _totp(secret: str, counter: int) -> str:
    key = base64.b32decode(secret + "=" * ((8 - len(secret) % 8) % 8))
    msg = struct.pack(">Q", counter)
    digest = hmac.new(key, msg, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % 1000000
    return f"{code:06d}"


def totp_counter(secret: str, code: str, window: int = 1) -> int | None:
    if not secret or not isinstance(code, str) or len(code.strip()) != 6 or not code.strip().isascii() or not code.strip().isdigit():
        return None
    counter = int(time.time()) // 30
    try:
        return next((counter + drift for drift in range(-window, window + 1)
                     if hmac.compare_digest(_totp(secret, counter + drift), code.strip())), None)
    except (ValueError, TypeError):
        return None


def verify_totp(secret: str, code: str, window: int = 1) -> bool:
    return totp_counter(secret, code, window) is not None


# ---------------------------------------------------------------- audit trail
# Leases reduce contention across workers, but cannot make read-head + insert
# atomic: a holder can pause until its lease expires. The unique sparse seq index
# fences stale inserts; a conflict must re-read the head and re-hash before retry.
AUDIT_LOCK_ID = "audit_chain"
AUDIT_LOCK_TTL = 30.0      # a holder that dies (crash/redeploy) keeps the claim this long
AUDIT_LOCK_TIMEOUT = 10.0  # how long a writer waits for the head of the chain
AUDIT_APPEND_ATTEMPTS = 8

_local_audit_lock: asyncio.Lock | None = None


def _get_audit_lock() -> asyncio.Lock:
    """Per-process fast path: keeps same-worker writers from hammering Mongo."""
    global _local_audit_lock
    if _local_audit_lock is None:
        _local_audit_lock = asyncio.Lock()
    return _local_audit_lock


async def _acquire_chain_lock(token: str, *, ttl: float = AUDIT_LOCK_TTL,
                              timeout: float = AUDIT_LOCK_TIMEOUT) -> bool:
    """Claim the cross-process chain lock. Returns False if it never freed up."""
    coll = db["audit_locks"]
    try:
        await coll.insert_one({"_id": AUDIT_LOCK_ID, "held": False, "token": None, "expires_at": 0})
    except DuplicateKeyError:
        pass  # already bootstrapped by this or another worker
    except Exception as exc:  # a mock/short-lived store may reject the insert; the CAS still works
        logger.debug("audit lock bootstrap: %s", exc)
    deadline = time.monotonic() + timeout
    while True:
        now = time.time()
        try:
            won = await coll.find_one_and_update(
                {"_id": AUDIT_LOCK_ID,
                 "$or": [{"held": False}, {"expires_at": {"$lt": now}}]},
                {"$set": {"held": True, "token": token, "expires_at": now + ttl}},
                return_document=ReturnDocument.AFTER,
            )
        except Exception as exc:  # insertion-time uniqueness remains the safety guard
            logger.warning("audit chain lease unavailable (%s); using unique-sequence append retries", exc)
            return False
        if won:
            return True
        if time.monotonic() >= deadline:
            logger.warning("audit chain lease timed out; using unique-sequence append retries")
            return False
        await asyncio.sleep(0.01 + 0.005 * (time.time() % 1))


async def _release_chain_lock(token: str) -> None:
    try:
        await db["audit_locks"].update_one(
            {"_id": AUDIT_LOCK_ID, "token": token},
            {"$set": {"held": False, "token": None}},
        )
    except Exception as exc:  # releasing must never mask the write that just happened
        logger.warning("audit chain lock release failed: %s", exc)


def _canonical_dt(value: datetime) -> str:
    """Stable ISO form for hashing: UTC, and identical before and after a Mongo round-trip.

    PyMongo hands datetimes back naive (UTC) unless ``tz_aware=True``, so a payload
    built from a live ``datetime.now(timezone.utc)`` would never match the stored one.
    """
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value.isoformat()


def _detail_has_datetimes(value) -> bool:
    if isinstance(value, datetime):
        return True
    if isinstance(value, dict):
        return any(_detail_has_datetimes(item) for item in value.values())
    if isinstance(value, (list, tuple)):
        return any(_detail_has_datetimes(item) for item in value)
    return False


def _typed_audit_detail(value):
    """Hash-only BSON-stable encoding; never modify the authored/stored detail.

    Tag every node so a datetime cannot be replaced by its rendered string or
    by a JSON object imitating a date tag. BSON treats tuples as arrays, naive
    dates as UTC, and retains only milliseconds of the UTC instant.
    """
    if isinstance(value, datetime):
        utc = (value.replace(tzinfo=timezone.utc) if value.tzinfo is None
               else value.astimezone(timezone.utc))
        utc = utc.replace(microsecond=(utc.microsecond // 1000) * 1000)
        return ["datetime", utc.isoformat()]
    if isinstance(value, dict):
        return ["object", [[key, _typed_audit_detail(item)] for key, item in sorted(value.items())]]
    if isinstance(value, (list, tuple)):
        return ["array", [_typed_audit_detail(item) for item in value]]
    return ["value", value]


def audit_hash(prev_hash: str, actor_id: str, action: str, resource: str,
               target_id: str | None, created_at: datetime,
               detail: dict | None = None, *, hash_version: int = 2) -> str:
    """One-way link to the previous entry: editing an old row breaks every later hash.

    v2 folds the canonical JSON of ``detail`` into the payload. v3 uses a typed,
    BSON-stable detail encoding for newly authored datetime details. Existing
    v1/v2 payload rules remain unchanged; historical hashes are never rewritten.
    """
    parts = [prev_hash or "", actor_id or "", action, resource,
             target_id or "", _canonical_dt(created_at)]
    if detail is not None:
        if hash_version >= 3:
            parts.append("bson-datetime-v1:" + json.dumps(
                _typed_audit_detail(detail), sort_keys=True, default=str, separators=(",", ":")))
        else:
            parts.append(json.dumps(detail, sort_keys=True, default=str, separators=(",", ":")))
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()


async def _audit_head() -> dict:
    last = await db.audit_log.find({"seq": {"$exists": True}}, {"seq": 1, "hash": 1}).sort("seq", -1).limit(1).to_list(1)
    if last:
        return last[0]
    # v1 has no sequence, and timestamps may tie after Mongo truncates them.
    # Follow the existing hashes instead of selecting an arbitrary legacy row.
    legacy = await db.audit_log.find(
        {"hash": {"$exists": True, "$nin": [None, ""]}},
        {"hash": 1, "prev_hash": 1},
    ).to_list(None)
    if not legacy:
        return {}
    tails = {row["hash"] for row in legacy} - {row.get("prev_hash") for row in legacy}
    if len(tails) != 1:
        raise RuntimeError("Cannot append audit entry: legacy chain has no unique tail")
    return {"hash": tails.pop()}


async def audit(request: Request, action: str, resource: str, target_id: str | None = None,
                detail: dict | None = None, actor: dict | None = None) -> None:
    state = getattr(getattr(request, "state", None), "user", None)
    user = actor or state or {}
    # MongoDB stores datetimes with millisecond precision. Hash the value that will
    # actually come back out, or every entry fails verification after a round-trip.
    now = datetime.now(timezone.utc)
    created = now.replace(microsecond=(now.microsecond // 1000) * 1000)
    actor_id = user.get("id") or user.get("key_id") or ""
    # Keep ordinary v2 bytes unchanged; only datetime details need the new codec.
    hash_version = 3 if _detail_has_datetimes(detail) else 2
    # Local and database leases are contention optimisations, not the fence.
    token = secrets.token_hex(16)
    async with _get_audit_lock():
        # Startup index creation is best-effort. Require the actual safety index
        # here too, before any insert; an unavailable/invalid index must fail closed.
        await db.audit_log.create_indexes([AUDIT_SEQUENCE_INDEX])
        claimed = await _acquire_chain_lock(token)
        try:
            for attempt in range(AUDIT_APPEND_ATTEMPTS):
                last = await _audit_head()
                prev_hash = last.get("hash") or ""
                seq = (last.get("seq") or 0) + 1
                try:
                    await db.audit_log.insert_one({
                        "id": str(__import__("uuid").uuid4()),
                        "actor_id": actor_id,
                        "actor_email": user.get("email", "anonymous"),
                        "action": action,
                        "resource": resource,
                        "target_id": target_id,
                        "detail": detail or {},
                        "created_at": created,
                        "seq": seq,
                        "prev_hash": prev_hash,
                        "hash_version": hash_version,
                        "hash": audit_hash(prev_hash, actor_id, action, resource, target_id, created,
                                           detail or {}, hash_version=hash_version),
                    })
                    return
                except DuplicateKeyError as exc:
                    # Another worker (possibly our lease's successor) committed
                    # this seq first. Never reuse its stale prev_hash on retry.
                    if attempt + 1 == AUDIT_APPEND_ATTEMPTS:
                        raise RuntimeError(
                            f"Cannot append audit entry after {AUDIT_APPEND_ATTEMPTS} conflicts"
                        ) from exc
        finally:
            if claimed:
                await _release_chain_lock(token)


def _hash_matches(doc: dict, prev: str) -> bool:
    """True when a stored row still hashes to its recorded ``hash``.

    v1 rows were hashed from a live datetime whose microseconds Mongo then dropped
    (millisecond storage), so the honest timestamp could be any of the 1000
    microsecond offsets. v1 rows are re-checked over that range instead of being
    declared broken; v2/v3 created_at values were pre-truncated and match exactly.
    """
    created = doc.get("created_at") or datetime.now(timezone.utc)
    detail = (doc.get("detail") or {}) if (doc.get("hash_version") or 1) >= 2 else None
    base = created.replace(tzinfo=created.tzinfo or timezone.utc)
    if (doc.get("hash_version") or 1) >= 2:
        return audit_hash(prev, doc.get("actor_id") or "", doc.get("action", ""),
                          doc.get("resource", ""), doc.get("target_id"), base, detail,
                          hash_version=doc.get("hash_version") or 1) == doc.get("hash")
    # Only the sub-millisecond digits are unknown: try all 1000 within the stored ms.
    ms_base = (base.microsecond // 1000) * 1000
    for us in range(1000):
        candidate = base.replace(microsecond=ms_base + us)
        if audit_hash(prev, doc.get("actor_id") or "", doc.get("action", ""),
                      doc.get("resource", ""), doc.get("target_id"), candidate, None) == doc.get("hash"):
            return True
    return False


async def _audit_verification_rows(limit: int | None):
    # Legacy timestamps can tie or run backwards. Reorder only hashed legacy
    # slots by links, retaining pre-chain rows' positions and limit accounting.
    legacy = await db.audit_log.find({"seq": {"$exists": False}}).sort("created_at", 1).to_list(None)
    remaining = {i: doc for i, doc in enumerate(legacy) if doc.get("hash")}
    children = {}
    for i, doc in remaining.items():
        predecessor = doc.get("prev_hash", "")
        if isinstance(predecessor, str):
            children.setdefault(predecessor, []).append(i)
    ordered = []
    prev = ""
    while isinstance(prev, str) and children.get(prev):
        i = children[prev].pop()
        if i not in remaining:
            break  # cycle: leave every unvisited row for the verifier to reject
        doc = remaining.pop(i)
        ordered.append(doc)
        prev = doc["hash"]
    # Never drop forks, disconnected components or cycles. Their predecessor
    # mismatch (or bad digest) must still be encountered by the verifier.
    ordered.extend(remaining.values())
    linked = iter(ordered)
    budget = abs(limit) if limit else None
    for doc in legacy:
        yield next(linked) if doc.get("hash") else doc
        if budget is not None:
            budget -= 1
            if budget == 0:
                return
    cursor = db.audit_log.find({"seq": {"$exists": True}}).sort([("seq", 1), ("created_at", 1)])
    if budget is not None:
        cursor = cursor.limit(budget)
    async for doc in cursor:
        yield doc


async def verify_audit_chain(limit: int | None = None) -> dict:
    """Re-hash entries in linked legacy order, then sequence order, reporting a break.

    v1 retains its detail-less payload, v2 its original JSON payload, and v3 its
    typed BSON-stable datetime detail payload. ``limit`` counts all visited rows
    (including skipped pre-chain rows); a successful prefix is not a full check.
    Resolving legacy links reads all unsequenced rows even for a bounded prefix.
    Returns ``{"checked": n, "skipped": n, "ok": bool, "broken_at": id|None}``.
    """
    checked = 0
    skipped = 0
    prev = ""
    async for doc in _audit_verification_rows(limit):
        # Only genuinely pre-chain rows are skippable. Removing a chained row's
        # hash (especially the tail's) must be reported as tampering, not skipped.
        if not doc.get("hash"):
            if any(field in doc for field in ("hash_version", "seq", "prev_hash")):
                return {"checked": checked, "skipped": skipped, "ok": False, "broken_at": doc.get("id")}
            skipped += 1
            continue
        if doc.get("prev_hash", "") != prev or not _hash_matches(doc, prev):
            return {"checked": checked, "skipped": skipped, "ok": False, "broken_at": doc.get("id")}
        prev = doc.get("hash") or ""
        checked += 1
    return {"checked": checked, "skipped": skipped, "ok": True, "broken_at": None}


# ---------------------------------------------------------------- signed uploads
def _upload_signing_secret() -> bytes:
    """Fail closed: a missing secret must never silently become a public constant."""
    secret = (os.environ.get("UPLOAD_SIGNING_SECRET")
              or os.environ.get("SESSION_SECRET")
              or os.environ.get("JWT_SECRET"))
    if not secret:
        raise RuntimeError(
            "UPLOAD_SIGNING_SECRET is not set; refusing to sign upload URLs. "
            "Set UPLOAD_SIGNING_SECRET (or SESSION_SECRET/JWT_SECRET) in the environment."
        )
    return secret.encode("utf-8")


def sign_upload(filename: str, *, expires_at: int | None = None) -> str:
    if expires_at is None:
        ttl = max(60, min(604800, int(os.environ.get("UPLOAD_URL_TTL_SECONDS") or "604800")))
        expires_at = int(time.time()) + ttl
    payload = f"{filename}\0{expires_at}".encode()
    signature = hmac.new(_upload_signing_secret(), payload, hashlib.sha256).hexdigest()[:32]
    return f"v1.{expires_at}.{signature}"


def verify_upload_sig(filename: str, sig: str | None) -> bool:
    if not sig:
        return False
    if sig.startswith("v1."):
        try:
            _, expiry, signature = sig.split(".")
            expires_at = int(expiry)
        except (ValueError, TypeError):
            return False
        if expires_at <= int(time.time()):
            return False
        return hmac.compare_digest(sign_upload(filename, expires_at=expires_at), sig)
    # Previously delivered links remain subject to registration/privacy eligibility at serving time.
    if len(sig) != 32 or any(character not in "0123456789abcdef" for character in sig):
        return False
    expected = hmac.new(_upload_signing_secret(), filename.encode(), hashlib.sha256).hexdigest()[:32]
    return hmac.compare_digest(expected, sig)

