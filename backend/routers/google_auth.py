"""Direct Google OIDC authorization-code login for invited staff accounts."""

import base64
import hashlib
import hmac
import logging
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, urlsplit

import httpx
import jwt
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from pymongo import ReturnDocument

from lib.auth import audit, aware, client_ip, create_session, set_session_cookie
from lib.db import db
from lib.rate_limit import rate_limit_async
from routers.auth import public_user, verify_second_factor

router = APIRouter(tags=["auth"])
logger = logging.getLogger(__name__)
DISCOVERY_URL = "https://accounts.google.com/.well-known/openid-configuration"
STATE_COOKIE = "tnl_google_state"
CHALLENGE_COOKIE = "tnl_google_challenge"
_provider_cache: dict = {}
_keys_cache: dict = {}


def allowed_domains() -> list[str]:
    raw = os.environ.get("GOOGLE_ALLOWED_DOMAINS", "its.ac.id,student.its.ac.id")
    return [d.strip().lower().lstrip("@") for d in raw.split(",") if d.strip()]


def allowed_emails() -> list[str]:
    return [email.strip().lower() for email in os.environ.get("GOOGLE_ALLOWED_EMAILS", "").split(",") if email.strip()]


def _configuration() -> dict | None:
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
    secret = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
    base = os.environ.get("APP_URL", "").rstrip("/")
    redirect_uri = os.environ.get("GOOGLE_REDIRECT_URI", "") or f"{base}/api/auth/google/callback"
    parsed = urlsplit(redirect_uri)
    site = urlsplit(base)
    if not client_id or not secret or not site.netloc or site.scheme not in ("http", "https"):
        return None
    if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.username or parsed.query or parsed.fragment:
        return None
    if parsed.scheme != "https" and parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
        return None
    if (parsed.scheme, parsed.netloc) != (site.scheme, site.netloc):
        return None
    return {"client_id": client_id, "client_secret": secret, "redirect_uri": redirect_uri, "base": base}


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _flow_cookie(response: Response, name: str, value: str, max_age: int) -> None:
    response.set_cookie(name, value, max_age=max_age, httponly=True, samesite="lax", path="/",
                        secure=os.environ.get("COOKIE_SECURE", "false").lower() == "true")
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"


def _cache_seconds(response: httpx.Response) -> int:
    for directive in response.headers.get("cache-control", "").split(","):
        if directive.strip().startswith("max-age="):
            try:
                return min(3600, max(0, int(directive.strip()[8:])))
            except ValueError:
                pass
    return 300


async def _provider() -> dict:
    if _provider_cache.get("expires", 0) > time.monotonic():
        return _provider_cache["value"]
    async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
        response = await client.get(DISCOVERY_URL)
        response.raise_for_status()
    metadata = response.json()
    for field in ("authorization_endpoint", "token_endpoint", "jwks_uri"):
        uri = urlsplit(metadata.get(field, ""))
        if uri.scheme != "https" or uri.hostname not in ("accounts.google.com", "oauth2.googleapis.com", "www.googleapis.com") or uri.username:
            raise ValueError("Invalid Google discovery document")
    if metadata.get("issuer") != "https://accounts.google.com":
        raise ValueError("Invalid Google issuer")
    _provider_cache.update(value=metadata, expires=time.monotonic() + _cache_seconds(response))
    return metadata


async def _exchange_code(code: str, verifier: str, config: dict) -> dict:
    metadata = await _provider()
    async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
        response = await client.post(metadata["token_endpoint"], data={
            "code": code, "code_verifier": verifier, "client_id": config["client_id"],
            "client_secret": config["client_secret"], "redirect_uri": config["redirect_uri"],
            "grant_type": "authorization_code",
        })
        response.raise_for_status()
    return response.json()


