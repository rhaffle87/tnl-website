# Migration Plan: Windows Docker Desktop -> Proxmox LXC

## 1. Overview & Phased Migration Strategy

This migration follows a strict zero-downtime, non-destructive approach:
- Windows Docker Desktop remains fully operational throughout the process.
- Each service is provisioned and verified in isolation before traffic cutover.
- Database is exported from local MongoDB using `mongodump` and restored to CT 116 using `mongorestore`.

---

## 2. Step-by-Step Execution Matrix

### Phase 1: Database Provisioning (CT 116 — `labtnl-db`)
1. Add official MongoDB 7.0 repository on Ubuntu 24.04 (`labtnl-db`).
2. Install `mongodb-org` package suite (`mongod`, `mongosh`, `mongodump`, `mongorestore`).
3. Configure `/etc/mongod.conf` with `bindIp: 127.0.0.1,100.111.32.102`.
4. Enable and start `mongod.service`.
5. Dump existing local Docker MongoDB (`tnl` database) from Windows:
   `docker compose exec mongodb mongodump --db tnl --out /tmp/dump`
6. Transfer dump to CT 116 via SCP over Tailscale (`100.111.32.102`).
7. Restore database on CT 116:
   `mongorestore --db tnl /tmp/dump/tnl`
8. Verify collections count and document count match local state (all 39 members, 38 pytest pass items).

### Phase 2: Application Provisioning (CT 103 — `labtnl-app`)
1. Install Python 3.11, `python3-venv`, `python3-pip`, `nginx`, `git`, and build tools on CT 103.
2. Create application directories: `/opt/tnl/backend`, `/opt/tnl/frontend`, `/opt/tnl/media`.
3. Synchronize `backend/` source files to `/opt/tnl/backend` via `rsync` or Git.
4. Synchronize `backend/media/` portraits and uploaded media to `/opt/tnl/media`.
5. Setup Python virtual environment:
   `/opt/tnl/backend/venv/bin/pip install -r /opt/tnl/backend/requirements.txt`
6. Configure production `.env` pointing `MONGO_URL` to `mongodb://100.111.32.102:27017`.
7. Configure `systemd` service: `/etc/systemd/system/tnl-backend.service`.
8. Start and enable `tnl-backend.service`, verify `/api/health` returns `200 OK`.
9. Build frontend on Windows (`yarn build`), package `dist/`, and SCP to `/opt/tnl/frontend/dist`.
10. Configure local Nginx on CT 103 to serve port 3000 for frontend SPA.

### Phase 3: Web Entry Point & Reverse Proxy (CT 102 — `labtnl-web`)
1. Install Nginx and SSL tools on CT 102.
2. Create Nginx site configuration `/etc/nginx/sites-available/labtnl`.
3. Proxy `/` -> `http://100.65.129.8:3000` (frontend on CT 103).
4. Proxy `/api/` -> `http://100.65.129.8:8001/api/` (backend on CT 103).
5. Enable site, test with `nginx -t`, and reload service.
6. Verify entire website access via `http://100.102.105.77` from Windows workstation browser.

### Phase 4: Monitoring Setup (CT 117 — `labtnl-monitor`)
1. Install Prometheus and Grafana on CT 117.
2. Install `prometheus-node-exporter` on CT 102, CT 103, and CT 116.
3. Configure Prometheus target scrapers to collect metrics over Tailscale.

### Phase 5: Automated PowerShell Deployment Tooling
1. Provide `scripts/deploy/deploy.ps1` for pushing code updates from Windows to CT 103 over Tailscale.
2. Provide `scripts/deploy/health-check.ps1` for instant health inspection across all 4 LXCs.
3. Provide `scripts/deploy/backup-db.ps1` for automated daily/pre-deploy snapshots of CT 116 database.
