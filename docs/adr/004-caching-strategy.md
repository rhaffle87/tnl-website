# ADR-004: Public API Response Caching

## Status

Accepted and implemented as of 2026-11-28. Shared Redis response caching now covers an explicit allowlist of anonymous public GET endpoints alongside Redis rate limiting.

## Context

The frontend uses TanStack Query with a 60-second stale time for public queries. Nginx deployment templates give hashed assets a long cache lifetime. The media router distinguishes public files from protected files, and the SEO shell uses `no-cache, must-revalidate`.

Some routes under `/api/public` depend on a user's role or handle personal data and writes, so a blanket public cache rule for that prefix would be unsafe.

## Decision

Implement `backend/lib/cache.py` (`PublicCache`, `cached_public_json`, `invalidate_public_cache`) backed by `redis.asyncio` (`REDIS_URL`), with `PUBLIC_CACHE_ENABLED` defaulting to enabled (`1`):

- **Explicit anonymous GET allowlist** in `backend/routers/public.py` (evaluated only after `check_maintenance` passes):
  - `settings` (`/public/settings`, 60s TTL)
  - `stats` (`/public/stats`, 60s TTL)
  - `pages` (`/public/pages/{slug}`, 60s TTL)
  - `members` (`/public/members`, keyed by `status` and `batch`, 60s TTL)
  - `posts` (`/public/posts`, `/public/posts/{slug}`, keyed by query parameters/slug, 60s TTL)
  - `events` (`/public/events`, `/public/events/{slug}`, keyed by `type`/`include_past`/slug, 15s TTL)
  - `activities` (`/public/activities`, keyed by `category`, 60s TTL)
  - `projects` (`/public/projects`, keyed by `kind`, 60s TTL)
  - `publications` (`/public/publications`, keyed by `year`/`ptype`/`member_id`, 60s TTL)
  - `partners` (`/public/partners`, 60s TTL)
  - `equipment` (`/public/equipment`, keyed by `category`/`status`, 60s TTL)
  - `collections` (`/public/collections`, `/public/collections/{key}`, keyed by `key`/`limit`/`offset`, 60s TTL)
- **Excluded from shared cache**: `/public/practicum` (role-dependent `can_access_modules` and lab-assistant-only module links), `/contact`, `/registrations/{event_id}`, `/verify/{code}`, `/certificates/{code}/pdf`, `/public/certificates/{code}/download`, and all `/admin/*` / `/auth/*` routes.
- **O(1) versioned key invalidation**: each namespace maintains `cache:ver:{namespace}` incremented via Redis `INCR` on CMS/page/settings/theme/lab-photo/publication/collection/v1/registration mutations (`siteadmin.py`, `content.py`, `labphotos.py`, `pubimport.py`, `apiv1.py`, `public.py`, `registrar.py`), avoiding `KEYS`/`SCAN`.
- **Fail-open resilience**: on `RedisError` or serialization error, `cached_public_json` logs a warning and executes the live MongoDB loader directly so cache unavailability never breaks public reads.
- Responses on allowlisted routes emit `X-Cache: HIT` or `X-Cache: MISS` without setting a blanket `Cache-Control: public` header.

## Consequences

Public reads avoid repeated MongoDB queries under traffic bursts while preserving role isolation for `/public/practicum` and immediate freshness after CMS edits. When Redis is unavailable, public reads degrade gracefully to direct MongoDB queries (whereas protected rate-limited writes still enforce ADR-003).

## Evidence

- [Public response cache implementation](../../backend/lib/cache.py)
- [Allowlisted public endpoints](../../backend/routers/public.py)
- [Cache invalidation hooks](../../backend/routers/content.py)
- [Public cache behavior & isolation tests](../../backend/tests/test_public_cache.py)
- [Frontend query policy](../../frontend/src/lib/api/hooks.ts)
- [Rate limiter scope](003-rate-limiting.md)