async def _decode_identity(encoded: str, nonce: str, client_id: str) -> dict:
    header = jwt.get_unverified_header(encoded)
    if header.get("alg") != "RS256" or not isinstance(header.get("kid"), str):
        raise ValueError("Unsupported identity signature")
    metadata = await _provider()
    if _keys_cache.get("expires", 0) <= time.monotonic() or header["kid"] not in _keys_cache.get("keys", {}):
        async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
            response = await client.get(metadata["jwks_uri"])
            response.raise_for_status()
        _keys_cache.update(keys={key["kid"]: key for key in response.json().get("keys", []) if key.get("kty") == "RSA"},
                           expires=time.monotonic() + _cache_seconds(response))
    key = jwt.PyJWK.from_dict(_keys_cache["keys"][header["kid"]], algorithm="RS256")
    claims = jwt.decode(encoded, key.key, algorithms=["RS256"], audience=client_id,
                        issuer=["https://accounts.google.com", "accounts.google.com"],
                        options={"require": ["iss", "aud", "exp", "iat", "sub", "nonce", "email", "email_verified"]})
    if not isinstance(claims.get("nonce"), str) or not hmac.compare_digest(claims["nonce"], nonce):
        raise ValueError("Identity nonce mismatch")
    if claims.get("email_verified") is not True or not isinstance(claims.get("email"), str):
        raise ValueError("Verified email required")
    if claims.get("azp") and claims["azp"] != client_id:
        raise ValueError("Identity presenter mismatch")
    email = claims["email"].lower().strip()
    domain = email.rsplit("@", 1)[-1]
    hosted_domain = str(claims.get("hd", "")).lower()
    if email not in allowed_emails() and (domain not in allowed_domains() or hosted_domain != domain):
        raise ValueError("Account domain not allowed")
    return claims


async def _staff_for_identity(claims: dict) -> dict:
    subject = claims["sub"]
    user = await db.users.find_one({"google_sub": subject})
    if not user:
        user = await db.users.find_one({"email": claims["email"].strip().lower()})
    if not user or not user.get("active") or user.get("google_sub") not in (None, subject):
        raise ValueError("Staff invitation required")
    if not user.get("password_hash") and not user.get("google_sub"):
        if not user.get("invite_token") or (user.get("invite_expires_at") and aware(user["invite_expires_at"]) < datetime.now(timezone.utc)):
            raise ValueError("Active staff invitation required")
    fresh = await db.users.find_one_and_update(
        {"id": user["id"], "active": True, "invite_token": user.get("invite_token"),
         "$or": [{"google_sub": None}, {"google_sub": subject}]},
        {"$set": {"google_sub": subject, "invite_token": None, "invite_expires_at": None}},
        return_document=ReturnDocument.AFTER,
    )
    if not fresh:
        raise ValueError("Staff account changed")
    return fresh


async def _finish_login(user: dict, request: Request, response: Response) -> None:
    token = await create_session(user["id"], auth_version=user.get("auth_version", 0))
    await db.users.update_one({"id": user["id"]}, {"$set": {"last_login_at": datetime.now(timezone.utc)}})
    request.state.user = user
    await audit(request, "google-login", "users", user["id"])
    set_session_cookie(response, token)
    response.headers["Cache-Control"] = "no-store"


@router.get("/auth/google/config")
async def google_config():
    config = _configuration()
    return {"enabled": config is not None, "allowed_domains": allowed_domains(),
            "allowed_emails": allowed_emails(), "auth_base": "/api/auth/google/start" if config else None}


@router.get("/auth/google/start")
async def google_start(request: Request):
    config = _configuration()
    if not config:
        raise HTTPException(status_code=503, detail="Google sign-in credentials are not configured.")
    await rate_limit_async("google_start", f"google-start:{client_ip(request)}", 10, 300)
    metadata = await _provider()
    state, verifier, nonce = secrets.token_urlsafe(32), secrets.token_urlsafe(48), secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    await db.auth_flows.delete_many({"expires_at": {"$lt": now}})
    await db.auth_flows.insert_one({"_id": _hash(state), "kind": "google", "verifier": verifier,
                                    "nonce": nonce, "expires_at": now + timedelta(minutes=5)})
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    params = {"client_id": config["client_id"], "redirect_uri": config["redirect_uri"], "response_type": "code",
              "scope": "openid email", "state": state, "nonce": nonce,
              "code_challenge": challenge, "code_challenge_method": "S256", "prompt": "select_account"}
    response = RedirectResponse(metadata["authorization_endpoint"] + "?" + urlencode(params), status_code=302)
    _flow_cookie(response, STATE_COOKIE, state, 300)
    return response


