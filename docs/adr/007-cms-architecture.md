# ADR-007: Page Blocks and MongoDB Content Documents

## Status

Accepted. Records the existing CMS model as of 2026-11-27.

## Context

Editors maintain public pages and structured laboratory content through the
React CMS. Pages need ordered blocks, publication state and revision history.

## Decision

Store a page as a MongoDB document represented by `PageDoc`: slug, localized
title, ordered blocks, publication state and revisions. A block has an ID, type,
props dictionary and hidden flag. The frontend block renderer maps supported
types to components. Site administration routes manage page and block changes.

Keep structured resources such as posts, members, equipment and events in their
own collections and models. Generic block props permit editor flexibility;
they are not a complete typed schema for every renderer property. Permission,
sanitization and publication checks remain server responsibilities.

## Consequences

Editor and renderer contracts must evolve together. A new block type requires
matching editing, rendering, validation and localization behavior. Revision
history supports content recovery but is not a substitute for database/media
backups or audit evidence. Flexible documents still need migration and
compatibility decisions when stored shapes change.

## Evidence

- [Page and block storage models](../../backend/models/content.py)
- [Page and block request models](../../backend/models/core.py)
- [Page administration routes](../../backend/routers/siteadmin.py)
- [Structured content routes](../../backend/routers/content.py)
- [Public block renderer](../../frontend/src/components/site/Blocks.tsx)
