# TNL Studio — Telecommunication Network Laboratory (TNL), ITS Surabaya

Public website **and** custom CMS for the Telecommunication Network Laboratory,
Department of Electrical Engineering, Institut Teknologi Sepuluh Nopember — Room **B-301**,
Building B, Surabaya.

Built to be maintained by student lab assistants with no coding skill, who rotate every
one or two years: everything on the public site is editable from `/admin` in plain
language, with guardrails that refuse to publish broken or placeholder content.

---

## Quick start (clean clone)

```bash
cp backend/.env.example backend/.env     # then fill SEED_ADMIN_* and GOOGLE_ALLOWED_EMAILS
docker compose up --build                # mongodb + backend + frontend
docker compose exec backend python seed.py --reset
```

Open <http://localhost:3000> for the site, <http://localhost:3000/admin/login> for the CMS.

`backend/.env` is the **single source of truth** for backend settings: `docker-compose.yml`
loads it with `env_file`. Do not re-declare those keys in the compose `environment:` block
(variables already in the environment win over the file and would silently shadow it).
Every secret in the example files is an **empty placeholder**: fill `SESSION_SECRET` and
`UPLOAD_SIGNING_SECRET` locally before enabling uploads or deploying. Vite feature flags
(`VITE_FEATURE_*`) are read at **build time**, not runtime.
Change `SEED_ADMIN_PASSWORD` from its empty placeholder before the first seed on any server
reachable from outside your machine.

> **`seed.py --reset` drops pages, news, members, events, registrations (personal data),
> messages, media records, the audit log and API keys** (users and settings are kept). It now
> refuses to run when `PUBLIC_SITE_URL` is not local unless you add `--force`. Never use it on a
> live database.

### Creating the first admin account

The seed script creates the Super Admin from `backend/.env`:

```
SEED_ADMIN_EMAIL=you@its.ac.id
SEED_ADMIN_PASSWORD=<choose a strong password>
SEED_ADMIN_NAME=TNL Lab Administrator
```

Re-running `python seed.py` refreshes that account's password — it is also the password
reset of last resort. Every further account is created by **invitation** from
*People & access*; the invited person sets their own password from the emailed link.
The system refuses to demote or delete the **last active Super Admin**, so nobody can
lock the laboratory out of its own site.

---

## Local development (without Docker)

```bash
cd backend  && uvicorn server:app --host 0.0.0.0 --port 8001 --reload
cd frontend && npm install && npm run dev          # http://localhost:3000
cd backend  && python seed.py --reset
```

MongoDB must be reachable at `MONGO_URL`. The frontend dev server proxies `/api/*` to
the backend, so frontend code only ever calls **relative** `/api` paths.

---

## Deployment

### Path A — Node/Python server behind a reverse proxy (recommended)

Serve the built frontend and the FastAPI app behind one origin, so `/api` resolves
without CORS:

```nginx
server {
  server_name riset.its.ac.id;

  location /lab-tnl/api/ {
    proxy_pass http://127.0.0.1:8001/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /lab-tnl/ {
    alias /srv/lab-tnl/dist/;
    try_files $uri $uri/ /lab-tnl/index.html;
  }
}
```

Set in `backend/.env`:

```
PUBLIC_SITE_URL=https://riset.its.ac.id/lab-tnl
APP_URL=https://riset.its.ac.id/lab-tnl
COOKIE_SECURE=true
CORS_ORIGINS=https://riset.its.ac.id
```

`PUBLIC_SITE_URL` drives `sitemap.xml`, `robots.txt`, JSON-LD, OG tags, certificate
verification links and invitation emails. Build the frontend with the deployment base
path: `NEXT_PUBLIC_BASE_PATH=/lab-tnl npm run build`.

Run the backend under systemd or supervisor, and restart after **any** `.env` change.

`robots.txt`, `sitemap.xml` and the per-page Open Graph tags are served by the backend under
`/api`, so the reverse proxy must route them explicitly or crawlers receive the SPA shell:

```nginx
location = /robots.txt  { proxy_pass http://127.0.0.1:8001/api/robots.txt; }
location = /sitemap.xml { proxy_pass http://127.0.0.1:8001/api/sitemap.xml; }
# Link-preview bots do not run JavaScript; hand them the server-rendered meta tags.
location / {
  if ($http_user_agent ~* "(facebookexternalhit|WhatsApp|Twitterbot|LinkedInBot|Slackbot|TelegramBot|Googlebot|bingbot)") {
    rewrite ^ /api/seo/render?path=$uri break;
    proxy_pass http://127.0.0.1:8001;
  }
  try_files $uri $uri/ /index.html;
}
```

When the site is served under a sub-path, the router base and the `/api` prefix both follow
`NEXT_PUBLIC_BASE_PATH` (it is read by `vite.config.ts` as the Vite `base`). Verify with
`curl -s https://<host>/robots.txt | head` after every proxy change.

