"""Atomic, shared sliding-window limits for all backend workers."""

import logging
import os
import secrets

import redis.asyncio as redis
from fastapi import HTTPException
from redis.backoff import NoBackoff
from redis.exceptions import RedisError
from redis.retry import Retry

logger = logging.getLogger(__name__)

# Redis supplies the clock so workers cannot disagree about window boundaries.
RATE_LIMIT_SCRIPT = """
local key = KEYS[1]
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local window = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retry = math.max(1, math.ceil((tonumber(oldest[2]) + window - now) / 1000))
  return {0, count, retry}
end
redis.call('ZADD', key, now, ARGV[3])
redis.call('PEXPIRE', key, window)
return {1, count + 1, 0}
"""


class RateLimiter:
    def __init__(self, redis_url: str | None = None):
        self._client = redis.from_url(
            redis_url or os.environ.get("REDIS_URL") or "redis://127.0.0.1:6379/0",
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
            retry=Retry(NoBackoff(), 0),
        )
        # register_script reloads automatically after Redis restarts or SCRIPT FLUSH.
        self._script = self._client.register_script(RATE_LIMIT_SCRIPT)

    async def check_rate_limit(
        self, namespace: str, key: str, limit: int, window_seconds: int
    ) -> tuple[bool, int, int]:
        """Return (allowed, count, retry_after_seconds); denied hits do not extend the window."""
        result = await self._script(
            keys=[f"ratelimit:{namespace}:{key}"],
            args=[window_seconds * 1000, limit, secrets.token_hex(16)],
        )
        return bool(result[0]), int(result[1]), int(result[2])

    async def ping(self) -> None:
        await self._client.ping()

    async def close(self) -> None:
        await self._client.aclose()


_limiter: RateLimiter | None = None


def get_rate_limiter() -> RateLimiter:
    global _limiter
    if _limiter is None:
        _limiter = RateLimiter()
    return _limiter


async def close_rate_limiter() -> None:
    global _limiter
    limiter, _limiter = _limiter, None
    if limiter is not None:
        await limiter.close()


async def rate_limit_async(namespace: str, key: str, limit: int, window_seconds: int) -> None:
    try:
        allowed, _, retry_after = await get_rate_limiter().check_rate_limit(
            namespace, key, limit, window_seconds
        )
    except RedisError as exc:
        logger.warning("Rate limiting store unavailable (%s)", type(exc).__name__)
        raise HTTPException(
            status_code=503,
            detail="Request protection is temporarily unavailable. Please try again later.",
            headers={"Retry-After": "5"},
        ) from exc
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many attempts. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )
