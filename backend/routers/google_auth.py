"""Emergent-managed Google sign-in.

The browser is sent to auth.emergentagent.com, comes back with #session_id=…,
and the FRONTEND hands that id to this backend, which exchanges it for profile
data server-side. Accounts must (a) be on the domain allowlist and (b) already
exist as an invited staff user — there is no self-signup, because the lab's
admin roster rotates and must stay deliberate.

The exchange reuses the same `sessions` collection and httpOnly cookie as the
email+password login, so the rest of the app knows nothing about auth method.
"""

import logging
import os
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from lib.auth import audit, create_session, set_session_cookie
from lib.db import db
from routers.auth import public_user

router = APIRouter(tags=["auth"])
logger = logging.getLogger(__name__)

SESSION_DATA_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"


def allowed_domains() -> list[str]:
    raw = os.environ.get("GOOGLE_ALLOWED_DOMAINS", "its.ac.id,student.its.ac.id")
    return [d.strip().lower().lstrip("@") for d in raw.split(",") if d.strip()]


def allowed_emails() -> list[str]:
    raw = os.environ.get("GOOGLE_ALLOWED_EMAILS", "")
    return [e.strip().lower() for e in raw.split(",") if e.strip()]


def email_allowed(email: str) -> bool:
    email = (email or "").strip().lower()
    if email in allowed_emails():
        return True
    domain = email.rsplit("@", 1)[-1] if "@" in email else ""
    return any(domain == d or domain.endswith("." + d) for d in allowed_domains())


class SessionExchange(BaseModel):
    session_id: str


@router.get("/auth/google/config")
async def google_config():
    """What the sign-in screen needs to render the Google button and its rules."""
    return {
        "enabled": True,
        "allowed_domains": allowed_domains(),
        "allowed_emails": allowed_emails(),
        "auth_base": "https://auth.emergentagent.com/",
    }


@router.post("/auth/google/session")
async def google_session(payload: SessionExchange, request: Request, response: Response):
    """Exchange the one-time session_id for a profile, then open an app session.

    The call to Emergent Auth happens here, server-side — never from the browser.
    """
    try:
        async with httpx.AsyncClient(timeout=15) as hc:
            resp = await hc.get(SESSION_DATA_URL, headers={"X-Session-ID": payload.session_id})
    except httpx.HTTPError as exc:
        logger.warning("google session exchange failed: %s", exc)
        raise HTTPException(status_code=503, detail="Could not reach the sign-in service. Please try again.")
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="This sign-in link has expired. Please try signing in again.")
    profile = resp.json()
    email = (profile.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Google did not return an email address.")

    if not email_allowed(email):
        domains = ", ".join("@" + d for d in allowed_domains())
        raise HTTPException(status_code=403, detail=(
            f"{email} is not allowed to sign in. Use an ITS account ({domains}) "
            "or sign in with your email and password."))

    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=403, detail=(
            f"{email} has no TNL Studio account yet. Ask a Super Admin to invite this address first."))
    if not user.get("active", False):
        raise HTTPException(status_code=403, detail="This account has been deactivated. Contact a Super Admin.")

    await db.users.update_one({"id": user["id"]}, {"$set": {
        "last_login_at": datetime.now(timezone.utc),
        "google_name": profile.get("name") or user.get("name"),
        "google_picture": profile.get("picture"),
        "auth_method": "google",
    }})
    token = await create_session(user["id"])
    request.state.user = user
    await audit(request, "login-google", "users", user["id"])
    set_session_cookie(response, token)
    fresh = await db.users.find_one({"id": user["id"]})
    return public_user(fresh)
