"""Invitation links: expiry, single use, and legacy tokens without a timestamp."""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest


async def _make_invited_user(mock_db, expires_at):
    token = "inv_" + uuid4().hex
    await mock_db.users.insert_one({
        "id": str(uuid4()), "name": "Invitee", "email": f"{uuid4().hex[:8]}@its.ac.id",
        "role": "viewer", "divisions": [], "active": True, "password_hash": "",
        "totp_secret": None, "totp_enabled": False,
        "invite_token": token, "invite_expires_at": expires_at,
        "created_at": datetime.now(timezone.utc), "last_login_at": None,
    })
    return token


@pytest.mark.asyncio
async def test_expired_invite_is_rejected_with_410(async_client, mock_db):
    token = await _make_invited_user(mock_db, datetime.now(timezone.utc) - timedelta(minutes=1))
    res = await async_client.post("/auth/accept-invite", json={"token": token, "password": "LongEnough123"})
    assert res.status_code == 410
    # token must remain unusable and no password may have been set
    user = await mock_db.users.find_one({"invite_token": token})
    assert user is not None and user["password_hash"] == ""


@pytest.mark.asyncio
async def test_valid_invite_is_single_use(async_client, mock_db):
    token = await _make_invited_user(mock_db, datetime.now(timezone.utc) + timedelta(days=1))
    first = await async_client.post("/auth/accept-invite", json={"token": token, "password": "LongEnough123"})
    assert first.status_code == 200, first.text
    second = await async_client.post("/auth/accept-invite", json={"token": token, "password": "AnotherLong456"})
    assert second.status_code == 404


@pytest.mark.asyncio
async def test_legacy_invite_without_expiry_still_works(async_client, mock_db):
    token = await _make_invited_user(mock_db, None)
    res = await async_client.post("/auth/accept-invite", json={"token": token, "password": "LongEnough123"})
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_new_invite_gets_expiry(async_client, mock_db, admin_cookies):
    res = await async_client.post(
        "/admin/users",
        json={"name": "New Staff", "email": f"{uuid4().hex[:8]}@its.ac.id", "role": "viewer"},
        cookies=admin_cookies,
    )
    assert res.status_code == 201, res.text
    doc = await mock_db.users.find_one({"id": res.json()["id"]})
    assert doc["invite_token"] and doc["invite_expires_at"] is not None
