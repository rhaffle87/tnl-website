# ADR-001: React, TypeScript, Vite and Tailwind Frontend

## Status

Accepted. Records the implementation as of 2026-11-27.

## Context

The repository contains one frontend for the public laboratory site and the
administrative CMS. Both consume the FastAPI backend through the `/api` prefix.

## Decision

Keep the existing React 19 application with strict TypeScript, React Router 7,
Vite 8 and Tailwind CSS 4. Vite 8 uses Rolldown. TanStack Query supplies query
state, Base UI supplies interactive primitives, TipTap supplies rich text editing,
and Motion supplies animation.

Use the checked-in npm lockfile with `npm ci`. The package scripts define oxlint,
TypeScript checks, Vitest tests and the production build. Playwright exercises
browser behavior, including the existing geometry harness.

## Consequences

Public and admin code share types and components, so changes need validation in
both contexts. A client-rendered application also needs explicit routing and SEO
handling at the serving layer; the repository includes a separate backend SEO
shell. Neither library selection nor successful builds prove accessibility,
bundle performance, or deployed SEO behavior. Measure those properties against
the actual build and serving configuration.

## Evidence

- [Dependencies and package scripts](../../frontend/package.json)
- [Strict TypeScript configuration](../../frontend/tsconfig.app.json)
- [Vite configuration](../../frontend/vite.config.ts)
- [Geometry test configuration](../../frontend/playwright.config.ts)
- [SEO shell implementation](../../backend/routers/seo.py)
- [Deployment arrangement](005-deployment.md)
