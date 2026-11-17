"""Session auth + staff user management.

Login is email+password (bcrypt) with optional TOTP for accounts that enable it.
Sessions are httpOnly cookies (SameSite=Lax); the frontend never sees a token.
User management is restricted to Super Admin (action "users:manage").
"""

import os
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from datetime import datetime, timezone

from lib.auth import (
    audit, clear_session_cookie, client_ip, create_session, destroy_session,
    hash_password, rate_limit, require, set_session_cookie, user_for_request,
    verify_password, verify_totp,
)
from lib.db import db
from lib.mailer import send_email
from lib.serialize import jsonable
from models.core import InviteAccept, LoginIn, UserCreate, UserUpdate

router = APIRouter(tags=["auth"])

VALID_ROLES = ("super_admin", "editor", "contributor", "registrar", "viewer")


def public_user(u: dict) -> dict:
    return {
        "id": u.get("id", ""),
        "name": u.get("name", ""),
        "email": u.get("email", ""),
        "role": u.get("role", "viewer"),
        "divisions": u.get("divisions") or [],
        "active": u.get("active", True),
        "totp_enabled": bool(u.get("totp_enabled")),
        "created_at": u.get("created_at").isoformat() if isinstance(u.get("created_at"), datetime) else u.get("created_at"),
        "last_login_at": u.get("last_login_at").isoformat() if isinstance(u.get("last_login_at"), datetime) else u.get("last_login_at"),
    }


async def _last_super_admin_count(exclude_id: str | None = None) -> int:
    q: dict = {"role": "super_admin", "active": True}
    if exclude_id:
        q["id"] = {"$ne": exclude_id}
    return await db.users.count_documents(q)


@router.post("/auth/login")
async def login(payload: LoginIn, request: Request, response: Response):
    rate_limit(f"login:{client_ip(request)}", 10, 300)
    email = payload.email.strip().lower()
    rate_limit(f"login-email:{email}", 10, 300)
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    if user.get("totp_enabled") and user.get("totp_secret"):
        if not payload.code or not verify_totp(user["totp_secret"], payload.code):
            raise HTTPException(status_code=401, detail="A valid two-factor code is required.")
    token = await create_session(user["id"])
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
    rate_limit(f"invite:{client_ip(request)}", 10, 300)
    if len(payload.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters.")
    user = await db.users.find_one({"invite_token": payload.token})
    if not user:
        raise HTTPException(status_code=404, detail="This invitation link is no longer valid.")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": hash_password(payload.password), "active": True, "invite_token": None}},
    )
    token = await create_session(user["id"])
    request.state.user = user
    await audit(request, "accept-invite", "users", user["id"])
    set_session_cookie(response, token)
    return public_user(user)


# ---------------------------------------------------------------- user management (Super Admin)
@router.get("/admin/users", dependencies=[Depends(require("users:manage"))])
async def list_users():
    users = await db.users.find({}, {"password_hash": 0, "totp_secret": 0, "invite_token": 0}).to_list(500)
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
        "password_hash": "", "invite_token": None,
        "created_at": datetime.now(timezone.utc), "last_login_at": None,
    }
    if payload.password:
        if len(payload.password) < 8:
            raise HTTPException(status_code=422, detail="Password must be at least 8 characters.")
        doc["password_hash"] = hash_password(payload.password)
    else:
        doc["invite_token"] = __import__("secrets").token_urlsafe(24)
        base = os.environ.get("APP_URL", "").rstrip("/")
        link = f"{base}/admin/invite/{doc['invite_token']}" if base else f"/admin/invite/{doc['invite_token']}"
        await send_email(
            email, "You are invited to TNL Studio",
            f"<p>Hello {payload.name},</p><p>You have been invited to manage TNL Studio as "
            f"<b>{payload.role}</b>. Set your password here:</p><p><a href=\"{link}\">{link}</a></p>",
        )
    await db.users.insert_one(doc)
    await audit(request, "create", "users", doc["id"], {"email": email, "role": payload.role})
    return public_user(doc)


@router.patch("/admin/users/{user_id}", dependencies=[Depends(require("users:manage"))])
async def update_user(user_id: str, payload: UserUpdate, request: Request):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    patch = payload.model_dump(exclude_unset=True)
    if "role" in patch:
        if patch["role"] not in VALID_ROLES:
            raise HTTPException(status_code=422, detail="Unknown role.")
        if user["role"] == "super_admin" and patch["role"] != "super_admin":
            if await _last_super_admin_count(user_id) == 0:
                raise HTTPException(status_code=400, detail="Cannot demote the last active Super Admin. Invite another Super Admin first.")
    if "active" in patch and patch["active"] is False and user_id == (request.state.user or {}).get("id"):
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account.")
    if "password" in patch:
        if len(patch["password"] or "") < 8:
            raise HTTPException(status_code=422, detail="Password must be at least 8 characters.")
        patch["password_hash"] = hash_password(patch.pop("password"))
    if patch:
        await db.users.update_one({"id": user_id}, {"$set": patch})
    await audit(request, "update", "users", user_id, {k: v for k, v in patch.items() if k != "password_hash"})
    fresh = await db.users.find_one({"id": user_id}, {"password_hash": 0, "totp_secret": 0, "invite_token": 0})
    return public_user(fresh)


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


@router.get("/admin/users/{user_id}/totp-setup", dependencies=[Depends(require("users:manage"))])
async def totp_setup(user_id: str):
    """Return (and persist) a TOTP secret for a Super Admin — shown as a base32 key to
    enrol in any authenticator app. Enabled via PATCH totp_enabled=true."""
    from lib.auth import new_totp_secret
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    secret = user.get("totp_secret") or new_totp_secret()
    if not user.get("totp_secret"):
        await db.users.update_one({"id": user_id}, {"$set": {"totp_secret": secret}})
    return {"secret": secret, "email": user.get("email")}


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