@router.get("/auth/google/callback", include_in_schema=False)
async def google_callback(request: Request, state: str = "", code: str = "", error: str = ""):
    config = _configuration()
    if not config:
        raise HTTPException(status_code=503, detail="Google sign-in credentials are not configured.")
    await rate_limit_async("google_callback", f"google-callback:{client_ip(request)}", 20, 300)
    failed = RedirectResponse(config["base"] + "/admin/login?google_error=access_denied", status_code=302)
    _flow_cookie(failed, STATE_COOKIE, "", 0)
    cookie_state = request.cookies.get(STATE_COOKIE, "")
    if error or not state or not cookie_state or not state.isascii() or not cookie_state.isascii() or not hmac.compare_digest(state, cookie_state) or not code:
        return failed
    flow = await db.auth_flows.find_one_and_delete({"_id": _hash(state), "kind": "google", "expires_at": {"$gt": datetime.now(timezone.utc)}})
    if not flow:
        return failed
    try:
        tokens = await _exchange_code(code, flow["verifier"], config)
        claims = await _decode_identity(tokens["id_token"], flow["nonce"], config["client_id"])
        user = await _staff_for_identity(claims)
    except (httpx.HTTPError, jwt.PyJWTError, ValueError, KeyError, TypeError):
        logger.info("Google sign-in rejected during identity verification")
        return failed
    if user.get("totp_enabled"):
        challenge = secrets.token_urlsafe(32)
        await db.auth_flows.insert_one({"_id": _hash(challenge), "kind": "google_totp", "user_id": user["id"],
                                       "auth_version": user.get("auth_version", 0),
                                       "expires_at": datetime.now(timezone.utc) + timedelta(minutes=5)})
        response = RedirectResponse(config["base"] + "/admin/login?google=two-factor", status_code=302)
        _flow_cookie(response, CHALLENGE_COOKIE, challenge, 300)
    else:
        response = RedirectResponse(config["base"] + "/admin", status_code=302)
        await _finish_login(user, request, response)
    _flow_cookie(response, STATE_COOKIE, "", 0)
    return response


class GoogleComplete(BaseModel):
    code: str = Field(min_length=1, max_length=64)


@router.post("/auth/google/complete")
async def google_complete(payload: GoogleComplete, request: Request, response: Response):
    await rate_limit_async("google_totp", f"google-totp:{client_ip(request)}", 10, 300)
    challenge = request.cookies.get(CHALLENGE_COOKIE, "")
    flow = await db.auth_flows.find_one({"_id": _hash(challenge), "kind": "google_totp", "expires_at": {"$gt": datetime.now(timezone.utc)}}) if challenge else None
    user = await db.users.find_one({"id": flow["user_id"], "active": True}) if flow else None
    if not user or user.get("auth_version", 0) != flow.get("auth_version", 0) or not await verify_second_factor(user, payload.code):
        raise HTTPException(status_code=401, detail="A valid two-factor or unused recovery code is required.")
    consumed = await db.auth_flows.delete_one({"_id": flow["_id"]})
    if not consumed.deleted_count:
        raise HTTPException(status_code=401, detail="Google sign-in has expired. Start again.")
    await _finish_login(user, request, response)
    _flow_cookie(response, CHALLENGE_COOKIE, "", 0)
    return public_user(user)


class SessionExchange(BaseModel):
    session_id: str


@router.post("/auth/google/session", deprecated=True)
async def google_session(payload: SessionExchange):
    raise HTTPException(status_code=410, detail="Proxy sign-in has been retired. Start direct Google sign-in from the sign-in page.")
