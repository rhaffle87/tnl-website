"""Session auth + staff user management.

Login is email+password (bcrypt) with optional TOTP for accounts that enable it.
Sessions are httpOnly cookies (SameSite=Lax); the frontend never sees a token.
User management is restricted to Super Admin (action "users:manage").
"""

import os
import hashlib
import html
import secrets
from urllib.parse import quote
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from datetime import datetime, timedelta, timezone

from lib.auth import (
    aware, audit, clear_session_cookie, client_ip, create_session, destroy_session,
    hash_password, login_failure_key, new_totp_secret, require,
    set_session_cookie, totp_counter, user_for_request, verify_password,
)
from lib.db import db
from lib.rate_limit import rate_limit_async
from lib.mailer import send_email
from lib.serialize import jsonable
from models.core import InviteAccept, LoginIn, UserCreate, UserUpdate

router = APIRouter(tags=["auth"])

VALID_ROLES = ("super_admin", "editor", "contributor", "registrar", "viewer")
INVITE_TTL_DAYS = 7
TOTP_PENDING_MINUTES = 10


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _password_hash(password: str) -> str:
    if len(password) < 8 or len(password.encode("utf-8")) > 72:
        raise HTTPException(status_code=422, detail="Password must contain at least 8 characters and at most 72 UTF-8 bytes.")
    return hash_password(password)


def _app_link(path: str) -> str:
    return os.environ.get("APP_URL", "").rstrip("/") + path


def public_user(u: dict) -> dict:
    return {
        "id": u.get("id", ""),
        "name": u.get("name", ""),
        "email": u.get("email", ""),
        "role": u.get("role", "viewer"),
        "divisions": u.get("divisions") or [],
        "active": u.get("active", True),
        "totp_enabled": bool(u.get("totp_enabled")),
        "recovery_codes_remaining": len(u.get("totp_recovery_hashes") or []),
        "invite_pending": bool(u.get("invite_token")),
        "invite_expires_at": u["invite_expires_at"].isoformat() if isinstance(u.get("invite_expires_at"), datetime) else u.get("invite_expires_at"),
        "created_at": u.get("created_at").isoformat() if isinstance(u.get("created_at"), datetime) else u.get("created_at"),
        "last_login_at": u.get("last_login_at").isoformat() if isinstance(u.get("last_login_at"), datetime) else u.get("last_login_at"),
    }


async def verify_second_factor(user: dict, code: str | None) -> bool:
    if not user.get("totp_enabled"):
        return True
    if not code or not user.get("totp_secret"):
        return False
    counter = totp_counter(user["totp_secret"], code)
    if counter is not None:
        result = await db.users.update_one(
            {"id": user["id"], "active": True, "totp_secret": user["totp_secret"],
             "$or": [{"totp_last_counter": {"$exists": False}}, {"totp_last_counter": None},
                     {"totp_last_counter": {"$lt": counter}}]},
            {"$set": {"totp_last_counter": counter}},
        )
        if result.modified_count:
            user["totp_last_counter"] = counter
        return result.modified_count == 1
    recovery_hash = _digest(code.strip().upper().replace("-", ""))
    result = await db.users.update_one(
        {"id": user["id"], "active": True, "totp_enabled": True, "totp_recovery_hashes": recovery_hash},
        {"$pull": {"totp_recovery_hashes": recovery_hash}},
    )
    if result.modified_count:
        user["totp_recovery_hashes"] = [value for value in user.get("totp_recovery_hashes", []) if value != recovery_hash]
    return result.modified_count == 1


async def _reauthenticate(request: Request, user: dict, password: str | None, code: str | None = None) -> None:
    if password:
        authenticated = verify_password(password, user.get("password_hash", ""))
    else:
        session = await db.sessions.find_one({"token": request.cookies.get("tnl_session"), "user_id": user["id"]})
        authenticated = bool(session and aware(session.get("created_at", datetime.min)) >= datetime.now(timezone.utc) - timedelta(minutes=10))
    if not authenticated or (user.get("totp_enabled") and not await verify_second_factor(user, code)):
        raise HTTPException(status_code=401, detail="Confirm your password and current two-factor or recovery code to continue.")


def _new_recovery_codes() -> tuple[list[str], list[str]]:
    codes = [secrets.token_hex(8).upper() for _ in range(10)]
    return [f"{code[:8]}-{code[8:]}" for code in codes], [_digest(code) for code in codes]


def _auth_filter(user: dict) -> dict:
    version = user.get("auth_version", 0)
    query: dict = {"id": user["id"], "active": True}
    if version == 0:
        query["$or"] = [{"auth_version": 0}, {"auth_version": {"$exists": False}}]
    else:
        query["auth_version"] = version
    return query


