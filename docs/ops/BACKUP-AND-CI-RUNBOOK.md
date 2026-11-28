# Backup, Restore-Drill, CI, and Monitoring Runbook

Scope: the TNL application guests CT 102, CT 103, CT 116, and CT 117. This runbook
distinguishes checked-in procedures from what has actually been installed. A script,
service unit, dashboard, green local test, or CI definition is not proof that a
production host has it enabled or that a backup has been restored successfully.

## Backup Jobs and Status

The repository includes `tnl-backup-db.timer` and `tnl-backup-media.timer` for the
existing daily jobs. The database job writes compressed MongoDB archives on CT 116;
the media job writes compressed tar archives on CT 103. Their scripts verify the
archive format before replacing `latest` and export timestamp/size metrics to the
node-exporter textfile collector. Retention keeps at least three archives and prunes
archives older than fourteen days. Confirm that the units are installed and enabled
on the actual guests before relying on these source definitions.

Read-only status checks (do not print journal contents, environment files, or backup
payloads):

```powershell
ssh -o BatchMode=yes -o ConnectTimeout=5 root@100.111.32.102 "systemctl is-active tnl-backup-db.timer; systemctl list-timers --all --no-legend tnl-backup-db.timer; systemctl show tnl-backup-db.service -p Result -p ExecMainStatus -p InactiveExitTimestamp --no-pager; stat -c 'size=%s mtime=%y' /var/backups/tnl/db/latest.archive.gz"
ssh -o BatchMode=yes -o ConnectTimeout=5 root@100.65.129.8 "systemctl is-active tnl-backup-media.timer; systemctl list-timers --all --no-legend tnl-backup-media.timer; systemctl show tnl-backup-media.service -p Result -p ExecMainStatus -p InactiveExitTimestamp --no-pager; stat -c 'size=%s mtime=%y' /var/backups/tnl/media/latest.tar.gz"
```

Prometheus rules alert when a server-side backup timestamp is more than 28 hours
old, when either timestamp metric is absent, and when the edge or backend probes
fail. `tnl_backup_success` is emitted by successful backup runs; a stale timestamp
is the primary signal for a failed or missed run. Prometheus cannot observe a
workstation copy unless a separate metric integration is added.

The server-side `.archive.gz` files and the on-demand `scripts/deploy/backup-db.ps1`
`.archive` files are different formats. The former require `--gzip`; the latter do
not. Avoid restoring either into production without a separately approved incident
procedure.

## Workstation Copy

`scripts/ops/pull-latest-backups.ps1` downloads both `latest` archives over SSH with
`BatchMode`, bounded connection/keepalive options, and remote integrity-command timeouts.
It rejects backups older than 30 hours or more than five minutes in the future,
checks source and local size plus SHA-256, validates gzip and tar integrity, and
rejects unsafe media archive paths and special files. It only advances local latest
copies after validation and writes
`backups/offsite/latest-backups.json` as a metadata manifest. The manifest contains
timestamps, sizes, hashes, source guest addresses, and archive filenames, not backup
contents.

The read-only pull completed successfully on 2026-11-27T18:20:17Z. The CT 116 database
archive was 99,620 bytes with SHA-256
`05e69350bdcbb0ca13b0b3a9c7cad5ffccf0af96689f32922ecc814a004804ff`; the CT 103 media
archive was 53,749,692 bytes with SHA-256
`347bbba62d0b6e917941b2f592c2e499872a821fc2e07162b42239a0629d685b`. Both source
archives passed freshness and integrity checks, and the downloaded copies matched.
No remote backup files were modified.

Run a pull manually from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ops\pull-latest-backups.ps1
```

To register the optional daily Windows Task Scheduler task, first inspect the plan;
registration requires the explicit `-Execute` switch:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ops\install-offsite-backup-task.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ops\install-offsite-backup-task.ps1 -Execute
```

