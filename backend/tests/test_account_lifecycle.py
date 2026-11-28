"""Account lifecycle regressions use only the isolated database and fake provider transport."""

import asyncio
import re
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException

from lib.auth import _totp, create_session, hash_password, new_totp_secret, sign_upload, verify_password, verify_upload_sig
from routers import auth, google_auth

PASSWORD = "A-new-test-password-123"


def test_upload_signature_expiry_and_filename_binding(monkeypatch):
    monkeypatch.setattr("lib.auth.time.time", lambda: 1000)
    signature = sign_upload("uploads/private.pdf", expires_at=1010)
    assert verify_upload_sig("uploads/private.pdf", signature)
    assert not verify_upload_sig("uploads/another.pdf", signature)
    assert not verify_upload_sig("uploads/private.pdf", signature + "0")
    monkeypatch.setattr("lib.auth.time.time", lambda: 1010)
    assert not verify_upload_sig("uploads/private.pdf", signature)
    assert not verify_upload_sig("uploads/private.pdf", "v1.bad.token")


async def staff(mock_db, **fields):
    user = {"id": uuid4().hex, "name": "Account test", "email": f"{uuid4().hex}@its.ac.id",
            "role": "editor", "active": True, "divisions": [], "password_hash": hash_password(PASSWORD),
            "totp_enabled": False, "created_at": datetime.now(timezone.utc), **fields}
    await mock_db.users.insert_one(user)
    return user


@pytest.mark.asyncio
async def test_disabled_invitation_never_reactivates_account(async_client, mock_db):
    token = uuid4().hex
    user = await staff(mock_db, active=False, password_hash="", invite_token=token)
    result = await async_client.post("/auth/accept-invite", json={"token": token, "password": PASSWORD})
    assert result.status_code == 404
    stored = await mock_db.users.find_one({"id": user["id"]})
    assert stored["active"] is False and stored["password_hash"] == ""
    assert await mock_db.sessions.count_documents({"user_id": user["id"]}) == 0


@pytest.mark.asyncio
async def test_invitation_consumption_is_atomic(async_client, mock_db, monkeypatch):
    token = uuid4().hex
    user = await staff(mock_db, password_hash="", invite_token=token,
                       invite_expires_at=datetime.now(timezone.utc) + timedelta(days=1))
    collection = mock_db.users
    original = collection.find_one
    reached = asyncio.Event()
    arrivals = 0

    class BoundDatabase:
        def __getattr__(self, name):
            return collection if name == "users" else getattr(mock_db, name)

    monkeypatch.setattr(auth, "db", BoundDatabase())

    async def synchronized_lookup(query, *args, **kwargs):
        nonlocal arrivals
        value = await original(query, *args, **kwargs)
        if query == {"invite_token": token}:
            arrivals += 1
            if arrivals == 2:
                reached.set()
            await asyncio.wait_for(reached.wait(), timeout=5)
        return value

    monkeypatch.setattr(collection, "find_one", synchronized_lookup)
    responses = await asyncio.gather(*[
        async_client.post("/auth/accept-invite", json={"token": token, "password": PASSWORD}) for _ in range(2)
    ])
    assert sorted(response.status_code for response in responses) == [200, 404]
    assert arrivals == 2
    assert await mock_db.sessions.count_documents({"user_id": user["id"]}) == 1


@pytest.mark.asyncio
async def test_deactivation_revokes_invite_and_sessions(async_client, mock_db, admin_cookies):
    invite = uuid4().hex
    user = await staff(mock_db, invite_token=invite)
    session = await create_session(user["id"])
    result = await async_client.patch(f"/admin/users/{user['id']}", json={"active": False}, cookies=admin_cookies)
    assert result.status_code == 200
    stored = await mock_db.users.find_one({"id": user["id"]})
    assert stored["invite_token"] is None and stored["auth_version"] == 1
    assert await mock_db.sessions.find_one({"token": session}) is None
    denied = await async_client.post("/auth/login", json={"email": user["email"], "password": PASSWORD})
    assert denied.status_code == 401


@pytest.mark.asyncio
async def test_invitation_rotation_and_revocation(async_client, mock_db, admin_cookies, monkeypatch):
    messages = []

    async def capture(*args, **kwargs):
        messages.append(args)
        return {"status": "queued"}

    monkeypatch.setattr(auth, "send_email", capture)
    old = uuid4().hex
    user = await staff(mock_db, password_hash="", invite_token=old)
    response = await async_client.post(f"/admin/users/{user['id']}/invite", json={}, cookies=admin_cookies)
    assert response.status_code == 200 and response.json()["invite_pending"] is True
    fresh = await mock_db.users.find_one({"id": user["id"]})
    assert fresh["invite_token"] != old and messages
    assert fresh["invite_token"] not in response.text
    assert (await async_client.post("/auth/accept-invite", json={"token": old, "password": PASSWORD})).status_code == 404
    assert (await async_client.delete(f"/admin/users/{user['id']}/invite", cookies=admin_cookies)).status_code == 200
    assert (await async_client.post("/auth/accept-invite", json={"token": fresh["invite_token"], "password": PASSWORD})).status_code == 404


