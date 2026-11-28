"""Tests for ADR-004 Redis public API response caching, invalidation, isolation, and fail-open behavior."""

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from redis.exceptions import RedisError

import lib.auth
import lib.cache


@pytest.mark.asyncio
async def test_public_cache_hit_and_invalidation_on_post_update(async_client, mock_db, admin_cookies):
    slug = f"cache-post-{uuid4().hex[:8]}"
    post_res = await async_client.post(
        "/admin/content/posts",
        cookies=admin_cookies,
        json={
            "title": "Initial Cached Post",
            "title_id": "Pos Awal",
            "slug": slug,
            "excerpt": "Network lab benchmark report on optical links.",
            "body": "<p>Detailed fiber optics measurement at Lab TNL Room B-301.</p>",
            "category": "Research",
            "status": "published",
        },
    )
    assert post_res.status_code == 201, post_res.text
    post_id = post_res.json()["id"]

    try:
        first = await async_client.get(f"/public/posts/{slug}")
        assert first.status_code == 200
        assert first.headers.get("X-Cache") == "MISS"
        assert first.json()["title"] == "Initial Cached Post"

        second = await async_client.get(f"/public/posts/{slug}")
        assert second.status_code == 200
        assert second.headers.get("X-Cache") == "HIT"
        assert second.json()["title"] == "Initial Cached Post"

        update_res = await async_client.patch(
            f"/admin/content/posts/{post_id}",
            cookies=admin_cookies,
            json={"title": "Updated Post Title", "status": "published"},
        )
        assert update_res.status_code == 200, update_res.text

        third = await async_client.get(f"/public/posts/{slug}")
        assert third.status_code == 200
        assert third.headers.get("X-Cache") == "MISS"
        assert third.json()["title"] == "Updated Post Title"
    finally:
        await mock_db.posts.delete_one({"id": post_id})


@pytest.mark.asyncio
async def test_public_settings_and_pages_cache_lifecycle(async_client, admin_cookies):
    r1 = await async_client.get("/public/settings")
    assert r1.status_code == 200
    assert r1.headers.get("X-Cache") == "MISS"

    r2 = await async_client.get("/public/settings")
    assert r2.status_code == 200
    assert r2.headers.get("X-Cache") == "HIT"

    p1 = await async_client.get("/public/pages/home")
    assert p1.status_code == 200
    assert p1.headers.get("X-Cache") == "MISS"

    p2 = await async_client.get("/public/pages/home")
    assert p2.status_code == 200
    assert p2.headers.get("X-Cache") == "HIT"

    # Settings mutation invalidates settings & stats caches
    original_short = r1.json().get("short_name") or "TNL"
    upd = await async_client.put(
        "/admin/settings",
        cookies=admin_cookies,
        json={"short_name": original_short},
    )
    assert upd.status_code == 200
    r3 = await async_client.get("/public/settings")
    assert r3.status_code == 200
    assert r3.headers.get("X-Cache") == "MISS"


@pytest.mark.asyncio
async def test_public_practicum_never_cached_across_user_roles(async_client, mock_db):
    user_id = f"asst-cache-{uuid4().hex[:8]}"
    email = f"{user_id}@student.its.ac.id"
    await mock_db.users.insert_one({
        "id": user_id,
        "name": "Lab Assistant",
        "email": email,
        "role": "contributor",
        "divisions": ["Academic"],
        "active": True,
        "password_hash": lib.auth.hash_password("TempPass123!"),
        "created_at": datetime.now(timezone.utc),
    })
    token = await lib.auth.create_session(user_id)
    try:
        anon = await async_client.get("/public/practicum")
        assert anon.status_code == 200
        assert "X-Cache" not in anon.headers
        assert all(item.get("can_access_modules") is False for item in anon.json())

        authed = await async_client.get("/public/practicum", cookies={"tnl_session": token})
        assert authed.status_code == 200
        assert "X-Cache" not in authed.headers
        assert all(item.get("can_access_modules") is True for item in authed.json())
    finally:
        await mock_db.sessions.delete_many({"user_id": user_id})
        await mock_db.users.delete_one({"id": user_id})


@pytest.mark.asyncio
async def test_public_cache_fails_open_when_redis_is_unavailable(async_client, monkeypatch):
    class BrokenRedis:
        async def get(self, *args, **kwargs):
            raise RedisError("redis down")

        async def set(self, *args, **kwargs):
            raise RedisError("redis down")

        def pipeline(self, *args, **kwargs):
            raise RedisError("redis down")

        async def aclose(self):
            return None

    monkeypatch.setattr(lib.cache, "_cache", None)
    monkeypatch.setattr(lib.cache.redis, "from_url", lambda *args, **kwargs: BrokenRedis())

    res = await async_client.get("/public/stats")
    assert res.status_code == 200
    assert res.headers.get("X-Cache") == "MISS"
    assert "room" in res.json()
