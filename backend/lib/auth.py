"""Auth & authorization primitives: bcrypt passwords, httpOnly cookie sessions,
RBAC (Super Admin / Editor / Contributor / Registrar / Viewer), division scoping,
login rate limiting and optional TOTP (RFC 6238).

One decision point: `require(action)` — every admin route declares the action it
needs; deny-by-default. Division scoping narrows WRITES per user via `can_write_division`.
"""

import base64
import hashlib
import hmac
import os
import secrets
import struct
import time
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import HTTPException, Request

from lib.db import db

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
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("ascii"))
    except (ValueError, TypeError):
        return False


def aware(dt: datetime) -> datetime:
    """Motor returns naive UTC datetimes — normalise before comparing/serialising."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# ---------------------------------------------------------------- sessions
async def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    await db.sessions.insert_one({
        "token": token,
        "user_id": user_id,
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
    if not user or not user.get("active", False):
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


# ---------------------------------------------------------------- rate limiting (in-memory, single process)
_buckets: dict[str, list[float]] = {}


def rate_limit(key: str, limit: int, window_s: int) -> None:
    now = time.time()
    hits = [t for t in _buckets.get(key, []) if now - t < window_s]
    if len(hits) >= limit:
        raise HTTPException(status_code=429, detail="Too many attempts. Please try again later.")
    hits.append(now)
    _buckets[key] = hits


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def login_failure_key(email: str, ip: str) -> str:
    """Scope repeated-login limits to one IP *and* one account, never to the account alone:

    otherwise anyone knowing a victim's address could lock that victim out."""
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


def verify_totp(secret: str, code: str, window: int = 1) -> bool:
    counter = int(time.time()) // 30
    want = code.strip().zfill(6)
    return any(hmac.compare_digest(_totp(secret, counter + drift), want) for drift in range(-window, window + 1))


# ---------------------------------------------------------------- audit trail
def audit_hash(prev_hash: str, actor_id: str, action: str, resource: str,
               target_id: str | None, created_at: datetime) -> str:
    """One-way link to the previous entry: editing an old row breaks every later hash."""
    payload = "|".join((prev_hash or "", actor_id or "", action, resource,
                        target_id or "", created_at.isoformat()))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


async def audit(request: Request, action: str, resource: str, target_id: str | None = None,
                detail: dict | None = None, actor: dict | None = None) -> None:
    state = getattr(getattr(request, "state", None), "user", None)
    user = actor or state or {}
    created = datetime.now(timezone.utc)
    last = await db.audit_log.find_one({}, sort=[("created_at", -1)])
    prev_hash = (last or {}).get("hash") or ""
    actor_id = user.get("id") or user.get("key_id") or ""
    await db.audit_log.insert_one({
        "id": str(__import__("uuid").uuid4()),
        "actor_id": actor_id,
        "actor_email": user.get("email", "anonymous"),
        "action": action,
        "resource": resource,
        "target_id": target_id,
        "detail": detail or {},
        "created_at": created,
        "prev_hash": prev_hash,
        "hash": audit_hash(prev_hash, actor_id, action, resource, target_id, created),
    })


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


def sign_upload(filename: str) -> str:
    return hmac.new(_upload_signing_secret(), filename.encode(), hashlib.sha256).hexdigest()[:32]


def verify_upload_sig(filename: str, sig: str | None) -> bool:
    if not sig:
        return False
    expected = sign_upload(filename)
    return hmac.compare_digest(expected, sig)