The task uses the current Windows identity, runs only during an interactive logged-on
session, stores no password, and requires Tailscale and SSH to be available. The
task was registered on the operator workstation on 2026-11-28 for 05:00 local time;
Task Scheduler reports it ready with the first run due 2026-11-29. The scheduled task
has not run yet, so the latest confirmed pull remains the manual run recorded above.
`backups/offsite/` is a workstation copy, not an immutable or geographic off-site
backup; copy it to an independently managed encrypted backup destination to protect
against workstation loss. Protect the workstation volume because backup archives may
contain personal data.

## Isolated Restore Drill

The repository's restore drill is deliberately local and isolated. It validates both
archives, extracts media only into a unique temporary directory, and restores the
database into a uniquely named database in a temporary MongoDB container with
`--network none`, a read-only archive mount, no published port, and tmpfs data. It
does not accept a production connection string, does not use `--drop`, and removes
the container and temporary media directory when finished.

Example command (run only on an operator workstation with Docker available):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ops\restore-drill.ps1 `
  -DatabaseArchive backups\offsite\latest-db.archive.gz `
  -MediaArchive backups\offsite\latest-media.tar.gz
```

A separate isolated restore validation was completed against the scheduled archives.
The CT 116 database archive restored into a temporary MongoDB instance on port 19434
under a scratch database, yielding 22 non-system collections and 952 documents. The
CT 103 media archive extracted to scratch as 159 files totaling 54,926,445 bytes; all
file hashes matched, and the temporary database and extracted files were cleaned.
No production database was mutated. This validation was separate from the
`restore-drill.ps1` wrapper, which was syntax checked but not executed. Production
disaster recovery is intentionally not automated by this drill.

## Monitoring and Alert Routing

The checked-in Prometheus config now defines:

- Node-exporter targets and server backup freshness metrics.
- A CT 102 Nginx-exporter target on port 9113, exposed through an Nginx proxy that
  allows only CT 117's Tailscale address.
- Redis metrics from CT 103 and a local blackbox exporter on CT 117 port 9115 probing
  CT 103 `/api/health`, CT 102 `/api/health`, and the public site. The application
  health endpoint reports the Redis limiter dependency as well as application/DB
  readiness.
- A local Alertmanager endpoint on CT 117 port 9093.

The default Alertmanager configuration intentionally has no delivery endpoint. It
does not invent an email address or send webhook notifications. To enable webhook
delivery after an operator configures the root-only `/etc/tnl/alertmanager.env` on
CT 117, the deployment hook has a separate explicit switch. It accepts
`TNL_ALERTMANAGER_WEBHOOK_URL` and optionally
`TNL_ALERTMANAGER_BEARER_TOKEN_FILE`; the token value remains in the protected file
and is not stored in this repository or passed as a command-line argument.

The monitoring stack was installed on CT 117, and CT 102 exporter access was hardened
on 2026-11-28. At verification, Prometheus reported 12/12 targets up; Prometheus,
Grafana, Alertmanager, and the blackbox exporter were active. Grafana listens on
CT 117's Tailscale address `100.114.215.48:3000`, not loopback, so its health check
must use that address. The Alertmanager runtime remains configured without an
external delivery endpoint; alerts are evaluated but are not sent.

The CT 102 exporter service runs as `prometheus` and binds only to `127.0.0.1:9114`.
Nginx exposes the metrics proxy at `100.102.105.77:9113` and permits only CT 117
(`100.114.215.48`). The CT 117 scrape returned `nginx_up`; a direct request from CT
103 returned HTTP 403. The public site and edge API health check both returned HTTP
200. Debian's package-default exporter unit is disabled; the other legacy unit is
not installed. The guarded rollback snapshot was removed after both access probes
passed.

`scripts/monitoring/deploy-monitoring.ps1` is plan-only by default. The regular
`-Execute` path installs/validates CT 117 monitoring configuration and Grafana
provisioning. To deploy or re-verify only the edge exporter without restarting CT
117 services or Grafana, use the exporter-only mode:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\monitoring\deploy-monitoring.ps1 `
  -Execute -InstallNginxExporter -ExporterOnly
