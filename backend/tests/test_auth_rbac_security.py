"""Tests for session authentication, RBAC authorization, division scoping, and audit logs."""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
import os
from lib.auth import hash_password

SEED_PASSWORD = os.environ["SEED_ADMIN_PASSWORD"]


@pytest.mark.asyncio
async def test_login_success_sets_cookie_and_records_audit(async_client, mock_db):
    res = await async_client.post("/auth/login", json={"email": "admin@its.ac.id", "password": SEED_PASSWORD})
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["email"] == "admin@its.ac.id"
    assert data["role"] == "super_admin"

    # Verify session cookie was set
    cookie_header = res.headers.get("set-cookie", "")
    assert "tnl_session=" in cookie_header
    assert "HttpOnly" in cookie_header or "httponly" in cookie_header

    # Verify audit log entry
    audit_entry = await mock_db.audit_log.find_one({"action": "login", "resource": "users"})
    assert audit_entry is not None


@pytest.mark.asyncio
async def test_login_rejects_invalid_password(async_client):
    res = await async_client.post("/auth/login", json={"email": "admin@its.ac.id", "password": "WrongPassword999!"})
    assert res.status_code == 401
    assert "incorrect" in res.json().get("detail", "").lower()


@pytest.mark.asyncio
async def test_logout_clears_cookie_and_destroys_session(async_client, mock_db):
    # Log in first
    login_res = await async_client.post("/auth/login", json={"email": "admin@its.ac.id", "password": SEED_PASSWORD})
    assert login_res.status_code == 200

    token = None
    for cookie_part in login_res.headers.get("set-cookie", "").split(";"):
        if "tnl_session=" in cookie_part:
            token = cookie_part.split("tnl_session=")[1].split(";")[0].strip()
            break
    assert token is not None

    sess_in_db = await mock_db.sessions.find_one({"token": token})
    assert sess_in_db is not None

    # Call logout with cookie
    logout_res = await async_client.post("/auth/logout", cookies={"tnl_session": token})
    assert logout_res.status_code == 200

    # Session deleted from DB
    sess_after = await mock_db.sessions.find_one({"token": token})
    assert sess_after is None


@pytest.mark.asyncio
async def test_expired_session_is_purged_and_rejected(async_client, mock_db):
    user = await mock_db.users.find_one({"role": "super_admin"})
    expired_token = "expired_token_" + uuid4().hex
    # Insert session expired 2 days ago
    await mock_db.sessions.insert_one({
        "token": expired_token,
        "user_id": user["id"],
        "created_at": datetime.now(timezone.utc) - timedelta(days=16),
        "expires_at": datetime.now(timezone.utc) - timedelta(days=2),
    })

    # Attempt to access protected admin endpoint
    res = await async_client.get("/admin/dashboard", cookies={"tnl_session": expired_token})
    assert res.status_code == 401

    # Session was removed upon discovery of expiry
    cleaned = await mock_db.sessions.find_one({"token": expired_token})
    assert cleaned is None


@pytest.mark.asyncio
async def test_unauthenticated_admin_routes_return_401(async_client):
    for endpoint in ("/admin/dashboard", "/admin/users", "/admin/settings", "/admin/content/posts"):
        res = await async_client.get(endpoint)
        assert res.status_code == 401, endpoint


@pytest.mark.asyncio
async def test_rbac_roles_enforcement(async_client, mock_db):
    # Test Viewer role (cannot create/modify, can only read)
    viewer = await mock_db.users.find_one({"email": "viewer@its.ac.id"})
    v_token = "viewer_token_" + uuid4().hex
    await mock_db.sessions.insert_one({
        "token": v_token,
        "user_id": viewer["id"],
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
    })

    # Viewer can read content
    read_res = await async_client.get("/admin/content/posts", cookies={"tnl_session": v_token})
    assert read_res.status_code == 200

    # Viewer cannot create content (403)
    create_res = await async_client.post(
        "/admin/content/posts",
        json={"title": "Viewer test", "status": "draft"},
        cookies={"tnl_session": v_token}
    )
    assert create_res.status_code == 403

    # Test Registrar role (can read registrations, cannot manage users)
    registrar = await mock_db.users.find_one({"email": "registrar@its.ac.id"})
    r_token = "reg_token_" + uuid4().hex
    await mock_db.sessions.insert_one({
        "token": r_token,
        "user_id": registrar["id"],
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
    })

    # Registrar can read registrations
    regs_res = await async_client.get("/admin/registrations", cookies={"tnl_session": r_token})
    assert regs_res.status_code == 200

    # Registrar cannot manage users
    users_res = await async_client.get("/admin/users", cookies={"tnl_session": r_token})
    assert users_res.status_code == 403


@pytest.mark.asyncio
async def test_division_scoping(async_client, mock_db):
    # Seeded editor has division ["media"], which maps to "posts"
    editor = await mock_db.users.find_one({"email": "editor@its.ac.id"})
    e_token = "editor_token_" + uuid4().hex
    await mock_db.sessions.insert_one({
        "token": e_token,
        "user_id": editor["id"],
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
    })

    # Editing practicum (division 'academics') should be blocked for media editor
    practicum = await mock_db.practicum.find_one()
    if practicum:
        res = await async_client.put(
            f"/admin/content/practicum/{practicum['id']}",
            json={"name": "Tampered Name"},
            cookies={"tnl_session": e_token}
        )
        assert res.status_code == 403
