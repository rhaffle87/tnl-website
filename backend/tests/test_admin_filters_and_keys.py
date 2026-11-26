"""API-key lifecycle (active / revoked / purge) and activity-log time filters."""

import csv
import io
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest


def _key(key_id: str, name: str, active: bool) -> dict:
    return {
        "id": key_id, "name": name, "prefix": "tnl_live_", "key_hash": f"hash-{key_id}",
        "scopes": ["read"], "active": active, "calls": 3, "created_at": datetime.now(timezone.utc),
    }


def _log(days_ago: float, action: str) -> dict:
    return {
        "id": str(uuid4()), "actor_email": "admin@its.ac.id", "action": action,
        "resource": "content", "target": "x", "detail": {},
        "created_at": datetime.now(timezone.utc) - timedelta(days=days_ago),
    }


@pytest.mark.asyncio
async def test_api_keys_are_grouped_into_active_and_revoked(async_client, mock_db, admin_cookies):
    await mock_db.api_keys.delete_many({})
    await mock_db.api_keys.insert_one(_key("k-live", "Live", True))
    await mock_db.api_keys.insert_one(_key("k-old", "Old", False))
    await mock_db.api_keys.insert_one(_key("k-leak", "Leaked", False))

    res = await async_client.get("/admin/api-keys", cookies=admin_cookies)
    assert res.status_code == 200
    body = res.json()
    assert body["counts"] == {"active": 1, "revoked": 2}
    assert len(body["items"]) == 3
    assert "key_hash" not in body["items"][0]

    active = await async_client.get("/admin/api-keys?status=active", cookies=admin_cookies)
    assert [k["id"] for k in active.json()["items"]] == ["k-live"]

    revoked = await async_client.get("/admin/api-keys?status=revoked", cookies=admin_cookies)
    assert {k["id"] for k in revoked.json()["items"]} == {"k-old", "k-leak"}

    bad = await async_client.get("/admin/api-keys?status=unknown", cookies=admin_cookies)
    assert bad.status_code == 422


@pytest.mark.asyncio
async def test_revoked_key_can_be_purged_but_active_key_cannot(async_client, mock_db, admin_cookies):
    await mock_db.api_keys.delete_many({})
    await mock_db.api_keys.insert_one(_key("k-live", "Live", True))
    await mock_db.api_keys.insert_one(_key("k-old", "Old", False))

    blocked = await async_client.delete("/admin/api-keys/k-live/purge", cookies=admin_cookies)
    assert blocked.status_code == 409
    assert await mock_db.api_keys.find_one({"id": "k-live"}) is not None

    ok = await async_client.delete("/admin/api-keys/k-old/purge", cookies=admin_cookies)
    assert ok.status_code == 200
    assert await mock_db.api_keys.find_one({"id": "k-old"}) is None

    logged = await mock_db.audit_log.find_one({"resource": "api_keys", "target_id": "k-old"})
    assert logged is not None
    assert logged["action"] == "delete"

    missing = await async_client.delete("/admin/api-keys/k-old/purge", cookies=admin_cookies)
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_activity_log_supports_hour_day_week_month_year(async_client, mock_db, admin_cookies):
    await mock_db.audit_log.delete_many({})
    await mock_db.audit_log.insert_one(_log(0.02, "create"))
    await mock_db.audit_log.insert_one(_log(0.03, "update"))
    await mock_db.audit_log.insert_one(_log(3, "publish"))
    await mock_db.audit_log.insert_one(_log(10, "delete"))
    await mock_db.audit_log.insert_one(_log(200, "login"))

    expected = {"hour": 2, "day": 2, "week": 3, "month": 4, "year": 5}
    for period, count in expected.items():
        res = await async_client.get(f"/admin/audit?period={period}", cookies=admin_cookies)
        assert res.status_code == 200, res.text
        assert res.json()["total"] == count, period

    all_time = await async_client.get("/admin/audit", cookies=admin_cookies)
    assert all_time.json()["total"] == 5

    invalid = await async_client.get("/admin/audit?period=decade", cookies=admin_cookies)
    assert invalid.status_code == 422


@pytest.mark.asyncio
async def test_audit_export_honours_the_same_period(async_client, mock_db, admin_cookies):
    await mock_db.audit_log.delete_many({})
    await mock_db.audit_log.insert_one(_log(0.02, "create"))
    await mock_db.audit_log.insert_one(_log(200, "login"))

    res = await async_client.get("/admin/audit/export?period=day", cookies=admin_cookies)
    assert res.status_code == 200
    text = res.text
    assert "create" in text
    assert "login" not in text


@pytest.mark.asyncio
async def test_audit_export_limit_truncation_and_offset(async_client, mock_db, admin_cookies):
    """K3 backend: limit caps the CSV rows, flags truncation, and offset skips rows."""
    await mock_db.audit_log.delete_many({})
    for i in range(60):
        await mock_db.audit_log.insert_one(_log(0.02 + i * 0.0001, f"action-{i:02d}"))

    first = await async_client.get(
        "/admin/audit/export?period=day&limit=50", cookies=admin_cookies
    )
    assert first.status_code == 200, first.text
    assert first.headers.get("X-Audit-Truncated") == "true"
    first_rows = list(csv.reader(io.StringIO(first.text)))
    assert len(first_rows) - 1 <= 50
    assert len(first_rows) - 1 == 50
    first_actions = {row[2] for row in first_rows[1:]}

    second = await async_client.get(
        "/admin/audit/export?period=day&limit=50&offset=50", cookies=admin_cookies
    )
    assert second.status_code == 200, second.text
    second_rows = list(csv.reader(io.StringIO(second.text)))
    assert len(second_rows) - 1 == 10
    second_actions = {row[2] for row in second_rows[1:]}
    assert second_actions.isdisjoint(first_actions)