@pytest.mark.asyncio
async def test_pending_invite_visible_without_token_on_list_and_update(async_client, mock_db, admin_cookies):
    token = uuid4().hex
    user = await staff(mock_db, password_hash="", invite_token=token)
    listed = await async_client.get("/admin/users", cookies=admin_cookies)
    assert listed.status_code == 200 and token not in listed.text
    assert next(item for item in listed.json()["items"] if item["id"] == user["id"])["invite_pending"] is True
    updated = await async_client.patch(f"/admin/users/{user['id']}", json={"name": "Still invited"}, cookies=admin_cookies)
    assert updated.status_code == 200 and updated.json()["invite_pending"] is True and token not in updated.text


@pytest.mark.asyncio
async def test_reset_non_enumerating_single_use_and_revokes_sessions(async_client, mock_db, monkeypatch):
    sent = []

    async def capture(*args, **kwargs):
        sent.append(args)
        return {"status": "queued"}

    monkeypatch.setattr(auth, "send_email", capture)
    monkeypatch.setenv("APP_URL", "https://lab.example.test")
    user = await staff(mock_db, totp_enabled=True, totp_secret=new_totp_secret())
    session = await create_session(user["id"])
    absent = await async_client.post("/auth/password-reset/request", json={"email": "absent@example.org"})
    present = await async_client.post("/auth/password-reset/request", json={"email": user["email"]})
    assert absent.status_code == present.status_code == 200
    assert absent.json() == present.json()
    link = re.search(r'href="([^"]+)"', sent[0][2]).group(1)
    token = parse_qs(urlsplit(link).query)["token"][0]
    stored = await mock_db.users.find_one({"id": user["id"]})
    assert token != stored["password_reset_hash"] and token not in str(stored)
    password = PASSWORD + "-changed"
    first = await async_client.post("/auth/password-reset/confirm", json={"token": token, "password": password})
    assert first.status_code == 200
    assert (await async_client.post("/auth/password-reset/confirm", json={"token": token, "password": PASSWORD})).status_code == 400
    stored = await mock_db.users.find_one({"id": user["id"]})
    assert stored["totp_enabled"] and verify_password(password, stored["password_hash"])
    assert await mock_db.sessions.find_one({"token": session}) is None
    assert (await async_client.post("/auth/login", json={"email": user["email"], "password": password})).status_code == 401


@pytest.mark.asyncio
async def test_expired_reset_does_not_change_password(async_client, mock_db):
    token = uuid4().hex
    user = await staff(mock_db, password_reset_hash=auth._digest(token),
                       password_reset_expires_at=datetime.now(timezone.utc) - timedelta(seconds=1))
    response = await async_client.post("/auth/password-reset/confirm", json={"token": token, "password": PASSWORD + "-new"})
    assert response.status_code == 400
    stored = await mock_db.users.find_one({"id": user["id"]})
    assert stored["password_hash"] == user["password_hash"]