async def _update_security(user: dict, patch: dict, request: Request, *, conditions: dict | None = None) -> dict:
    fresh = await db.users.find_one_and_update(
        {**_auth_filter(user), **(conditions or {})},
        {"$set": patch, "$inc": {"auth_version": 1}}, return_document=ReturnDocument.AFTER,
    )
    if not fresh:
        raise HTTPException(409, detail="Account authentication changed. Reload before continuing.")
    token = request.cookies.get("tnl_session")
    await db.sessions.update_one({"token": token, "user_id": user["id"], "auth_version": user.get("auth_version", 0)},
                                 {"$set": {"auth_version": fresh["auth_version"]}})
    await db.sessions.delete_many({"user_id": user["id"], "token": {"$ne": token}})
    return fresh


async def _send_invitation(user: dict) -> dict:
    link = _app_link(f"/admin/invite/{quote(user['invite_token'], safe='')}")
    return await send_email(
        user["email"], "You are invited to TNL Studio",
        f"<p>Hello {html.escape(user['name'])},</p><p>You have been invited to manage TNL Studio as "
        f"<b>{html.escape(user['role'])}</b>. Set your password here:</p>"
        f'<p><a href="{html.escape(link, quote=True)}">Set your password</a></p>',
    )


async def _last_super_admin_count(exclude_id: str | None = None) -> int:
    q: dict = {"role": "super_admin", "active": True}
    if exclude_id:
        q["id"] = {"$ne": exclude_id}
    return await db.users.count_documents(q)


@router.post("/auth/login")
async def login(payload: LoginIn, request: Request, response: Response):
    await rate_limit_async("login", f"login:{client_ip(request)}", 10, 300)
    email = payload.email.strip().lower()
    await rate_limit_async("login_email", login_failure_key(email, client_ip(request)), 10, 300)
    user = await db.users.find_one({"email": email})
    if not user or not user.get("active") or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    if not await verify_second_factor(user, payload.code):
        raise HTTPException(status_code=401, detail="A valid two-factor or unused recovery code is required.")
    token = await create_session(user["id"], auth_version=user.get("auth_version", 0))
    await db.users.update_one({"id": user["id"]}, {"$set": {"last_login_at": datetime.now(timezone.utc)}})
    request.state.user = user
    await audit(request, "login", "users", user["id"])
    set_session_cookie(response, token)
    return public_user(user)


@router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("tnl_session")
    if token:
        await destroy_session(token)
    clear_session_cookie(response)
    return {"ok": True}


@router.get("/auth/me")
async def me(request: Request):
    user = await user_for_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not signed in.")
    return public_user(user)


@router.post("/auth/accept-invite")
async def accept_invite(payload: InviteAccept, request: Request, response: Response):
    await rate_limit_async("invite", f"invite:{client_ip(request)}", 10, 300)
    password_hash = _password_hash(payload.password)
    if not payload.token:
        raise HTTPException(status_code=404, detail="This invitation link is no longer valid.")
    user = await db.users.find_one({"invite_token": payload.token})
    if not user or not user.get("active"):
        raise HTTPException(status_code=404, detail="This invitation link is no longer valid.")
    # Invitations created before expiry existed carry no timestamp and stay valid until used.
    expires = user.get("invite_expires_at")
    if expires and aware(expires) < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="This invitation link has expired. Ask a Super Admin for a new one.")
    user = await db.users.find_one_and_update(
        {"id": user["id"], "invite_token": payload.token, "active": True,
         "$or": [{"invite_expires_at": {"$gte": datetime.now(timezone.utc)}}, {"invite_expires_at": None}]},
        {"$set": {"password_hash": password_hash, "invite_token": None, "invite_expires_at": None}},
        return_document=ReturnDocument.AFTER,
    )
    if not user:
        raise HTTPException(status_code=404, detail="This invitation link is no longer valid.")
    token = await create_session(user["id"], auth_version=user.get("auth_version", 0))
    request.state.user = user
    await audit(request, "accept-invite", "users", user["id"])
    set_session_cookie(response, token)
    return public_user(user)


# ---------------------------------------------------------------- user management (Super Admin)
@router.get("/admin/users", dependencies=[Depends(require("users:manage"))])
async def list_users():
    users = await db.users.find({}, {"id": 1, "name": 1, "email": 1, "role": 1, "divisions": 1,
        "active": 1, "totp_enabled": 1, "totp_recovery_hashes": 1, "invite_token": 1,
        "invite_expires_at": 1, "created_at": 1, "last_login_at": 1}).to_list(500)
    return {"items": [public_user(u) for u in users]}


