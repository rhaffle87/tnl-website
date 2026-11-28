# ADR-003: Shared Redis Rate Limits

## Status

Accepted for the repository implementation on 2026-11-27. Redis provisioning and
health on the target deployment remain operational prerequisites.

## Context

The checked-in systemd service runs two Uvicorn workers. Process-local request
counters cannot enforce a shared budget across those workers or app restarts.
Login, invitations, TOTP setup, API key writes, contact messages, registration
and certificate verification need independent request budgets.

## Decision

Use `lib/rate_limit.py` from async request handlers. A Redis Lua script removes
expired sorted-set entries, checks the count and records an accepted request
atomically. Redis supplies the clock, each member has a random identifier, and
keys expire after the window. `register_script` reloads a missing script.

Keep each namespace, key, limit and window at its call site. Login failure keys
combine the peer address with an email digest. IP attribution uses the ASGI peer
after the server's trusted proxy handling, rather than trusting arbitrary HTTP
forwarding headers in application code.

Return 429 with `Retry-After` when the budget is exhausted. A Redis error returns
503 with `Retry-After: 5` for protected operations. Do not silently switch to a
per-worker counter. Close the Redis pool during application shutdown.

## Consequences

Limits are shared by workers using the same Redis database. Redis availability
now affects protected writes; `/api/health` reports the limiter dependency. The
Compose service enables AOF with `appendfsync everysec`, which can lose recent
writes after a crash and does not establish persistence on a separately managed
Redis host. TTL expiry and an empty Redis database reset the relevant budgets.

Lua-backed fake Redis tests cover behavior locally. Prometheus configuration now
probes `/api/health` through a local blackbox exporter so a degraded rate limiter can
fail the probe. This observation exists in source only until the guarded monitoring
installer is run; production network latency, capacity, access controls, persistence,
backup policy and monitoring readiness still require verification.
Redis rate limiting does not implement application response caching.

## Evidence

- [Rate limiter and Lua script](../../backend/lib/rate_limit.py)
- [Authentication and peer-address helpers](../../backend/lib/auth.py)
- [Authentication rate limit call sites](../../backend/routers/auth.py)
- [Public rate limit call sites](../../backend/routers/public.py)
- [Behavior tests](../../backend/tests/test_rate_limit.py)
- [Redis persistence configuration](../../docker-compose.yml)
- [Two-worker service](../../scripts/deploy/tnl-backend.service)
