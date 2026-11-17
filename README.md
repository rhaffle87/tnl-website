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
cp backend/.env.example backend/.env     # then edit SEED_ADMIN_* and GOOGLE_ALLOWED_EMAILS
docker compose up --build                # mongodb + backend + frontend
docker compose exec backend python seed.py --reset
```

Open <http://localhost:3000> for the site, <http://localhost:3000/admin/login> for the CMS.

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
cd frontend && yarn install && yarn dev          # http://localhost:3000
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
path: `NEXT_PUBLIC_BASE_PATH=/lab-tnl yarn build`.

Run the backend under systemd or supervisor, and restart after **any** `.env` change.

### Path B — static export of the public pages (host without Node)

The public site is a client-rendered bundle, so `yarn build` produces a folder of static
files you can upload anywhere:

```bash
cd frontend && NEXT_PUBLIC_BASE_PATH=/lab-tnl yarn build   # → frontend/dist
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

### AI assistance (Jev / TypeSafe)

Three typed decisions, all failing **soft** so the site never blocks on them:
smarter publish checks (is this real content or filler?), contact-inbox triage
(topic + urgency + spam), and registration quality scoring (fit + junk flag).
Needs `EMERGENT_LLM_KEY`.

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

1. **Email + password** — bcrypt, rate limited, optional TOTP.
2. **Google sign-in** (Emergent-managed) — restricted to `GOOGLE_ALLOWED_DOMAINS`
   (`its.ac.id`, `student.its.ac.id`) plus any address in `GOOGLE_ALLOWED_EMAILS`.
   **Invite-only**: the address must already exist as a user, otherwise sign-in is
   refused with a clear message. No self-signup.

Roles: **Super Admin**, **Editor**, **Contributor** (drafts require approval),
**Registrar**, **Viewer**. Division scoping narrows writes — Media edits News, Academics
edits Practicum, Event edits Activities and Events.

---

## Public API

Scoped API keys in an `X-API-Key` header. Read keys serve published content; write keys
also publish News and Members for automation scripts.

```bash
curl -H "X-API-Key: tnl_…" https://riset.its.ac.id/lab-tnl/api/v1/news
curl -H "X-API-Key: tnl_…" -H 'Content-Type: application/json' \
     -d '{"items":[{"title":"…","body":"…","status":"published"}]}' \
     https://riset.its.ac.id/lab-tnl/api/v1/news/import
```

OpenAPI description: `GET /api/v1-docs/openapi`. Interactive FastAPI docs: `/docs`.

---

## Backup and restore

```bash
/app/scripts/backup.sh          # database + media, keeps 14 days in /app/backups
0 2 * * * /app/scripts/backup.sh >> /var/log/tnl-backup.log 2>&1
```

Restore:

```bash
mongorestore --uri="$MONGO_URL" --drop --archive=/app/backups/db-YYYY-MM-DD.archive --gzip
tar -xzf /app/backups/media-YYYY-MM-DD.tar.gz -C /
```

---

## Tests

```bash
cd backend && pytest                     # auth & permissions, registration uniqueness,
                                         # block renderer contract, quality gates
cd frontend && yarn typecheck && yarn lint
```

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