@router.post("/admin/users", status_code=201, dependencies=[Depends(require("users:manage"))])
async def create_user(payload: UserCreate, request: Request):
    if payload.role not in VALID_ROLES:
        raise HTTPException(status_code=422, detail="Unknown role.")
    email = payload.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="A user with this email already exists.")
    doc: dict = {
        "id": str(uuid4()), "name": payload.name.strip(), "email": email,
        "role": payload.role, "divisions": payload.divisions, "active": True,
        "password_hash": "", "invite_token": None, "invite_expires_at": None,
        "created_at": datetime.now(timezone.utc), "last_login_at": None,
    }
    if payload.password:
        doc["password_hash"] = _password_hash(payload.password)
    else:
        doc["invite_token"] = secrets.token_urlsafe(24)
        doc["invite_expires_at"] = datetime.now(timezone.utc) + timedelta(days=INVITE_TTL_DAYS)
    try:
        await db.users.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="A user with this email already exists.") from None
    if doc["invite_token"]:
        await _send_invitation(doc)
    await audit(request, "create", "users", doc["id"], {"email": email, "role": payload.role})
    return public_user(doc)


@router.patch("/admin/users/{user_id}", dependencies=[Depends(require("users:manage"))])
async def update_user(user_id: str, payload: UserUpdate, request: Request):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    patch = payload.model_dump(exclude_unset=True)
    if "totp_enabled" in patch and patch["totp_enabled"] != bool(user.get("totp_enabled")):
        raise HTTPException(status_code=422, detail="Use self-service two-factor setup or disable to change this setting.")
    if any(value is None for value in patch.values()):
        raise HTTPException(status_code=422, detail="User fields cannot be null.")
    if "role" in patch:
        if patch["role"] not in VALID_ROLES:
            raise HTTPException(status_code=422, detail="Unknown role.")
        if user["role"] == "super_admin" and patch["role"] != "super_admin":
            if await _last_super_admin_count(user_id) == 0:
                raise HTTPException(status_code=400, detail="Cannot demote the last active Super Admin. Invite another Super Admin first.")
    if "active" in patch and patch["active"] is False and user_id == (request.state.user or {}).get("id"):
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account.")
    if patch.get("active") is False and user.get("role") == "super_admin" and await _last_super_admin_count(user_id) == 0:
        raise HTTPException(status_code=400, detail="Cannot deactivate the last active Super Admin.")
    if "password" in patch:
        patch["password_hash"] = _password_hash(patch.pop("password"))
    invalidate = "password_hash" in patch or patch.get("active") is False
    if invalidate:
        patch.update({"invite_token": None, "invite_expires_at": None,
                      "password_reset_hash": None, "password_reset_expires_at": None})
    if patch:
        update: dict = {"$set": patch}
        if invalidate:
            update["$inc"] = {"auth_version": 1}
        await db.users.update_one({"id": user_id}, update)
    if invalidate:
        await db.sessions.delete_many({"user_id": user_id})
    await audit(request, "update", "users", user_id, {k: v for k, v in patch.items() if k != "password_hash"})
    fresh = await db.users.find_one({"id": user_id})
    return public_user(fresh)


@router.post("/admin/users/{user_id}/invite", dependencies=[Depends(require("users:manage"))])
async def resend_invite(user_id: str, request: Request):
    await rate_limit_async("invite_resend", f"invite-resend:{user_id}", 5, 300)
    user = await db.users.find_one_and_update(
        {"id": user_id, "active": True, "password_hash": "", "google_sub": None},
        {"$set": {"invite_token": secrets.token_urlsafe(24),
                  "invite_expires_at": datetime.now(timezone.utc) + timedelta(days=INVITE_TTL_DAYS)}},
        return_document=ReturnDocument.AFTER,
    )
    if not user:
        raise HTTPException(status_code=409, detail="Only an active account awaiting a password can be invited.")
    delivery = await _send_invitation(user)
    await audit(request, "invite-resend", "users", user_id)
    return {**public_user(user), "delivery_status": delivery.get("status", "queued")}


@router.delete("/admin/users/{user_id}/invite", dependencies=[Depends(require("users:manage"))])
async def revoke_invite(user_id: str, request: Request):
    result = await db.users.update_one({"id": user_id}, {"$set": {"invite_token": None, "invite_expires_at": None}})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="User not found.")
    await audit(request, "invite-revoke", "users", user_id)
    return {"ok": True}