@pytest.mark.asyncio
async def test_totp_pending_expiry_and_recent_auth(async_client, mock_db):
    user = await staff(mock_db)
    token = await create_session(user["id"])
    cookies = {"tnl_session": token}
    await mock_db.sessions.update_one({"token": token}, {"$set": {"created_at": datetime.now(timezone.utc) - timedelta(minutes=11)}})
    route = f"/admin/users/{user['id']}"
    assert (await async_client.post(route + "/totp-setup", cookies=cookies)).status_code == 401
    setup = await async_client.post(route + "/totp-setup", json={"password": PASSWORD}, cookies=cookies)
    assert setup.status_code == 200 and setup.json()["otpauth_uri"].startswith("otpauth://totp/")
    await mock_db.users.update_one({"id": user["id"]}, {"$set": {"totp_pending_at": datetime.now(timezone.utc) - timedelta(minutes=11)}})
    code = _totp(setup.json()["secret"], int(time.time()) // 30)
    confirm = await async_client.post(route + "/totp-confirm", json={"code": code}, cookies=cookies)
    assert confirm.status_code == 422
    assert not (await mock_db.users.find_one({"id": user["id"]}))["totp_enabled"]


@pytest.mark.asyncio
async def test_totp_confirmation_returns_once_codes_and_prevents_replay(async_client, mock_db):
    secret = new_totp_secret()
    user = await staff(mock_db, totp_pending_secret=secret, totp_pending_at=datetime.now(timezone.utc))
    token = await create_session(user["id"])
    route = f"/admin/users/{user['id']}"
    code = _totp(secret, int(time.time()) // 30)
    confirm = await async_client.post(route + "/totp-confirm", json={"code": code}, cookies={"tnl_session": token})
    assert confirm.status_code == 200
    recovery = confirm.json()["recovery_codes"]
    assert len(recovery) == len(set(recovery)) == 10
    assert (await async_client.post(route + "/totp-confirm", json={"code": code}, cookies={"tnl_session": token})).status_code == 422
    stored = await mock_db.users.find_one({"id": user["id"]})
    assert recovery[0] not in str(stored)
    assert (await async_client.post("/auth/login", json={"email": user["email"], "password": PASSWORD, "code": code})).status_code == 401
    success = await async_client.post("/auth/login", json={"email": user["email"], "password": PASSWORD, "code": recovery[0]})
    assert success.status_code == 200 and success.json()["recovery_codes_remaining"] == 9
    replay = await async_client.post("/auth/login", json={"email": user["email"], "password": PASSWORD, "code": recovery[0]})
    assert replay.status_code == 401


@pytest.mark.asyncio
async def test_auth_version_invalidates_racing_session(async_client, mock_db):
    user = await staff(mock_db)
    token = await create_session(user["id"])
    await mock_db.users.update_one({"id": user["id"]}, {"$inc": {"auth_version": 1}})
    assert (await async_client.get("/auth/me", cookies={"tnl_session": token})).status_code == 401
    with pytest.raises(HTTPException) as error:
        await create_session(user["id"], auth_version=0)
    assert error.value.status_code == 401


@pytest.mark.asyncio
async def test_password_change_requires_current_password_and_ends_all_sessions(async_client, mock_db):
    user = await staff(mock_db)
    token = await create_session(user["id"])
    other = await create_session(user["id"])
    cookies = {"tnl_session": token}
    for current, status in (("", 422), ("incorrect", 401)):
        response = await async_client.post("/auth/password/change", json={"current_password": current, "password": PASSWORD + "-new"}, cookies=cookies)
        assert response.status_code == status
    response = await async_client.post("/auth/password/change", json={"current_password": PASSWORD, "password": PASSWORD + "-new"}, cookies=cookies)
    assert response.status_code == 200
    assert await mock_db.sessions.count_documents({"token": {"$in": [token, other]}}) == 0
    assert verify_password(PASSWORD + "-new", (await mock_db.users.find_one({"id": user["id"]}))["password_hash"])


@pytest.mark.asyncio
async def test_recovery_regeneration_and_disable_require_proof(async_client, mock_db):
    proof = "ABCD1234EFAB5678"
    user = await staff(mock_db, totp_enabled=True, totp_secret=new_totp_secret(), totp_recovery_hashes=[auth._digest(proof)])
    token = await create_session(user["id"])
    other = await create_session(user["id"])
    route = f"/admin/users/{user['id']}"
    cookies = {"tnl_session": token}
    denied = await async_client.post(route + "/totp-recovery-codes", json={"password": PASSWORD, "code": "invalid"}, cookies=cookies)
    assert denied.status_code == 401
    fresh = await async_client.post(route + "/totp-recovery-codes", json={"password": PASSWORD, "code": proof}, cookies=cookies)
    assert fresh.status_code == 200 and len(fresh.json()["recovery_codes"]) == 10
    assert (await async_client.post(route + "/totp-disable", json={"password": PASSWORD, "code": proof}, cookies=cookies)).status_code == 401
    assert (await async_client.post(route + "/totp-disable", json={"password": PASSWORD, "code": fresh.json()["recovery_codes"][0]}, cookies=cookies)).status_code == 200
    stored = await mock_db.users.find_one({"id": user["id"]})
    assert stored["totp_enabled"] is False and stored["totp_secret"] is None and not stored["totp_recovery_hashes"]
    assert await mock_db.sessions.find_one({"token": other}) is None
    assert (await async_client.get("/auth/me", cookies=cookies)).status_code == 200


@pytest.mark.asyncio
async def test_factor_confirmation_fences_login_already_in_progress(async_client, mock_db, monkeypatch):
    secret = new_totp_secret()
    user = await staff(mock_db, totp_pending_secret=secret, totp_pending_at=datetime.now(timezone.utc))
    session = await create_session(user["id"])
    paused, release = asyncio.Event(), asyncio.Event()
    original = auth.create_session

    async def held_create_session(user_id, **kwargs):
        paused.set()
        await asyncio.wait_for(release.wait(), 5)
        return await original(user_id, **kwargs)

    monkeypatch.setattr(auth, "create_session", held_create_session)
    pending_login = asyncio.create_task(async_client.post("/auth/login", json={"email": user["email"], "password": PASSWORD}))
    try:
        await asyncio.wait_for(paused.wait(), 5)
        result = await async_client.post(f"/admin/users/{user['id']}/totp-confirm", json={"code": _totp(secret, int(time.time()) // 30)}, cookies={"tnl_session": session})
        assert result.status_code == 200
    finally:
        release.set()
    assert (await pending_login).status_code == 401
    assert (await async_client.get("/auth/me", cookies={"tnl_session": session})).status_code == 200
    stored = await mock_db.users.find_one({"id": user["id"]})
    assert stored["auth_version"] == 1
    assert await mock_db.sessions.count_documents({"user_id": user["id"]}) == 1


@pytest.mark.asyncio
async def test_invitation_login_cannot_survive_admin_password_change(async_client, mock_db, monkeypatch, admin_cookies):
    invitation = uuid4().hex
    user = await staff(mock_db, invite_token=invitation, password_hash="")
    paused, release = asyncio.Event(), asyncio.Event()
    original = auth.create_session

    async def held_create_session(user_id, **kwargs):
        paused.set()
        await asyncio.wait_for(release.wait(), 5)
        return await original(user_id, **kwargs)

    monkeypatch.setattr(auth, "create_session", held_create_session)
    pending = asyncio.create_task(async_client.post("/auth/accept-invite", json={"token": invitation, "password": PASSWORD}))
    try:
        await asyncio.wait_for(paused.wait(), 5)
        changed = await async_client.patch(f"/admin/users/{user['id']}", json={"password": PASSWORD + "-admin"}, cookies=admin_cookies)
        assert changed.status_code == 200
    finally:
        release.set()
    assert (await pending).status_code == 401
    assert await mock_db.sessions.count_documents({"user_id": user["id"]}) == 0


@pytest.mark.asyncio
async def test_old_password_change_cannot_overwrite_completed_reset(async_client, mock_db, monkeypatch):
    reset_token = uuid4().hex
    user = await staff(mock_db, password_reset_hash=auth._digest(reset_token),
                       password_reset_expires_at=datetime.now(timezone.utc) + timedelta(minutes=30))
    session = await create_session(user["id"])
    paused, release = asyncio.Event(), asyncio.Event()
    original = auth._reauthenticate

    async def held_reauthentication(*args, **kwargs):
        await original(*args, **kwargs)
        paused.set()
        await asyncio.wait_for(release.wait(), 5)

    monkeypatch.setattr(auth, "_reauthenticate", held_reauthentication)
    change = asyncio.create_task(async_client.post("/auth/password/change", json={"current_password": PASSWORD, "password": PASSWORD + "-stale"}, cookies={"tnl_session": session}))
    try:
        await asyncio.wait_for(paused.wait(), 5)
        result = await async_client.post("/auth/password-reset/confirm", json={"token": reset_token, "password": PASSWORD + "-reset"})
        assert result.status_code == 200
    finally:
        release.set()
    assert (await change).status_code == 409
    stored = await mock_db.users.find_one({"id": user["id"]})
    assert verify_password(PASSWORD + "-reset", stored["password_hash"])


@pytest.fixture
def google_configuration(monkeypatch):
    monkeypatch.setenv("APP_URL", "https://lab.example.test")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client.apps.googleusercontent.com")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", uuid4().hex)
    monkeypatch.setenv("GOOGLE_REDIRECT_URI", "https://lab.example.test/api/auth/google/callback")
    monkeypatch.setenv("GOOGLE_ALLOWED_DOMAINS", "its.ac.id")
    monkeypatch.setenv("GOOGLE_ALLOWED_EMAILS", "")
    monkeypatch.setenv("COOKIE_SECURE", "false")
    return google_auth._configuration()


@pytest.mark.asyncio
async def test_google_disabled_without_credentials(async_client, monkeypatch):
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    monkeypatch.delenv("GOOGLE_CLIENT_SECRET", raising=False)
    assert (await async_client.get("/auth/google/config")).json()["enabled"] is False
    assert (await async_client.get("/auth/google/start")).status_code == 503


@pytest.mark.asyncio
async def test_google_signature_audience_nonce_and_hosted_domain(google_configuration, monkeypatch):
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwk = jwt.algorithms.RSAAlgorithm.to_jwk(private.public_key(), as_dict=True)
    jwk["kid"] = "test-key"
    monkeypatch.setattr(google_auth, "_keys_cache", {"keys": {"test-key": jwk}, "expires": time.monotonic() + 60})

    async def metadata():
        return {"jwks_uri": "https://www.googleapis.com/oauth2/v3/certs"}

    monkeypatch.setattr(google_auth, "_provider", metadata)
    claims = {"iss": "https://accounts.google.com", "aud": google_configuration["client_id"],
              "sub": "test-subject", "iat": int(time.time()), "exp": int(time.time()) + 300,
              "nonce": "expected-nonce", "email": "staff@its.ac.id", "email_verified": True, "hd": "its.ac.id"}

    def encode(values):
        return jwt.encode(values, private, algorithm="RS256", headers={"kid": "test-key"})

    assert (await google_auth._decode_identity(encode(claims), "expected-nonce", google_configuration["client_id"]))["sub"] == "test-subject"
    for patch in ({"nonce": "wrong"}, {"aud": "wrong"}, {"iss": "https://evil.example"},
                  {"email_verified": False}, {"hd": "elsewhere.example"}, {"exp": 1}):
        with pytest.raises((ValueError, jwt.PyJWTError)):
            await google_auth._decode_identity(encode({**claims, **patch}), "expected-nonce", google_configuration["client_id"])


@pytest.mark.asyncio
async def test_google_callback_state_one_use_and_invited_only(async_client, mock_db, monkeypatch, google_configuration):
    user = await staff(mock_db)
    claims = {"sub": uuid4().hex, "email": user["email"]}

    async def metadata():
        return {"authorization_endpoint": "https://accounts.google.com/o/oauth2/v2/auth"}

    async def exchange(*args):
        return {"id_token": "test-provider-token"}

    async def decode(*args):
        return claims

    monkeypatch.setattr(google_auth, "_provider", metadata)
    monkeypatch.setattr(google_auth, "_exchange_code", exchange)
    monkeypatch.setattr(google_auth, "_decode_identity", decode)
    start = await async_client.get("/auth/google/start", follow_redirects=False)
    params = parse_qs(urlsplit(start.headers["location"]).query)
    state = params["state"][0]
    assert params["code_challenge_method"] == ["S256"] and params["nonce"][0]
    invalid = await async_client.get("/auth/google/callback", params={"state": "wrong", "code": "code"}, follow_redirects=False)
    assert "access_denied" in invalid.headers["location"]
    assert await mock_db.sessions.count_documents({"user_id": user["id"]}) == 0
    cookies = {google_auth.STATE_COOKIE: state}
    success = await async_client.get("/auth/google/callback", params={"state": state, "code": "code"}, cookies=cookies, follow_redirects=False)
    assert success.headers["location"].endswith("/admin")
    assert "tnl_session=" in success.headers.get("set-cookie", "")
    replay = await async_client.get("/auth/google/callback", params={"state": state, "code": "code"}, cookies=cookies, follow_redirects=False)
    assert "access_denied" in replay.headers["location"]
    assert await mock_db.sessions.count_documents({"user_id": user["id"]}) == 1
    assert (await mock_db.users.find_one({"id": user["id"]}))["google_sub"] == claims["sub"]
    with pytest.raises(ValueError):
        await google_auth._staff_for_identity({"sub": uuid4().hex, "email": "uninvited@its.ac.id"})


@pytest.mark.asyncio
async def test_google_two_factor_does_not_create_session_until_proof(async_client, mock_db, monkeypatch, google_configuration):
    secret = new_totp_secret()
    user = await staff(mock_db, totp_enabled=True, totp_secret=secret)
    challenge = uuid4().hex
    await mock_db.auth_flows.insert_one({"_id": google_auth._hash(challenge), "kind": "google_totp", "user_id": user["id"],
                                        "auth_version": 0, "expires_at": datetime.now(timezone.utc) + timedelta(minutes=5)})
    cookies = {google_auth.CHALLENGE_COOKIE: challenge}
    denied = await async_client.post("/auth/google/complete", json={"code": "invalid"}, cookies=cookies)
    assert denied.status_code == 401
    assert await mock_db.sessions.count_documents({"user_id": user["id"]}) == 0
    success = await async_client.post("/auth/google/complete", json={"code": _totp(secret, int(time.time()) // 30)}, cookies=cookies)
    assert success.status_code == 200
    assert await mock_db.sessions.count_documents({"user_id": user["id"]}) == 1
    assert await mock_db.auth_flows.find_one({"_id": google_auth._hash(challenge)}) is None
