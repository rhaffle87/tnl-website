# ADR-005: Local Deployment over Tailscale and CI Validation

## Status

Accepted. Records checked-in deployment tooling as of 2026-11-27, without
asserting that a deployment has been performed or verified.

## Context

The repository has two arrangements: Docker Compose for a local service stack,
and PowerShell tooling for copying a frontend bundle and backend source to the
Tailscale-connected application host. Nginx templates describe an edge proxy
and application server; systemd runs the Python backend on the app host.

## Decision

Keep these arrangements explicit. `scripts/deploy/deploy.ps1` defaults to a dry
run and requires `-Execute` for remote changes. Host names, addresses, credentials,
runtime secrets and Redis readiness must be checked for the actual target.
Use the deployment script's backup, snapshot and health-check procedures for a
deliberately authorized rollout.

GitHub Actions validates source, installs hash-locked Python dependencies, tests the
frontend bundle, builds digest-pinned service images, validates monitoring config,
starts an isolated disposable Compose stack, and runs the real-Mongo multi-process
workflow harness against its generated disposable database. It does not log in to a
registry, publish images, run SSH or deploy commands, assume self-hosted runner labels,
or configure email/webhook delivery. The frontend build artifact is retained for seven
days; CI success is not a production release.

The scheduled live-smoke workflow checks public route status, route-specific images and
critical browser console errors. It does not submit forms or change server records.
Backup transfer and restore validation are separate workflows: off-site pulls verify
age, SHA-256, gzip and archive paths; the restore drill uses a temporary networkless
MongoDB container and temporary media directory. The Windows task installer and
monitoring deployment hook are opt-in and are not run by CI.

Alertmanager has no recipient by default. Optional webhook delivery is generated from a
root-protected environment file only when explicitly enabled. Nginx exporter, blackbox
exporter and Alertmanager guest installation remain separate from source validation;
hosted CI cannot establish their production state. Repository branch protection and
required-check settings are also managed outside these workflow files.

## Consequences

Local deployment needs Tailscale connectivity and operator access separately
from hosted CI. Docker build success does not verify systemd, remote nginx,
secret configuration, data persistence or rollback on a live host. Those checks
belong to the deployment operation and its evidence.

## Evidence

- [Local Compose stack](../../docker-compose.yml)
- [Deployment script](../../scripts/deploy/deploy.ps1)
- [Health-check script](../../scripts/deploy/health-check.ps1)
- [Backend service](../../scripts/deploy/tnl-backend.service)
- [CI workflow](../../.github/workflows/ci.yml)
- [Live smoke workflow](../../.github/workflows/live-smoke.yml)
- [Backup and CI runbook](../ops/BACKUP-AND-CI-RUNBOOK.md)
- [Monitoring deployment plan](../../scripts/monitoring/deploy-monitoring.ps1)
