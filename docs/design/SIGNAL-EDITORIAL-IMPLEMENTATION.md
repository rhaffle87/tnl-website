# Signal Editorial — frontend implementation

## Scope

Apply the laboratory design research to existing React/CMS components; do not replace the page builder, seed the database, or mutate production content.

## Implemented blocks

- `hero`: editorial split layout; existing `title_before`, `title_accent`, `title_after`, `intro`, badge and CTA fields retained, including bilingual suffixes. Existing lab-photo `image_url`, `image_alt`, `image_caption` fields now render. Without an image an explicitly labelled network illustration is shown, not live telemetry.
- `numbered_cards`: numbered editorial rows with existing heading, cards, descriptions and see-all action. No new CMS block type.
- `gallery`: asymmetrical photographic layout with external captions, optional bilingual note, existing image-array contract and a labelled Base UI lightbox supporting Escape and focus restoration. Empty image arrays render nothing.
- `news_feed`: homepage feature/list composition; searchable archive retains its original grid and filters.

No new package dependencies. Existing CMS block IDs, order, visibility, live data hooks and route contracts retained. Content changes remain in Studio; no migration required. Public production photos currently include illustrative imagery: authored captions are preserved; do not describe these images as original laboratory photographs.

## Recovery

Pre-change checkpoint: branch `backup/pre-signal-editorial-a6eb4bf`. Implementation has been committed to `main` and deployed through Tailscale; preserve unrelated user changes.

## Live continuation verification

- Public routes, including four activity tabs, news article and event detail, were checked on the live deployment: 16 routes × 2 themes × 2 viewport widths (390/1440) = 64 cases. No page errors, horizontal overflow or completed broken images were detected. This is not a complete accessibility audit; lazy images and animations require separate settled-state checks.
- Continuation refines mobile member cards into horizontal directory rows, keeping full names and 44px actions readable, with an existing accessible placeholder when a CMS portrait request fails. No CMS records, privacy gates or registration contracts changed.
- Hero inverse headings and configurable Contact button foreground/background pairs have regression coverage; prior contrast patch deployed as `82e7575`.
- Docker preview is retired: `compose.local.yml` removed; production frontend releases use SSH/SCP to the app node through Tailscale, preserving backend/environment/database and creating frontend backups before publishing.
- Original CMS-authored photos/captions are retained. Authentic equipment photography and editorial translations require content-owner review, not invented replacements.
- Production contact/registration submissions and CMS edit/save remain deliberately unexercised to avoid real records and email side effects.

## Verification

Full unit suite after initial integration: 12 files / 61 tests passed using Node 26 workaround:

```bash
NODE_OPTIONS=--no-experimental-webstorage npx vitest run --maxWorkers=1
npm run build
npm run lint
```

Build succeeded. Lint has existing warnings (unused imports, hook dependencies and fast-refresh exports); it is not warning-free.

Temporary browser probe runs local Vite with GET-only public/media proxy to the existing public site. At widths 1440, 1024, 390 and 320: CMS hero and eight authored home blocks rendered, hero image loaded, no horizontal overflow and no page errors. EN/ID and light/dark combinations were covered. No admin login, production write or database reset was performed.

Header/footer integrated: CMS bilingual identity, full-screen mobile native dialog, direct desktop links at 1280px, active route indicators and editorial footer styling. Research/resource links use `tab=rd`.

Final combined verification: 12 test files / 61 tests passed; production build passed; `git diff --check` passed. jsdom emits a non-fatal “navigation to another Document” limitation. Chromium probe additionally exercised mobile menu Escape, focus restoration, scroll lock, desktop resize cleanup, and gallery Escape at the tested viewports. No JavaScript page errors or horizontal overflow were observed. No deployment performed; not a comprehensive accessibility audit.
