# TNL Website — Infrastructure Audit (Current State)
*Generated: 2026-11-18*

## 1. Executive Summary
The Telecommunication Network Laboratory (TNL) website is currently running on **Windows 11 (Development Workstation)** using **Docker Desktop**. This audit maps the active services, dependencies, volumes, and network requirements to prepare for a clean migration to **Proxmox VE (node2) LXC containers via Tailscale private networking**.

---

## 2. Workstation & Development Environment
- **Host OS:** Windows 11
- **Local Dev Stack:** Docker Desktop (Engine 29.9.3, Compose v5.7.0)
- **Workstation Tailscale Node:** `100.104.240.20` (`lenovo`)
- **Active Local Endpoints:**
  - Frontend: `http://localhost:3000` (Container: `tnl-website-frontend-1`)
  - Backend API: `http://localhost:8001` (Container: `tnl-website-backend-1`)
  - MongoDB: `localhost:27017` internal (Container: `tnl-website-mongodb-1`)

---

## 3. Technology Stack & Service Inventory

### A. Database Service (`mongodb`)
- **Container Name:** `tnl-website-mongodb-1`
- **Engine & Version:** MongoDB Community Server `7.0` (Official `mongo:7` image)
- **Port:** `27017`
- **Persistent Volume:** `mongo-data` (`/data/db` inside container)
- **Database Name:** `tnl`
- **Collections:** `users`, `audit_log`, `settings`, `pages`, `posts`, `members`, `activities`, `practicum`, `equipment`, `partners`, `events`, `registrations`, `publications`, `projects`
- **Current Volume Size:** ~350 MB (includes indexes, published records, and seed data)

### B. Backend Service (`backend`)
- **Container Name:** `tnl-website-backend-1`
- **Runtime:** Python 3.11-slim
- **Framework:** FastAPI / Starlette / Uvicorn (port `8001`)
- **Key Python Dependencies:** `fastapi`, `uvicorn`, `motor` (Async MongoDB driver), `pydantic`, `python-jose`, `passlib`, `pillow`, `reportlab`, `qrcode`, `aiohttp`, `python-multipart`
- **Persistent Media Volume:** `media-data` mounted at `/data/media`
- **Local Assets on Disk:** `backend/media/` contains original studio portraits (`1-1.png` - `26.png`, `melisa.png`, `4-1.png`)
- **Environment Variables:**
  - `MONGO_URL`: Connection string to MongoDB instance
  - `DB_NAME`: `tnl`
  - `CORS_ORIGINS`: Allowed origins for cross-origin API calls
  - `PUBLIC_SITE_URL`: Root URL used in PDF QR codes and public asset links
  - `MEDIA_DIR`: Path to uploaded/cached media (`/data/media`)
  - `GOOGLE_ALLOWED_DOMAINS`: Domain restriction for SSO (`its.ac.id,student.its.ac.id`)
  - `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`: Default superadmin bootstrap credentials

### C. Frontend Service (`frontend`)
- **Container Name:** `tnl-website-frontend-1`
- **Framework:** React 19 + TypeScript + Vite + Tailwind CSS
- **Serving Mechanism:** Multi-stage build -> Static assets served by Nginx Alpine
- **Internal Proxy:** Nginx proxies `/api/` -> `http://backend:8001/api/`, all other routes -> `/index.html` (SPA routing)
- **Exposed Port:** `3000`

---

## 4. Tailscale & Proxmox VE Target Nodes Audit

Tailscale network status verified via `tailscale status`:

| Node Name | Tailscale IP | OS / Distribution | Target Responsibility |
| :--- | :--- | :--- | :--- |
| **labtnl-web** (CT 102) | `100.102.105.77` | Ubuntu 24.04.5 LTS | Nginx Reverse Proxy, TLS Termination, Edge Router |
| **labtnl-app** (CT 103) | `100.65.129.8` | Ubuntu 24.04.5 LTS | FastAPI Backend + React Web Build / Nginx |
| **labtnl-db** (CT 116) | `100.111.32.102` | Ubuntu 24.04.5 LTS | Dedicated MongoDB Server (v7.0) |
| **labtnl-monitor** (CT 117) | `100.114.215.48` | Ubuntu 24.04.5 LTS | Prometheus, Grafana, Node Exporters |

**External / Preserved Endpoints:**
- **ollama-server:** `100.110.11.66` / `192.168.30.100` — *Preserved and untouched.*

---

## 5. Migration Feasibility & Architectural Decisions

1. **Database Runtime on CT 116 (`labtnl-db`):**
   - MongoDB 7.0 Community Edition installed as native systemd service (`mongod`).
   - Bound to `127.0.0.1` and `100.111.32.102` (Tailscale interface only).
   - High performance, minimal container overhead, full persistence on root filesystem (`/var/lib/mongodb`).

2. **Application Runtime on CT 103 (`labtnl-app`):**
   - Python 3.11 virtualenv (`/opt/tnl/backend`) managed by systemd service (`tnl-backend.service`).
   - Production frontend static build (`dist/`) hosted locally or upstreamed to CT 102.
   - Media storage hosted on dedicated directory `/opt/tnl/media/`.

3. **Reverse Proxy on CT 102 (`labtnl-web`):**
   - Native Nginx reverse proxy with HTTP/2 and TLS.
   - Proxies traffic to `labtnl-app:8001` over Tailscale private network (`100.65.129.8`).
   - Security headers, gzip compression, and rate limiting configured natively.

4. **Monitoring on CT 117 (`labtnl-monitor`):**
   - Prometheus scraping node_exporter metrics from CT 102, 103, and 116.
