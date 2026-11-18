# Target Architecture — Proxmox LXC Infrastructure via Tailscale

## 1. System Topology Overview

The target deployment separates concerns across 4 dedicated LXC containers on Proxmox VE (`node2`), communicating securely over Tailscale MagicDNS and private IP ranges (`100.x.y.z`). No internal database, API port, or administrative daemon is exposed to the public internet.

```mermaid
flowchart TD
    subgraph Client ["Client Access"]
        Dev["Windows Dev Machine<br/>(100.104.240.20)<br/>VS Code / PowerShell"]
        User["End Users / Campus Network<br/>(Tailscale or Public Proxy)"]
    end

    subgraph Proxmox ["Proxmox VE (node2) Infrastructure"]
        subgraph CT102 ["CT 102: labtnl-web (100.102.105.77)"]
            NginxEdge["Nginx Reverse Proxy<br/>Port 80 / 443<br/>SSL / Security Headers"]
        end

        subgraph CT103 ["CT 103: labtnl-app (100.65.129.8)"]
            FrontendStatic["Frontend Static Files<br/>(SPA Nginx / Port 3000)"]
            FastAPI["Backend FastAPI / Uvicorn<br/>(systemd: tnl-backend.service / Port 8001)"]
            MediaStorage["Persistent Media Storage<br/>(/opt/tnl/media)"]
        end

        subgraph CT116 ["CT 116: labtnl-db (100.111.32.102)"]
            MongoDB["MongoDB 7.0 Engine<br/>(systemd: mongod / Port 27017)<br/>Listen: 127.0.0.1, 100.111.32.102"]
        end

        subgraph CT117 ["CT 117: labtnl-monitor (100.114.215.48)"]
            Prometheus["Prometheus Server (9090)"]
            Grafana["Grafana Dashboards (3001)"]
        end

        subgraph Preserved ["Existing External Nodes (Untouched)"]
            Ollama["Ollama AI Server<br/>(100.110.11.66 / 192.168.30.100)"]
        end
    end

    %% Network flows
    Dev -->|SSH / Deployment Automation| CT102
    Dev -->|SSH / Deployment Automation| CT103
    Dev -->|SSH / Data Sync| CT116
    Dev -->|SSH / Metrics Setup| CT117

    User -->|HTTP/HTTPS| NginxEdge
    NginxEdge -->|Proxy /| FrontendStatic
    NginxEdge -->|Proxy /api/| FastAPI

    FastAPI -->|Motor Async Driver (27017)| MongoDB
    FastAPI -->|Local File IO| MediaStorage

    Prometheus -.->|Scrape Node Exporter 9100| CT102
    Prometheus -.->|Scrape Node Exporter 9100| CT103
    Prometheus -.->|Scrape Node Exporter 9100| CT116
    Grafana -->|Data Query| Prometheus
```

---

## 2. Container Responsibility & Port Allocations

| Container | Hostname | Tailscale IP | Service & Process | Port(s) | Listening Interface |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **CT 102** | `labtnl-web` | `100.102.105.77` | Nginx (Edge Proxy) | 80, 443 | `0.0.0.0` / Tailscale |
| **CT 103** | `labtnl-app` | `100.65.129.8` | Nginx (Frontend SPA) | 3000 | `100.65.129.8`, `127.0.0.1` |
| **CT 103** | `labtnl-app` | `100.65.129.8` | FastAPI (Uvicorn backend) | 8001 | `100.65.129.8`, `127.0.0.1` |
| **CT 116** | `labtnl-db` | `100.111.32.102` | MongoDB Server 7.0 | 27017 | `100.111.32.102`, `127.0.0.1` |
| **CT 117** | `labtnl-monitor` | `100.114.215.48` | Prometheus | 9090 | `100.114.215.48`, `127.0.0.1` |
| **CT 117** | `labtnl-monitor` | `100.114.215.48` | Grafana | 3001 | `100.114.215.48`, `127.0.0.1` |

---

## 3. Network & Security Architecture

1. **Defense in Depth via Tailscale WireGuard Overlay:**
   - Database on CT 116 listens exclusively on `127.0.0.1` and `100.111.32.102`. It is impossible to connect to the database from the public internet or external subnet without valid Tailscale credentials.
2. **Reverse Proxy & Domain Routing (CT 102):**
   - Routes `/api/*` directly to `http://100.65.129.8:8001/api/`.
   - Routes all other requests to `http://100.65.129.8:3000/`.
   - Enforces strict HTTP security headers: `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `X-XSS-Protection: 1; mode=block`.
3. **Data Protection & Persistence:**
   - MongoDB database files reside on CT 116 root storage (`/var/lib/mongodb`).
   - Media directory `/opt/tnl/media` on CT 103 stores uploads, avatars, and certificate PDFs.
