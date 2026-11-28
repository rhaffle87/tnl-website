"""Shared Redis response cache for anonymous public GET endpoints (ADR-004).

Uses per-namespace version keys (`cache:ver:{ns}`) so invalidation is O(1) via
atomic `INCR` without scanning keys, and fails open on Redis unavailability so
public reads continue serving live MongoDB data.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from collections.abc import Awaitable, Callable
from typing import Any

import redis.asyncio as redis
from redis.backoff import NoBackoff
from redis.exceptions import RedisError
from redis.retry import Retry

logger = logging.getLogger(__name__)

_DEFAULT_TTL_SECONDS = 60


class PublicCache:
    def __init__(self, redis_url: str | None = None):
        self._client = redis.from_url(
            redis_url or os.environ.get("REDIS_URL") or "redis://127.0.0.1:6379/0",
            decode_responses=True,
            socket_connect_timeout=1.5,
            socket_timeout=1.5,
            retry=Retry(NoBackoff(), 0),
        )

    @staticmethod
    def _entry_key(namespace: str, version: str, params: dict[str, Any]) -> str:
        canonical = json.dumps(params, sort_keys=True, separators=(",", ":"), default=str)
        digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:32]
        return f"cache:v1:{namespace}:{version}:{digest}"

    async def get_or_set(
        self,
        namespace: str,
        params: dict[str, Any],
        ttl_seconds: int,
        loader: Callable[[], Awaitable[Any]],
    ) -> tuple[Any, bool]:
        if os.environ.get("PUBLIC_CACHE_ENABLED", "1").lower() in ("0", "false", "no"):
            return await loader(), False

        version = "0"
        key = ""
        try:
            version = await self._client.get(f"cache:ver:{namespace}") or "0"
            key = self._entry_key(namespace, version, params)
            cached = await self._client.get(key)
            if cached is not None:
                return json.loads(cached), True
        except (RedisError, ValueError, TypeError) as exc:
            logger.warning("Public cache read skipped (%s)", type(exc).__name__)
            return await loader(), False

        data = await loader()
        try:
            serialized = json.dumps(data, separators=(",", ":"), default=str)
            await self._client.set(key, serialized, ex=max(1, ttl_seconds))
        except (RedisError, ValueError, TypeError) as exc:
            logger.warning("Public cache write skipped (%s)", type(exc).__name__)
        return data, False

    async def invalidate(self, *namespaces: str) -> None:
        if os.environ.get("PUBLIC_CACHE_ENABLED", "1").lower() in ("0", "false", "no"):
            return
        unique = [ns for ns in dict.fromkeys(namespaces) if ns]
        if not unique:
            return
        try:
            async with self._client.pipeline(transaction=False) as pipe:
                for ns in unique:
                    pipe.incr(f"cache:ver:{ns}")
                await pipe.execute()
        except RedisError as exc:
            logger.warning("Public cache invalidation skipped (%s)", type(exc).__name__)

    async def close(self) -> None:
        await self._client.aclose()


_cache: PublicCache | None = None


def get_public_cache() -> PublicCache:
    global _cache
    if _cache is None:
        _cache = PublicCache()
    return _cache


async def close_public_cache() -> None:
    global _cache
    cache, _cache = _cache, None
    if cache is not None:
        await cache.close()


async def cached_public_json(
    namespace: str,
    params: dict[str, Any],
    loader: Callable[[], Awaitable[Any]],
    ttl_seconds: int = _DEFAULT_TTL_SECONDS,
) -> tuple[Any, bool]:
    return await get_public_cache().get_or_set(namespace, params, ttl_seconds, loader)


async def invalidate_public_cache(*namespaces: str) -> None:
    await get_public_cache().invalidate(*namespaces)
