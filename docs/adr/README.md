# Architecture Decision Records

These records describe the architecture visible in this repository on 2026-11-27.
`Accepted` records an implemented choice; it does not certify production rollout,
performance, accessibility, or regulatory compliance. `Proposed` describes work
that still needs implementation and verification.

## Index

| Record | Decision | Status |
| --- | --- | --- |
| [ADR-001](001-frontend-stack.md) | React, TypeScript, Vite and Tailwind frontend | Accepted |
| [ADR-002](002-backend-stack.md) | FastAPI, MongoDB and Motor backend | Accepted |
| [ADR-003](003-rate-limiting.md) | Shared Redis rate limits | Accepted |
| [ADR-004](004-caching-strategy.md) | Public API response caching | Proposed |
| [ADR-005](005-deployment.md) | Local deployment over Tailscale and CI validation | Accepted |
| [ADR-006](006-authentication.md) | Opaque cookie sessions and role permissions | Accepted |
| [ADR-007](007-cms-architecture.md) | Page blocks and MongoDB content documents | Accepted |
| [ADR-008](008-i18n-approach.md) | Runtime English and Indonesian localization | Accepted |

## Maintenance

Each record should state its status, context, decision, consequences, and links
to implementation evidence. Update the record when behavior changes. Describe
alternatives as evaluated only when there is evidence they were evaluated; do
not invent historical rationale, benchmark results, or operational guarantees.

Consent fields, retention tools, access checks, and audit logs are technical
controls. Assessing compliance with UU PDP or another regulation also requires
evidence about actual operation, policies, data flows, and organizational duties.