### Path B — static export of the public pages (host without Node)

The public site is a client-rendered bundle, so `npm run build` produces a folder of static
files you can upload anywhere:

```bash
cd frontend && NEXT_PUBLIC_BASE_PATH=/lab-tnl npm run build   # → frontend/dist
```

Upload `dist/` to the static host. The **admin runs elsewhere** (a small server or an
internal machine) against the same database; after content changes, re-run the build and
re-upload — that is the "trigger a rebuild" step. Note the trade-off: without a backend
behind it, the static copy shows the shell, navigation and static copy, and the
data-driven regions show their "Coming soon" empty state rather than an error. Point the
static host's `/api` at the admin server if you want live data.

---

## What is in the box

### Public site

Home (hero with the B-301 badge, live stats, About, numbered research cards, Fields of
Study carousel, quick links, latest news, partner strip, announcement popup), Member
(Head of Laboratory banner, lecturer grid, assistants under batch tabs grouped by
division with colour-coded role chips and a detail modal, alumni filter), Activity
(R&D projects, Practicum, Training/Events, Assistant Activity), News with article pages,
Publications, Contact, Terms, Privacy — plus any page an admin creates.

EN/ID toggle throughout. Sticky white header, black four-column footer. Every contact
detail comes from **one** Settings record, so the footer and the contact page can never
disagree. Every list has a designed "Coming soon" empty state.

### TNL Studio (`/admin`)

Block-based page builder (23 widget types) with reorder, duplicate, hide, draft vs
published, preview links and one-click revision restore. Content types with search,
filters and bulk actions. Media library with WebP derivatives, mandatory alt text,
"used in N places" and delete protection. Theme editor with draft/published tokens and a
publish block when contrast fails WCAG AA. Registrar dashboard, contact inbox, audit log
with CSV export, API keys with OpenAPI docs, admin-defined Collections, and an in-app
**Maintainer guide** covering every routine job.

### Content quality gates

Enforced at publish time, surfaced in a **Needs review** queue: lorem ipsum, 555-xxxx
phone numbers, empty or `#` links, malformed emails and mailto links, images missing alt
text, one social URL reused across members, social URLs that do not match their platform
domain, phone numbers outside the +62 format, and statistics or funding claims that are
not marked verified. Plus an EN/ID typo hint.

### Local content advisor (no external AI)

Two deterministic, offline decisions — no credentials, no network, no third-party SDK:
draft substance/placeholder/claim review (`lib/advisor.py: review_draft`) merged into the
publish issue list, and contact-inbox category + urgency + spam scoring (`triage_message`).
Both keep the `ai_ok` contract and fail soft (empty input → `ai_ok: false`) so a save or
a signup never blocks on an external service. The rulebook constants live in `lib/advisor.py`.

### Temporarily hidden desks

Door check-in and certificate issuing are hidden from the Registrar UI while the CMS is being
tidied. Restore them without touching code by setting `VITE_FEATURE_DOOR_CHECKIN=true` and
`VITE_FEATURE_CERTIFICATES=true` in the frontend build environment (or flip the defaults in
`frontend/src/lib/features.ts`). Backend routes stay live and tested, so no registration or
certificate data is lost while the desks are hidden.

#### Sunset note

The temporary desks are removed on 2026-12-31 unless re-enabled earlier by setting
the VITE_* flags in the frontend build environment. VITE_* values are build-time
only: they are read when the bundle is created and cannot be changed at runtime.

### Admin list hygiene

- API keys: active/revoked badge and status filter; revoked keys can be deleted permanently
  with `DELETE /admin/api-keys/{id}/purge` (an active key returns 409 — revoke it first).
- Activity log: `GET /admin/audit?period=hour|day|week|month|year`, also honoured by the
  CSV export at `GET /admin/audit/export?period=...`.
- Audit export additionally accepts `offset` and sets `X-Audit-Truncated: true` when the
  response was cut short (page through with larger `offset` values).

### Registration engine

Capacity, open/close dates, poster, optional fee, and a form builder (text, email,
phone/WhatsApp, NIM/NRP, department, select, checkbox, file upload, required flags,
conditional fields). Unique per email **and** per NIM per event; a waitlist engages when
full and promotes automatically when a place frees up. Honeypot, rate limiting and
optional Cloudflare Turnstile. QR check-in, bulk email, CSV export, PDF certificates with
a public `/verify/{code}` page.

### Security & privacy

bcrypt passwords, httpOnly cookie sessions, login rate limiting, optional TOTP for Super
Admin, HTML sanitisation on every stored rich-text/custom-HTML block, security headers,
and role + division authorization enforced server-side on every route.