```

This mode snapshots CT 102's managed files and service states, checks the scrape from
CT 117, requires HTTP 403 from CT 103, then removes its rollback snapshot. Do not pass
`-EnableAlertDelivery` unless a separately authorized recipient/endpoint is configured.

Safe readiness checks include:

```powershell
ssh -o BatchMode=yes -o ConnectTimeout=5 root@100.114.215.48 "systemctl is-active prometheus grafana-server tnl-alertmanager.service tnl-blackbox-exporter.service; curl -fsS --max-time 4 http://127.0.0.1:9090/-/ready; curl -fsS --max-time 4 http://127.0.0.1:9093/-/ready"
ssh -o BatchMode=yes -o ConnectTimeout=5 root@100.114.215.48 "curl -fsS --max-time 4 http://100.114.215.48:3000/api/health"
ssh -o BatchMode=yes -o ConnectTimeout=5 root@100.102.105.77 "systemctl is-active nginx tnl-nginx-exporter.service; ss -ltn | awk 'NR==1 || /:9113 |:9114 /'; nginx -t"
ssh -o BatchMode=yes -o ConnectTimeout=5 root@100.114.215.48 "curl -fsS --max-time 4 http://100.102.105.77:9113/metrics | grep -q nginx_up"
ssh -o BatchMode=yes -o ConnectTimeout=5 root@100.65.129.8 "curl --silent --max-time 4 --output /dev/null --write-out %{http_code} http://100.102.105.77:9113/metrics"
```

To inspect scrape health without dumping application payloads, query Prometheus's
target API and retain only job, instance, health, and sanitized error status fields.
Do not inspect or print application response bodies, guest environment files, or
backup payloads as part of routine verification.

## CI and Live Smoke

`.github/workflows/ci.yml` runs on pushes and pull requests for `main` and `develop`,
and on manual dispatch. It uses read-only GitHub token permissions, pinned action
commits, Python 3.11/3.12 hash locks, `npm ci`, dependency audits, Docker image builds,
monitoring-config validation, a disposable Compose startup with volume cleanup, and
a separate Mongo 7 service for `scripts/test/verify_mongo_workflows.py`. That harness
requires the explicit `TNL_INTEGRATION_MONGO_URL`, creates a fresh generated
`tnl_integration_<uuid>` database, uses multiple OS processes against real MongoDB,
and removes only the database it owns. It does not load `.env` or connect to a
production database.

Python resolver inputs are `backend/requirements.in` and
`backend/requirements-dev.in`. `backend/requirements.txt` is the full transitive
production lock with hashes consumed by Docker and deployment tooling.
`backend/requirements-dev.txt` and `backend/requirements-dev-py312.lock` are full
hash locks for CI/test Python 3.11 and 3.12 respectively. Install using
`python -m pip install --require-hashes -r <lockfile>`. Docker base images and
Compose Mongo/Redis images are pinned to registry digests; Dependabot monitors image,
Python, npm, and GitHub Action updates.

To update these lock artifacts, change the `.in` inputs deliberately, run the pinned
resolver from `backend/`, review the dependency diff, then test both interpreter locks:

```bash
uv pip compile requirements.in --python-version 3.11 --universal --generate-hashes --no-header --output-file requirements.txt
uv pip compile requirements-dev.in --python-version 3.11 --universal --generate-hashes --no-header --output-file requirements-dev.txt
uv pip compile requirements-dev.in --python-version 3.12 --universal --generate-hashes --no-header --output-file requirements-dev-py312.lock
```

`requirements-dev.in` constrains its production set with `requirements.txt`, keeping
CI and Docker on the same production dependency versions.

`.github/workflows/live-smoke.yml` runs on its daily schedule or manual dispatch. It
checks HTTP status, critical browser console errors, and broken images on each public
route without submitting forms or changing server data. Neither workflow contains
SMTP/webhook notification configuration; GitHub account notifications remain under
GitHub's own settings.

Compose startup and container image builds were not part of these checks. The separate
isolated restore validation is recorded above. Hosted CI has not run the new uncommitted
workflows; a push or pull request is required to trigger those hosted checks. No commit,
push, branch-protection change, deployment, or external notification was made.
