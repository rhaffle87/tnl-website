# ADR-006: Opaque Cookie Sessions and Role Permissions

## Status

Accepted. Records the implemented authentication flow as of 2026-11-27.

## Context

Staff sign in to administer content and registrations. Integrations use scoped
API keys through separate API endpoints.

## Decision

Staff authentication uses bcrypt password hashes and random, opaque session
tokens. Sessions are stored in MongoDB with a user reference and expiry; lookup
also checks user activity and expiry. The `tnl_session` cookie is HttpOnly,
SameSite=Lax, and receives Secure only when `COOKIE_SECURE=true`.

`require(action)` enforces role permissions; division checks narrow applicable
content writes. Optional TOTP provides an additional sign-in factor. Session
revocation deletes the stored token. This is not JWT-based staff authentication.

Direct Google OIDC (`authorization_code` with PKCE `S256`, random `state`, and `nonce`) is implemented in `backend/routers/google_auth.py` and remains gated on `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `APP_URL`: `/auth/google/config` returns `enabled: false` until those credentials are configured. Sign-in is restricted to `GOOGLE_ALLOWED_DOMAINS` (`its.ac.id`, `student.its.ac.id`) plus `GOOGLE_ALLOWED_EMAILS`, requires an existing active or invited staff account (`google_sub` binding), and completes any enabled TOTP challenge via `/auth/google/complete`. The retired proxy exchange endpoint `/auth/google/session` returns `410 Gone`. API keys remain a separate permission and lifecycle model from browser sessions.

## Consequences

The session store must be available for authentication. Production cookie
security depends on HTTPS and environment configuration. CORS allowlists and
SameSite cookies are concrete controls, but do not prove comprehensive CSRF
protection. Enabling an external identity provider requires a separate verified
implementation. Authentication controls do not by themselves establish UU PDP
compliance.

## Evidence

- [Session, role and TOTP implementation](../../backend/lib/auth.py)
- [Authentication routes](../../backend/routers/auth.py)
- [Direct Google OIDC sign-in](../../backend/routers/google_auth.py)
- [Session expiry index](../../backend/lib/db.py)
- [API key scope checks](../../backend/routers/apiv1.py)
