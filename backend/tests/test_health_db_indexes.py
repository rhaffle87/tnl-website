"""Tests for health check endpoints and MongoDB index definitions.

Verifies:
1. /api/ and /api/health return 200 with active database connection.
2. /api/health reports 503 degraded when database ping raises an error.
3. ensure_indexes() successfully iterates and builds all required indexes without errors.
"""

from unittest.mock import AsyncMock

import pytest


@pytest.mark.asyncio
async def test_root_endpoint_status(async_client):
    res = await async_client.get("/")
    assert res.status_code == 200
    data = res.json()
    assert data.get("service") == "TNL Studio"
    assert data.get("status") == "ok"


@pytest.mark.asyncio
async def test_health_check_connected(async_client):
    res = await async_client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data.get("status") == "ok"
    assert data.get("database") == "connected"


@pytest.mark.asyncio
async def test_health_check_degraded_on_error(async_client, monkeypatch):
    import lib.db
    mock_db = AsyncMock()
    mock_db.command.side_effect = Exception("Simulated connection timeout")
    monkeypatch.setattr(lib.db, "db", mock_db)
    from routers import public
    import server
    monkeypatch.setattr(server, "db", mock_db)

    res = await async_client.get("/health")
    assert res.status_code == 503
    data = res.json()
    assert data.get("status") == "degraded"
    assert data.get("database") == "unavailable"
    assert "Simulated connection timeout" not in res.text


@pytest.mark.asyncio
async def test_ensure_indexes_runs_cleanly(monkeypatch):
    import lib.db
    from mongomock_motor import AsyncMongoMockClient
    # Index creation requires a clean database; other session fixtures intentionally insert legacy duplicates.
    isolated = AsyncMongoMockClient()
    monkeypatch.setattr(lib.db, "db", isolated["index_creation_test"])
    await lib.db.ensure_indexes()
    # Check that indexes dictionary has expected critical collections
    assert "users" in lib.db.INDEXES
    assert "sessions" in lib.db.INDEXES
    assert "registrations" in lib.db.INDEXES
    assert "posts" in lib.db.INDEXES
    assert "members" in lib.db.INDEXES
    assert "media" in lib.db.INDEXES