@router.delete("/admin/users/{user_id}", dependencies=[Depends(require("users:manage"))])
async def delete_user(user_id: str, request: Request):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    if user_id == (request.state.user or {}).get("id"):
        raise HTTPException(status_code=400, detail="You cannot delete your own account.")
    if user.get("role") == "super_admin" and await _last_super_admin_count(user_id) == 0:
        raise HTTPException(status_code=400, detail="Cannot delete the last active Super Admin.")
    await db.users.delete_one({"id": user_id})
    await db.sessions.delete_many({"user_id": user_id})
    await audit(request, "delete", "users", user_id, {"email": user.get("email")})
    return {"ok": True}


# ---------------------------------------------------------------- self-service TOTP enrolment
class TotpConfirm(BaseModel):
    code: str = Field(min_length=1, max_length=64)


class Reauthenticate(BaseModel):
    password: str | None = Field(default=None, max_length=256)
    code: str | None = Field(default=None, max_length=64)


async def _signed_in_user(request: Request) -> dict:
    user = await user_for_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not signed in.")
    request.state.user = user
    return user


def _assert_self(request: Request, user_id: str) -> dict:
    principal_user = getattr(request.state, "user", None) or {}
    if principal_user.get("id") != user_id:
        raise HTTPException(status_code=403, detail="Two-factor setup is self-service only.")
    return principal_user


@router.post("/admin/users/{user_id}/totp-setup")
async def totp_setup(user_id: str, request: Request, payload: Reauthenticate | None = None, _=Depends(_signed_in_user)):
    """Generate a *pending* secret for the signed-in user, returned exactly once.

    Existing secrets are never read or returned; enrolment completes via totp-confirm."""
    _assert_self(request, user_id)
    await rate_limit_async("totp_setup", f"totp-setup:{user_id}", 10, 300)
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    proof = payload or Reauthenticate()
    await _reauthenticate(request, user, proof.password, proof.code)
    secret = new_totp_secret()
    result = await db.users.update_one(_auth_filter(user), {"$set": {
        "totp_pending_secret": secret, "totp_pending_at": datetime.now(timezone.utc)}})
    if not result.modified_count:
        raise HTTPException(409, detail="Account authentication changed. Start setup again.")
    await audit(request, "totp-setup", "users", user_id)
    return {"secret": secret, "email": user.get("email"),
            "otpauth_uri": f"otpauth://totp/{quote('TNL Studio:' + user.get('email', ''), safe='')}?secret={secret}&issuer=TNL%20Studio&digits=6&period=30",
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=TOTP_PENDING_MINUTES)).isoformat(),
            "message": "Confirm with a code from your authenticator app to enable 2FA."}


@router.post("/admin/users/{user_id}/totp-confirm")
async def totp_confirm(user_id: str, payload: TotpConfirm, request: Request, _=Depends(_signed_in_user)):
    _assert_self(request, user_id)
    await rate_limit_async("totp_confirm", f"totp-confirm:{user_id}", 10, 300)
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    pending = user.get("totp_pending_secret")
    pending_at = user.get("totp_pending_at")
    counter = totp_counter(pending, payload.code) if pending else None
    if not pending_at or aware(pending_at) < datetime.now(timezone.utc) - timedelta(minutes=TOTP_PENDING_MINUTES) or counter is None:
        raise HTTPException(status_code=422, detail="Invalid or missing pending TOTP code.")
    codes, hashes = _new_recovery_codes()
    await _update_security(user, {
        "totp_secret": pending, "totp_enabled": True,
        "totp_last_counter": counter, "totp_recovery_hashes": hashes,
        "totp_pending_secret": None, "totp_pending_at": None}, request,
        conditions={"totp_pending_secret": pending, "totp_pending_at": pending_at})
    await audit(request, "totp-confirm", "users", user_id)
    return {"ok": True, "totp_enabled": True, "recovery_codes": codes}


@router.post("/admin/users/{user_id}/totp-recovery-codes")
async def regenerate_recovery_codes(user_id: str, payload: Reauthenticate, request: Request, _=Depends(_signed_in_user)):
    user = _assert_self(request, user_id)
    await rate_limit_async("totp_recovery", f"totp-recovery:{user_id}", 5, 300)
    if not user.get("totp_enabled"):
        raise HTTPException(status_code=409, detail="Enable two-factor authentication first.")
    await _reauthenticate(request, user, payload.password, payload.code)
    codes, hashes = _new_recovery_codes()
    await _update_security(user, {"totp_recovery_hashes": hashes}, request)
    await audit(request, "totp-recovery-regenerate", "users", user_id)
    return {"ok": True, "recovery_codes": codes}


