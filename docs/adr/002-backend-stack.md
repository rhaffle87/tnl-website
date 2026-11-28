# ADR-002: FastAPI, MongoDB and Motor Backend

## Status

Accepted. Records the implementation as of 2026-11-27.

## Context

The backend serves public content, CMS operations, media, registration workflows
and a scoped v1 API. Content and operational records are stored in MongoDB.

## Decision

Keep FastAPI with Pydantic request models and the existing Motor client in
`lib/db.py`. Use the pip requirements files: production dependencies are in
`requirements.txt`, while tests and lint/typecheck tools are in
`requirements-dev.txt`. The local Compose file selects MongoDB 7; that file is
not evidence of the database version running on a remote host.

Use pytest with the repository's xdist configuration. The shared test fixture
patches MongoDB with `mongomock-motor`; rate limiter tests use `fakeredis[lua]`.
Ruff gates backend correctness rules. Mypy currently gates the model package
and rate limiter; legacy seed/router typing requires separate repair before
expanding that gate.

Expose the generated full API contract at `/api/openapi.json` so it passes
through the production API proxy. Retain FastAPI's `/openapi.json` and the
separate key-scoped `/api/v1-docs/openapi` contract. Schema tests check request
model references and unique operation IDs; explicit HEAD routes remain available
without duplicating GET operation IDs in the schema.

## Consequences

Async database APIs fit the route implementation, but synchronous password,
image, PDF and import work still needs performance assessment. Mock-backed tests
verify application behavior without establishing real MongoDB/Redis deployment
health. FastAPI schema generation and the separately maintained v1 schema also
need tests when routes change.

The stack does not imply JWT sessions, active Google sign-in, an RQ queue,
S3-backed storage, or regulatory compliance. Those claims require their own
implementation evidence.

## Evidence

- [Application and router registration](../../backend/server.py)
- [Models](../../backend/models/core.py)
- [MongoDB client and indexes](../../backend/lib/db.py)
- [Production dependencies](../../backend/requirements.txt)
- [Test fixtures](../../backend/tests/conftest.py)
- [v1 API and its schema](../../backend/routers/apiv1.py)
- [Generated and v1 schema tests](../../backend/tests/test_openapi.py)
- [Session authentication](006-authentication.md)
