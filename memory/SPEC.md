# TNL Studio — living spec

Public website + custom CMS for the **Telecommunication Network Laboratory (TNL)**,
Department of Electrical Engineering, Institut Teknologi Sepuluh Nopember (ITS), Surabaya.
Room **B-301**, Building B.

## Stack as built

FastAPI + MongoDB (motor) backend on 8001, every route on `APIRouter(prefix="/api")`.
Vite + React 19 + TypeScript strict frontend on 3000, relative `/api` calls through
`src/lib/api.ts`, TanStack Query for all reads/writes.

## Data model (Mongo collections)

`users`, `sessions`, `settings` (singleton id="settings", holds contact + theme tokens),
`pages` (block lists + revisions), `posts`, `members`, `events`, `activities`, `projects`,
`publications`, `partners`, `practicum`, `registrations`, `messages`, `media`, `api_keys`,
`audit_log`, `saved_blocks`, `collections_def`, `collection_items`, `outbox`.
All ids are string uuid4. Datetimes stored aware UTC.

## Key flows

- **Public site** is block-driven: every page is a `pages` record whose `blocks[]` the
  React `BlockRenderer` turns into sections. 8 system pages seeded and published:
  home, member, activity, news, publications, contact, terms, privacy.
- **EN/ID** — content fields carry a `*_id` twin; UI strings live in `src/lib/i18n.ts`.
- **Events** compute `reg_status` server-side (open / upcoming / closed / past / full)
  from the dates — the Register button disables itself after the close date.
- **Registration** is unique per email AND per NIM per event; over capacity → waitlist.
  Honeypot + rate limit + optional Turnstile; explicit UU PDP consent required.
- **Quality gates** (`lib/quality.py`) run on every save and BLOCK publishing while any
  `severity: "error"` remains. Failing items appear in Needs review.
- **Theme editor** has draft/published tokens; publishing is blocked when a colour pair
  fails WCAG AA contrast.

## Local content advisor — `backend/lib/advisor.py`

1. `review_draft()` — publish checks: substance score, placeholder probability,
   unverified-claim flag; merged into the item's issue list.
2. `triage_message()` — contact inbox category + urgency + spam probability.
Both are deterministic and offline (no API key, no network, no SDK) and fail SOFT
(`ai_ok: false` only when there is nothing to judge), so a save or a signup never
blocks on an external service. Issue codes (`ai_placeholder`, `ai_thin`,
`ai_unverified_claim`) stay identical to the old external implementation.

## Temporary feature flags — `frontend/src/lib/features.ts`

`doorCheckIn` and `certificates` default to false: the two Registrar desks are hidden
temporarily. Set `VITE_FEATURE_DOOR_CHECKIN=true` / `VITE_FEATURE_CERTIFICATES=true` at build
time to restore them. Backend endpoints remain live and tested — hiding the UI never deletes
registration or certificate data.

## Admin list hygiene

- `GET /admin/api-keys?status=active|revoked` returns `items` plus `counts`;
  `DELETE /admin/api-keys/{id}/purge` permanently removes a revoked key only (409 if active).
- `GET /admin/audit?period=hour|day|week|month|year` and the matching `/admin/audit/export`
  parameter filter the activity log by time range. Unknown periods return 422.

## API contracts (current audit fixes)

- **Self-service TOTP:** `POST /admin/users/{id}/totp-setup` returns the provisioning payload;
  `POST /admin/users/{id}/totp-confirm` activates it with the one-time code. Keep the
  existing last-Super-Admin guard intact.
- **Upload signing:** `UPLOAD_SIGNING_SECRET` must be configured in `backend/.env` when uploads
  are enabled; signed URLs are rejected when the secret is absent. Empty placeholder only in
  `.env.example` — never commit a value.
- **Public settings:** `/api/public/settings` serves an explicit allowlist only (contact/theme
  fields), never the full Settings document.
- **Outbox:** notification outbox routes are Super Admin only.
- **Certificates:** a certificate is issued only after the registration status is `attended`;
  verification of already-issued codes remains public.