Registrant data follows Indonesia's **UU PDP**: explicit consent with a stated purpose,
a configurable retention window, per-registrant delete *or* anonymise, a retention sweep,
no personal data written to the audit log, and no public participant lists.

---

## Authentication

Two ways in, both ending in the same httpOnly cookie session:

1. **Email + password** — bcrypt, rate limited, optional TOTP with single-use recovery codes.
2. **Google sign-in** (Direct Google OIDC with PKCE, when configured) — restricted to `GOOGLE_ALLOWED_DOMAINS`
    (`its.ac.id`, `student.its.ac.id`) plus any address in `GOOGLE_ALLOWED_EMAILS`.
    **Invite-only**: the address must already exist as a user, otherwise sign-in is
    refused with a clear message. It remains disabled until `GOOGLE_CLIENT_ID`,
    `GOOGLE_CLIENT_SECRET`, and `APP_URL` are configured. No self-signup.

Password recovery uses a generic request response and a single-use link that expires
after 30 minutes; sending the link requires configured outbound email. Successful reset
revokes existing sessions. Users can also change their password after proving the
current password, and administrators can rotate or revoke pending invitations.

Roles: **Super Admin**, **Editor**, **Contributor** (drafts require approval),
**Registrar**, **Viewer**. Division scoping narrows writes — Media edits News, Academics
edits Practicum, Event edits Activities and Events.

---

## Public API

Scoped API keys in an `X-API-Key` header. Read keys serve published content; write keys
also publish News and Members for automation scripts. Keys carry `expires_at`, and a write
scope implies read scope (write keys can also read published content).

```bash
curl -H "X-API-Key: tnl_…" https://riset.its.ac.id/lab-tnl/api/v1/news
curl -H "X-API-Key: tnl_…" -H 'Content-Type: application/json' \
     -d '{"items":[{"title":"…","body":"…","status":"published"}]}' \
     https://riset.its.ac.id/lab-tnl/api/v1/news/import
```

Versioned API contract: `GET /api/v1-docs/openapi`. Full generated OpenAPI schema:
`GET /api/openapi.json` (also `/openapi.json`). Interactive FastAPI docs: `/docs`.

### Current API contract notes

- **Self-service TOTP:** `POST /admin/users/{id}/totp-setup` returns the provisioning payload
  and `POST /admin/users/{id}/totp-confirm` activates it with the one-time code. The
  last-active-Super-Admin guard still applies.
- **Upload signing:** Set a dedicated `UPLOAD_SIGNING_SECRET` in `backend/.env` when
  uploads are enabled. If it is absent, signing falls back to `SESSION_SECRET` and then
  `JWT_SECRET`; URL generation fails closed if none is configured. Keep the signing key
  stable across deployments so existing signed links remain verifiable until expiry.
- **Public settings:** `/api/public/settings` returns only an explicit allowlist of
  contact/theme fields, never the whole Settings document.
- **Outbox:** notification outbox endpoints are restricted to Super Admin.
- **Certificates:** a certificate is issued only when the registration is `attended`;
  public verification of already-issued codes is unchanged.
- **Audit export:** `offset` plus `X-Audit-Truncated` as described in *Admin list hygiene*.
- **API keys:** `expires_at` and write-implies-read as described above.

---

## Backup and restore

The production database and media backup timers, retention, freshness metrics, off-site
pull, and safe local restore drill are documented in
[`docs/ops/BACKUP-AND-CI-RUNBOOK.md`](docs/ops/BACKUP-AND-CI-RUNBOOK.md). Timer files in
the repository do not prove the timers are enabled on a guest. Do not use a production
database or Compose data volume as a restore target for routine verification.

On Windows, after a verified workstation copy is available, the isolated drill is:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ops\restore-drill.ps1 `
  -DatabaseArchive backups\offsite\latest-db.archive.gz `
  -MediaArchive backups\offsite\latest-media.tar.gz
```

It requires Docker Engine. Mongo runs in a network-isolated disposable container; media
is extracted under a unique temporary directory. The drill never uses `--drop`, a
production connection string, or a persistent volume.

`scripts/ops/backup.sh` remains for the original single-container layout
(`/app/backend/.env`, `mongodump` on the PATH); it does not run inside the Compose backend
container.

---

## Tests

```bash
cd backend && python -m pip install --require-hashes -r requirements-dev.txt
cd backend && pytest                     # auth & permissions, registration uniqueness,
                                         # block renderer contract, quality gates
