"""Google sign-in router for TNL Studio.

Third-party Emergent OAuth proxy calls have been decommissioned for production security.
Google Sign-In is disabled until official direct Google OIDC is configured.
"""

import logging
import os

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

router = APIRouter(tags=["auth"])
logger = logging.getLogger(__name__)


def allowed_domains() -> list[str]:
    raw = os.environ.get("GOOGLE_ALLOWED_DOMAINS", "its.ac.id,student.its.ac.id")
    return [d.strip().lower().lstrip("@") for d in raw.split(",") if d.strip()]


def allowed_emails() -> list[str]:
    raw = os.environ.get("GOOGLE_ALLOWED_EMAILS", "")
    return [e.strip().lower() for e in raw.split(",") if e.strip()]


class SessionExchange(BaseModel):
    session_id: str


@router.get("/auth/google/config")
async def google_config():
    """Sign-in configuration for Google Sign-In.

    Disabled by default until direct Google OIDC credentials (client ID / secret) are provisioned.
    """
    return {
        "enabled": False,
        "allowed_domains": allowed_domains(),
        "allowed_emails": allowed_emails(),
        "auth_base": None,
    }


@router.post("/auth/google/session")
async def google_session(payload: SessionExchange, request: Request, response: Response):
    """Google session exchange endpoint.

    Returns HTTP 501 Not Implemented because third-party proxy auth is removed.
    """
    raise HTTPException(
        status_code=501,
        detail="Google Sign-In is currently disabled. Please sign in using your email and password."
    )