- **Audit export:** `GET /admin/audit/export` accepts `offset` in addition to `period`, and
  returns header `X-Audit-Truncated` when results were cut short.
- **API keys:** keys carry `expires_at`; write scope implies read scope (a write key can also
  read published content).

## Auth & roles

Email+password (bcrypt) and Emergent-managed Google sign-in, both ending in the SAME
httpOnly cookie session (`tnl_session`, `sessions` collection). Google is restricted to
`its.ac.id`, `student.its.ac.id` plus `GOOGLE_ALLOWED_EMAILS`, and is **invite-only** —
the address must already exist as a user.

Roles: `super_admin`, `editor`, `contributor` (drafts only — cannot publish), `registrar`,
`viewer`. Division scoping narrows writes: media→posts, academics→practicum, event→
activities/events. Decision point is `require(action)` in `lib/auth.py`; deny by default.
The last active Super Admin cannot be demoted or deleted.

## Seed facts (`python seed.py --reset`)

- Head of Laboratory: **Dr. Ir. Achmad Affandi, DEA.** — real portrait, published quote,
  <affandi@its.ac.id>
- Lecturers and researchers: the lab's own three (Eko Setijadi, Sri Rahayu, Prasetiyono
  Hari Mukti), with real portraits and institutional e-mail addresses
- Assistants: the **real 2025/2026 roster** (24 people) transcribed from the lab's own member
  page, each with their published portrait pulled into the media library. Grouped
  Coordinator → Academics → Event → Media → Research, ordered lead → vice → staff.
  **Social fields stay empty** — the lab publishes none, so none are invented.
- 5 focus areas, 8 assistant activities, 5 practicum modules, 3 partners (ZTE, Huawei, ITS)
- Contact: <telconnetlab@gmail.com> · Instagram @tnllab_its · Gedung B, Ruang B-301
- Events: **Cisco Packet Tracer Training** (registration OPEN, capacity 40, 8-field form
  with a conditional field) + assistant recruitment (upcoming)
- R&D clusters, testbeds and the social project are seeded as **DRAFTS flagged
  "TODO: verify"** — unverified, never published
- 9 **real** publications (2024–2026: ISITIA, Sewagati, Jurnal RESTI, IEEE ICCE, Zenodo
  dataset), all published
- 3 **real** news posts, each summarising a citable activity (Cisco Packet Tracer
  registration, the Sedaeng village internet network, ISITIA 2025 papers). No invented
  articles and no lorem ipsum — the reference site's own placeholder posts were not copied.
- Home hero highlight tiles mirror the official lab page (Advanced Research Equipment,
  Hands-On Practicum, Research Collaboration, Certified Training Programs); the Head's
  quote is his published statement verbatim.
- Publications show an outbound link **only where the DOI is confirmed** (2 of 9:
  `10.12962/j26139960.v9i2.2416`, `10.29207/resti.v8i5.5928`). The other 7 render no link.
- All 28 member portraits are the real published photos, downloaded into the media library
  under `members/` at seed time (`_store_remote_image`, falls back to the placeholder avatar
  if the source host is unreachable — seeding never fails on a network error).
- Hero panel + a home gallery use 4 **illustrative** networking photos under
  `illustrative/`, captioned in EN/ID as "not a photo of Room B-301". Swap them in Media.
- R&D clusters and testbeds remain DRAFT/`TODO: verify` by explicit choice of the owner —
  do not publish them without the laboratory's confirmation.

## Deliberate deviations from the brief

- Stack is the pod's FastAPI + Vite template, not Next.js/Prisma/Auth.js — the same
  features are delivered on this stack (base path handled by the single-origin `/api`
  proxy; `PUBLIC_SITE_URL` drives sitemap/robots/OG).
- Block settings are edited as a typed JSON settings panel per block rather than
  per-field form widgets; drag-reorder is arrow-button reorder (keyboard accessible).
- Docker Compose is documented in the README for a clean clone; the pod itself runs
  under supervisor.
