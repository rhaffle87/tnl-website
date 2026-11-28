"""Rate limits execute the production Lua, including shared state and failure paths."""

import asyncio

from fastapi import Request

from lib.auth import client_ip, login_failure_key
from lib.rate_limit import RateLimiter, close_rate_limiter, get_rate_limiter


async def test_workers_share_an_atomic_limit_under_concurrency():
    first, second = RateLimiter(), RateLimiter()
    try:
        results = await asyncio.gather(*(
            (first if index % 2 else second).check_rate_limit("login", "peer", 10, 300)
            for index in range(100)
        ))
        assert sum(allowed for allowed, _, _ in results) == 10
        assert await first._client.zcard("ratelimit:login:peer") == 10
        assert all(1 <= retry <= 300 for allowed, _, retry in results if not allowed)
        assert 0 < await first._client.pttl("ratelimit:login:peer") <= 300_000
    finally:
        await first.close()
        await second.close()


async def test_sliding_window_removes_only_expired_hits():
    limiter = get_rate_limiter()
    seconds, microseconds = await limiter._client.time()
    now_ms = seconds * 1000 + microseconds // 1000
    key = "ratelimit:contact:peer"
    await limiter._client.zadd(key, {"expired": now_ms - 60_001, "recent": now_ms - 10_000})

    assert await limiter.check_rate_limit("contact", "peer", 2, 60) == (True, 2, 0)
    ttl = await limiter._client.pttl(key)
    allowed, count, retry_after = await limiter.check_rate_limit("contact", "peer", 2, 60)
    assert not allowed and count == 2
    assert 1 <= retry_after <= 50
    assert await limiter._client.zscore(key, "expired") is None
    assert await limiter._client.zscore(key, "recent") is not None
    assert 0 < await limiter._client.pttl(key) <= ttl <= 60_000


async def test_limits_are_isolated_by_namespace_and_peer():
    limiter = get_rate_limiter()
    assert (await limiter.check_rate_limit("login", "peer-a", 1, 60))[0]
    assert not (await limiter.check_rate_limit("login", "peer-a", 1, 60))[0]
    assert (await limiter.check_rate_limit("invite", "peer-a", 1, 60))[0]
    assert (await limiter.check_rate_limit("login", "peer-b", 1, 60))[0]


async def test_script_reload_and_worker_recreation_preserve_hits():
    limiter = get_rate_limiter()
    assert (await limiter.check_rate_limit("login", "peer", 2, 60))[0]
    await limiter._client.script_flush()
    assert await limiter.check_rate_limit("login", "peer", 2, 60) == (True, 2, 0)
    await close_rate_limiter()
    replacement = get_rate_limiter()
    assert replacement is not limiter
    assert not (await replacement.check_rate_limit("login", "peer", 2, 60))[0]


async def test_contact_limit_is_enforced_despite_forged_proxy_headers(async_client, mock_db):
    subject = "rate-limit-contact-test"
    for attempt in range(6):
        response = await async_client.post("/contact", json={
            "name": "Visitor", "email": "visitor@example.org",
            "subject": subject, "message": "A laboratory visit request.",
        }, headers={
            "X-Forwarded-For": f"192.0.2.{attempt}",
            "X-Real-IP": f"198.51.100.{attempt}",
        })
        assert response.status_code == (200 if attempt < 5 else 429), response.text
    assert 1 <= int(response.headers["Retry-After"]) <= 3600
    assert await mock_db.messages.count_documents({"subject": subject}) == 5


async def test_redis_outage_fails_closed_and_health_reports_it(async_client, reset_rate_limits):
    reset_rate_limits.connected = False
    response = await async_client.post("/auth/login", json={
        "email": "anyone@example.org", "password": "irrelevant",
    })
    assert response.status_code == 503
    assert response.headers["Retry-After"] == "5"
    assert "redis://" not in response.text
    assert "set-cookie" not in response.headers
    health = await async_client.get("/health")
    assert health.status_code == 503
    assert health.json()["rate_limiter"] == "unavailable"
    assert (await async_client.get("/public/stats")).status_code == 200


def test_client_ip_uses_the_validated_asgi_peer():
    request = Request({
        "type": "http", "client": ("192.0.2.1", 1234),
        "headers": [(b"x-forwarded-for", b"attacker"), (b"x-real-ip", b"attacker")],
    })
    assert client_ip(request) == "192.0.2.1"
    assert client_ip(Request({"type": "http", "headers": []})) == "unknown"
    assert login_failure_key(" User@Example.org ", "192.0.2.1") == login_failure_key(
        "user@example.org", "192.0.2.1"
    )
    assert login_failure_key("user@example.org", "192.0.2.1") != login_failure_key(
        "user@example.org", "192.0.2.2"
    )