cd frontend && npm ci
cd frontend && npm run typecheck && npm run lint && npm test
```

---

## Production Deployment & Architecture (Proxmox LXC Cluster)

In production at `https://labtnl.site`, the application runs across an isolated Proxmox LXC cluster networked over Tailscale:
- **CT 102 (`labtnl-web` / `100.102.105.77`)**: Public entry point via Cloudflare Tunnel (`cloudflared`). Nginx terminates traffic, applies security headers, restores client IP via `CF-Connecting-IP`, and reverse proxies to CT 103.
- **CT 103 (`labtnl-app` / `100.65.129.8`)**: FastAPI backend uvicorn on port 8001 (configured with `--proxy-headers --forwarded-allow-ips "100.102.105.77,127.0.0.1"`), Nginx serving frontend dist on port 3000 with `@seo_shell` server-rendering, and loopback-only Redis for shared rate limits. Redis uses AOF with `appendfsync everysec`.
- **CT 116 (`labtnl-db` / `100.111.32.102`)**: MongoDB database service; scheduled backup units and Prometheus node-exporter textfile metrics are defined in the repository and must be checked on-host before relying on them.
- **CT 117 (`labtnl-monitor` / `100.114.215.48`)**: Prometheus & Grafana (Grafana API on port 3000). The repository now defines local Alertmanager/blackbox exporters and Redis-aware backend health probes, but those additions require the guarded monitoring installer before they are active on the guest.

The monitoring deployment hook is plan-only unless explicitly invoked with `-Execute`;
optional Nginx exporter setup on CT 102 additionally requires `-InstallNginxExporter`.
Alertmanager has no external receiver by default. No recipient or credential is stored
in this repository. Guest installation, Tailscale ACL/firewall restriction, and optional
delivery credentials remain operator-managed and unverified here.

To deploy updates from the project root (the script is a **dry run by default**; add
`-Execute` only when you intend to change the servers — it backs up the database first,
snapshots source, Python venv, config, and frontend for rollback, and aborts when any health check fails):
```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy\deploy.ps1            # dry run
powershell -ExecutionPolicy Bypass -File scripts\deploy\deploy.ps1 -Execute   # real deploy
# health-check exits 0 on all-pass, 1 on any failure (safe for CI / deploy gate)
powershell -ExecutionPolicy Bypass -File scripts\deploy\health-check.ps1
```

Redis must already be installed and running on CT 103; deployment checks it before
changing the app. The default `REDIS_URL` is `redis://127.0.0.1:6379/0`. The CI Compose
gate starts MongoDB, Redis, backend, and frontend with disposable project-scoped
volumes, then removes those volumes. A separate Mongo 7 service runs the real
multi-process workflow harness against a generated test database.
The backend briefly stops while source and dependencies are replaced. Failed releases
restore the saved venv and source, preserve `.env`, media, and downloaded files, then
verify the restored services. Snapshot paths are printed by the deployment script.

Offline support stores only a bilingual fallback document and the public manifest.
Known public information routes display that fallback when navigation fails; API,
admin/auth, uploads/media, dynamic, and query-bearing routes remain network-only.
Submissions are never queued or replayed, and worker updates wait for old tabs to close.

---

## Seed content

Real content from the current site: the lab name and B-301, the About text, Head of
Laboratory **Dr. Ir. Achmad Affandi, DEA.** with his quote, the lecturers and researchers,
the hero highlight tiles, the five focus areas, the eight assistant activities, the **real
2025/2026 assistant roster** (24 people with their published portraits), partners (ZTE,
Huawei, ITS), the contact record, and the **Cisco Packet Tracer training** as a sample open
registration.

R&D clusters, testbeds, hero statistics and any funder claim are seeded as **drafts
flagged `TODO: verify`** — they are unverified and never published. Fake phone numbers,
invented social links and placeholder articles are never seeded.

Where the real content comes from:

| Content | Source |
| --- | --- |
| Lab description, Head's quote, hero tiles, partners | official page `riset.its.ac.id/lab-tnl` |
| Head, lecturers/researchers, 24 assistants + portraits | lab member page `riset.its.ac.id/lab-tnl/member` |
| Institutional e-mail addresses | department directory `its.ac.id/telektro` |
| 9 publications (ISITIA, Sewagati, RESTI, IEEE ICCE, Zenodo) | citable published records |

Member portraits are **downloaded into the local media library** at seed time (never
hot-linked), so the site keeps working if the source page changes. Social fields stay empty
because the lab publishes none. A publication shows a link **only when its DOI is
confirmed** (2 of 9 today: Sewagati `10.12962/j26139960.v9i2.2416`, Jurnal RESTI
`10.29207/resti.v8i5.5928`); the rest deliberately render no link rather than a guess.

Pages with no photograph of B-301 yet use **illustrative networking photography**, captioned
in both languages as *"not a photo of Room B-301"* so no visitor mistakes it for the real
room. Replace it from **Media** in the CMS once the lab supplies its own photos. The
reference site's own lorem-ipsum news posts were deliberately **not** copied — the 3 seeded
news posts each summarise an activity with a public record behind it.