@router.post("/admin/users/{user_id}/totp-disable")
async def disable_totp(user_id: str, payload: Reauthenticate, request: Request, _=Depends(_signed_in_user)):
    user = _assert_self(request, user_id)
    await rate_limit_async("totp_disable", f"totp-disable:{user_id}", 5, 300)
    await _reauthenticate(request, user, payload.password, payload.code)
    await _update_security(user, {
        "totp_enabled": False, "totp_secret": None, "totp_recovery_hashes": [],
        "totp_pending_secret": None, "totp_pending_at": None, "totp_last_counter": None}, request)
    await audit(request, "totp-disable", "users", user_id)
    return {"ok": True, "totp_enabled": False}


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str = Field(min_length=16, max_length=256)
    password: str = Field(min_length=8, max_length=256)


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    password: str = Field(min_length=8, max_length=256)
    code: str | None = Field(default=None, max_length=64)


@router.post("/auth/password-reset/request")
async def request_password_reset(payload: PasswordResetRequest, request: Request):
    email = str(payload.email).strip().lower()
    await rate_limit_async("password_reset", f"password-reset:{client_ip(request)}", 5, 300)
    await rate_limit_async("password_reset_email", f"password-reset:{_digest(email)}:{client_ip(request)}", 3, 900)
    token = secrets.token_urlsafe(32)
    user = await db.users.find_one_and_update(
        {"email": email, "active": True,
         "$or": [{"password_hash": {"$nin": ["", None]}}, {"google_sub": {"$type": "string"}}]},
        {"$set": {"password_reset_hash": _digest(token),
                  "password_reset_expires_at": datetime.now(timezone.utc) + timedelta(minutes=30)}},
        return_document=ReturnDocument.AFTER,
    )
    if user:
        link = _app_link(f"/admin/reset-password?token={quote(token, safe='')}")
        await send_email(email, "Reset your TNL Studio password",
                         f'<p>A password reset was requested for your account.</p><p><a href="{html.escape(link, quote=True)}">Reset password</a></p><p>This link expires in 30 minutes. Your two-factor authentication remains enabled.</p>')
        await audit(request, "password-reset-request", "users", user["id"], actor={"id": user["id"]})
    return {"ok": True, "message": "If this active account exists, a password reset link has been queued."}


@router.post("/auth/password-reset/confirm")
async def confirm_password_reset(payload: PasswordResetConfirm, request: Request, response: Response):
    await rate_limit_async("password_reset_confirm", f"password-reset-confirm:{client_ip(request)}", 10, 300)
    password_hash = _password_hash(payload.password)
    user = await db.users.find_one_and_update(
        {"password_reset_hash": _digest(payload.token), "password_reset_expires_at": {"$gt": datetime.now(timezone.utc)}, "active": True},
        {"$set": {"password_hash": password_hash, "password_reset_hash": None,
                  "password_reset_expires_at": None, "invite_token": None, "invite_expires_at": None},
         "$inc": {"auth_version": 1}},
        return_document=ReturnDocument.AFTER,
    )
    if not user:
        raise HTTPException(status_code=400, detail="This password reset link is invalid or expired.")
    await db.sessions.delete_many({"user_id": user["id"]})
    clear_session_cookie(response)
    await audit(request, "password-reset", "users", user["id"], actor={"id": user["id"]})
    return {"ok": True}


@router.post("/auth/password/change")
async def change_password(payload: PasswordChange, request: Request, response: Response, _=Depends(_signed_in_user)):
    user = request.state.user
    await rate_limit_async("password_change", f"password-change:{user['id']}", 5, 300)
    await _reauthenticate(request, user, payload.current_password, payload.code)
    password_hash = _password_hash(payload.password)
    result = await db.users.update_one(_auth_filter(user), {"$set": {
        "password_hash": password_hash, "password_reset_hash": None, "password_reset_expires_at": None},
        "$inc": {"auth_version": 1}})
    if not result.modified_count:
        raise HTTPException(409, detail="Account authentication changed. Sign in again.")
    await db.sessions.delete_many({"user_id": user["id"]})
    clear_session_cookie(response)
    await audit(request, "password-change", "users", user["id"])
    return {"ok": True}


@router.get("/admin/review-queue", dependencies=[Depends(require("content:read"))])
async def review_queue():
    """Needs-review queue: saved documents that currently fail one or more quality gates."""
    from routers.content import RESOURCES, TITLE_FIELD
    out = []
    for resource, spec in RESOURCES.items():
        docs = await db[resource].find({"needs_review": True}).to_list(100)
        for d in docs:
            out.append({
                "resource": resource,
                "id": d.get("id"),
                "title": d.get(TITLE_FIELD[resource], "(untitled)"),
                "issues": d.get("issues", []),
            })
    return {"items": jsonable(out)}
