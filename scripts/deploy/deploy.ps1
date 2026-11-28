# Automated Deployment Tool from Windows to CT 103 (labtnl-app) via Tailscale
# SAFETY: read-only by default. Pass -Execute explicitly to perform any change.
param (
    [string]$AppNode = "100.65.129.8",
    [string]$EdgeNode = "100.102.105.77",
    [switch]$SkipFrontendBuild = $false,
    [switch]$SkipBackendDeploy = $false,
    [switch]$SkipBackup = $false,
    [switch]$DryRun = $false,
    [switch]$Execute = $false
)

$ErrorActionPreference = "Stop"
$dryRun = $DryRun -or (-not $Execute)
$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$snapshot = "/opt/tnl/.deploy-rollback/$timestamp"
$edgeSnapshot = "/etc/nginx/.deploy-rollback/$timestamp"
$snapshotReady = $false
$appChanged = $false
$edgeChanged = $false

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "    TNL Studio Automated Deployment over Tailscale        " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Target Host: $AppNode"
Write-Host "Workspace:   $root"
Write-Host "Mode:        $(if ($dryRun) { 'DRY RUN (no changes will be made)' } else { 'EXECUTE (real changes)' })`n"

function Invoke-LocalNativeChecked {
    param([string]$Description, [string]$Command, [string[]]$Arguments)
    if ($dryRun) { Write-Host "[DRY RUN] $Description"; return }
    Write-Host $Description -ForegroundColor Yellow
    $global:LASTEXITCODE = 0
    & $Command @Arguments
    $code = $LASTEXITCODE
    if ($null -eq $code -or $code -ne 0) { throw "$Description failed with exit code $code" }
}

function Invoke-ScpChecked {
    param([string]$Description, [string]$Source, [string]$Target)
    if ($dryRun) { Write-Host "[DRY RUN] $Description (scp -> $Target)"; return }
    Write-Host $Description -ForegroundColor Yellow
    $global:LASTEXITCODE = 0
    scp $Source $Target
    $code = $LASTEXITCODE
    if ($null -eq $code -or $code -ne 0) { throw "$Description failed with exit code $code" }
}

function Invoke-RemoteChecked {
    param([string]$Description, [string]$Node, [string]$RemoteCommand)
    if ($dryRun) { Write-Host "[DRY RUN] $Description (ssh $Node)"; return }
    Write-Host $Description -ForegroundColor Yellow
    $global:LASTEXITCODE = 0
    ssh -o BatchMode=yes -o ConnectTimeout=10 "root@$Node" ($RemoteCommand -replace "`r`n", "`n")
    $code = $LASTEXITCODE
    if ($null -eq $code -or $code -ne 0) { throw "$Description failed with exit code $code" }
}

function Invoke-PsScriptChecked {
    param([string]$Description, [string]$Script, [string[]]$Arguments)
    if ($dryRun) { Write-Host "[DRY RUN] $Description (script: $Script)"; return }
    Write-Host $Description -ForegroundColor Yellow
    $global:LASTEXITCODE = 0
    if ($Arguments) { & $Script @Arguments } else { & $Script }
    $code = $LASTEXITCODE
    if ($null -eq $code -or $code -ne 0) { throw "$Description failed with exit code $code" }
}

if ($dryRun) {
    Write-Host "Rencana (tidak dieksekusi):" -ForegroundColor DarkGray
    Write-Host "  0. Backup database pra-update: $(if ($SkipBackup) { 'DILEWATI (-SkipBackup)' } else { 'scripts/deploy/backup-db.ps1' })"
    Write-Host "  1. Build frontend: $(if ($SkipFrontendBuild) { 'dilewati' } else { 'npm run build / docker compose cp' })"
    Write-Host "  2. Snapshot remote (frontend, backend source, venv, configs) ke $snapshot"
    Write-Host "  3. Kirim bundle frontend dan source backend ke CT 103"
    Write-Host "  4. Sinkronkan nginx-ct103.conf / tnl-frontend-nginx.conf / tnl-backend.service"
    Write-Host "  5. Sinkronkan nginx-ct102.conf ke CT 102 (jika ada)"
    Write-Host "  6. health-check.ps1 (gagal => rollback otomatis)"
    Write-Host "`nJalankan dengan -Execute untuk benar-benar melakukan deployment." -ForegroundColor Green
    exit 0
}

function Invoke-Rollback {
    param([string]$Reason)
    Write-Host "`n[ROLLBACK] $Reason" -ForegroundColor Red
    $rollbackErrors = @()
    $rollbackCmd = @"
set -eu
if [ -f '$snapshot/backend/backend-src.tar.gz' ]; then
    systemctl stop tnl-backend
    mkdir -p '$snapshot/failed-source'
    find /opt/tnl/backend -mindepth 1 -maxdepth 1 ! -name venv ! -name .env ! -name media ! -name downloaded_files -exec mv -t '$snapshot/failed-source' -- {} +
    tar -xzf '$snapshot/backend/backend-src.tar.gz' --no-same-owner --no-same-permissions -C /opt/tnl/backend
    mv /opt/tnl/backend/venv '$snapshot/failed-venv'
    cp -a '$snapshot/backend/venv' /opt/tnl/backend/venv
fi
if [ -d /opt/tnl/frontend/dist ]; then mv /opt/tnl/frontend/dist '$snapshot/failed-dist'; fi
if [ -d '$snapshot/frontend/dist' ]; then cp -a '$snapshot/frontend/dist' /opt/tnl/frontend/dist; fi
if [ -f '$snapshot/config/tnl-frontend' ]; then cp -a '$snapshot/config/tnl-frontend' /etc/nginx/sites-available/tnl-frontend; fi
if [ -f '$snapshot/config/nginx-ct103.conf' ]; then cp -a '$snapshot/config/nginx-ct103.conf' /etc/nginx/sites-available/nginx-ct103.conf; else rm -f /etc/nginx/sites-available/nginx-ct103.conf; fi
if [ -f '$snapshot/backend/backend-src.tar.gz' ]; then
    cp -a '$snapshot/config/tnl-backend.service' /etc/systemd/system/tnl-backend.service
    systemctl daemon-reload
    systemctl restart tnl-backend
fi
nginx -t
systemctl reload nginx
curl --fail --silent --show-error --retry 10 --retry-connrefused --retry-delay 1 --max-time 3 http://127.0.0.1:8001/api/health >/dev/null
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3000/ >/dev/null
"@
    if ($snapshotReady -and $appChanged) {
        try { Invoke-RemoteChecked "Memulihkan CT 103 dari snapshot $timestamp" $AppNode $rollbackCmd }
        catch { $rollbackErrors += $_.Exception.Message }
    }
    if ($edgeChanged) {
        try {
            Invoke-RemoteChecked "Memulihkan konfigurasi Nginx CT 102" $EdgeNode "set -e; cp -a '$edgeSnapshot/labtnl' /etc/nginx/sites-available/labtnl; nginx -t; systemctl reload nginx; curl --fail --silent --show-error --max-time 5 http://127.0.0.1/api/health >/dev/null"
        } catch { $rollbackErrors += $_.Exception.Message }
    }
    if ($rollbackErrors.Count -gt 0) {
        throw "Rollback perlu pemeriksaan manual: $($rollbackErrors -join '; '). Snapshot: $snapshot dan $edgeSnapshot"
    }
}

try {
    $distPath = Join-Path $root "frontend\dist"
    if ($SkipFrontendBuild -and (-not (Test-Path (Join-Path $distPath "index.html")))) {
        throw "Frontend dist/index.html tidak ditemukan; build terlebih dahulu."
    }
    Invoke-RemoteChecked "Preflight CT 103: layanan, Redis, dan site aktif" $AppNode "set -e; test -f /opt/tnl/backend/.env; test -x /opt/tnl/backend/venv/bin/python; test -f /etc/systemd/system/tnl-backend.service; test -d /opt/tnl/frontend/dist; test -f /etc/nginx/sites-available/tnl-frontend; test /etc/nginx/sites-enabled/tnl-frontend -ef /etc/nginx/sites-available/tnl-frontend; test ! -e /etc/nginx/sites-enabled/nginx-ct103.conf; systemctl is-active --quiet tnl-backend nginx redis-server; redis-cli ping; nginx -t"
    if (Test-Path "$PSScriptRoot\nginx-ct102.conf") {
        Invoke-RemoteChecked "Snapshot konfigurasi Nginx CT 102" $EdgeNode "set -e; test -d /etc/nginx; test -f /etc/nginx/sites-available/labtnl; nginx -t; mkdir -p -m 0700 '$edgeSnapshot'; cp -a /etc/nginx/sites-available/labtnl '$edgeSnapshot/labtnl'"
    }
    if ($SkipBackup) {
        Write-Host "[0/6] Backup database dilewati (-SkipBackup)." -ForegroundColor DarkGray
    } else {
        Invoke-PsScriptChecked "[0/6] Backup database pra-update" (Join-Path $PSScriptRoot "backup-db.ps1")
    }

    if (-not $SkipFrontendBuild) {
        if (Test-Path "$root\frontend\node_modules") {
            Push-Location "$root\frontend"
            try {
                Invoke-LocalNativeChecked "[1/6] Building frontend production bundle" "npm" @("run", "build")
            } finally {
                Pop-Location
            }
        } else {
            Invoke-LocalNativeChecked "[1/6] Pulling built frontend bundle from docker compose" "docker" @("compose", "cp", "frontend:/usr/share/nginx/html", $distPath)
        }
    } else {
        Write-Host "[1/6] Skipping frontend build per flag." -ForegroundColor DarkGray
    }
    if (-not (Test-Path (Join-Path $distPath "index.html"))) {
        throw "Frontend dist/index.html tidak ditemukan setelah build."
    }

    $snapshotCmd = @"
set -e
umask 077
mkdir -p '$snapshot/frontend' '$snapshot/backend' '$snapshot/config'
if [ -d /opt/tnl/frontend/dist ]; then cp -a /opt/tnl/frontend/dist '$snapshot/frontend/dist'; fi
if [ -f /etc/nginx/sites-available/tnl-frontend ]; then cp -a /etc/nginx/sites-available/tnl-frontend '$snapshot/config/tnl-frontend'; fi
if [ -f /etc/nginx/sites-available/nginx-ct103.conf ]; then cp -a /etc/nginx/sites-available/nginx-ct103.conf '$snapshot/config/nginx-ct103.conf'; fi
if [ -f /etc/systemd/system/tnl-backend.service ]; then cp -a /etc/systemd/system/tnl-backend.service '$snapshot/config/tnl-backend.service'; fi
sha256sum /opt/tnl/backend/.env > '$snapshot/config/env.sha256'
"@
    if (-not $SkipBackendDeploy) {
        $snapshotCmd += @"

tar -czf '$snapshot/backend/backend-src.tar.gz' --exclude='./venv' --exclude='./.env' --exclude='./media' --exclude='./downloaded_files' --exclude='./__pycache__' --exclude='**/__pycache__' -C /opt/tnl/backend .
if test -d /opt/tnl/backend/media; then tar -czf '$snapshot/backend/media.tar.gz' -C /opt/tnl/backend media; fi
cp -a /opt/tnl/backend/venv '$snapshot/backend/venv'
"@
    }
    Invoke-RemoteChecked "[2/6] Snapshot konfigurasi & artifact CT 103 untuk rollback" $AppNode $snapshotCmd
    $snapshotReady = $true

    if (Test-Path $distPath) {
        $frontendTar = "$env:TEMP\tnl-frontend-$timestamp.tar.gz"
        # Bundle from a relative filename inside $env:TEMP: GNU tar treats a colon in
        # "-f E:\..." as a remote host spec, and $env:TEMP can be on any drive.
        Push-Location $env:TEMP
        try {
            Invoke-LocalNativeChecked "[3/6] Packaging frontend dist" "tar" @("-czf", "tnl-frontend-$timestamp.tar.gz", "-C", ($distPath -replace '\\', '/'), ".")
        } finally {
            Pop-Location
        }
        Invoke-ScpChecked "[3/6] Upload frontend dist" $frontendTar "root@${AppNode}:/tmp/frontend-dist.tar.gz"
        $appChanged = $true
        Invoke-RemoteChecked "[3/6] Extract frontend dist" $AppNode "set -e; mkdir -p /opt/tnl/frontend/dist && tar -xzf /tmp/frontend-dist.tar.gz --no-same-owner --no-same-permissions -C /opt/tnl/frontend/dist && rm -f /tmp/frontend-dist.tar.gz"
        Remove-Item $frontendTar -Force -ErrorAction SilentlyContinue
    } else {
        Write-Host "[3/6] No frontend dist found at $distPath, skipping frontend copy." -ForegroundColor Yellow
    }

    if (-not $SkipBackendDeploy) {
        $backendTar = "$env:TEMP\tnl-backend-$timestamp.tar.gz"
        Push-Location $env:TEMP
        try {
            Invoke-LocalNativeChecked "[3/6] Packaging backend source" "tar" @("-czf", "tnl-backend-$timestamp.tar.gz", "-C", (($root + "\backend") -replace '\\', '/'), "--exclude=__pycache__", "--exclude=*.pyc", "--exclude=.pytest_cache", "--exclude=.mypy_cache", "--exclude=.ruff_cache", "--exclude=.pytest-ci-final.log", "--exclude=.tmp-media-ci", "--exclude=.env", "--exclude=.upload_signing_secret", "--exclude=.mailer_key", "--exclude=./venv", "--exclude=./media", "--exclude=./downloaded_files", ".")
        } finally {
            Pop-Location
        }
        Invoke-ScpChecked "[3/6] Upload backend source" $backendTar "root@${AppNode}:/tmp/backend-src.tar.gz"
        $appChanged = $true
        Invoke-RemoteChecked "[3/6] Stop backend & extract source" $AppNode "set -e; systemctl stop tnl-backend; tar -xzf /tmp/backend-src.tar.gz --no-same-owner --no-same-permissions -C /opt/tnl/backend; rm -f /tmp/backend-src.tar.gz"
        Remove-Item $backendTar -Force -ErrorAction SilentlyContinue
    } else {
        Write-Host "[3/6] Skipping backend source update per flag." -ForegroundColor DarkGray
    }

    $configs = @(
        @{ Source = (Join-Path $PSScriptRoot "nginx-ct103.conf"); Remote = "/tmp/nginx-ct103.conf"; Install = "install -m 0644 /tmp/nginx-ct103.conf /etc/nginx/sites-available/nginx-ct103.conf" },
        @{ Source = (Join-Path $PSScriptRoot "tnl-frontend-nginx.conf"); Remote = "/tmp/tnl-frontend-nginx.conf"; Install = "install -m 0644 /tmp/tnl-frontend-nginx.conf /etc/nginx/sites-available/tnl-frontend" }
    )
    if (-not $SkipBackendDeploy) {
        $configs += @{ Source = (Join-Path $PSScriptRoot "tnl-backend.service"); Remote = "/tmp/tnl-backend.service"; Install = "install -m 0644 /tmp/tnl-backend.service /etc/systemd/system/tnl-backend.service && systemctl daemon-reload" }
    }
    foreach ($cfg in $configs) {
        if (Test-Path $cfg.Source) {
            Invoke-ScpChecked "[4/6] Upload $($cfg.Source)" $cfg.Source "root@${AppNode}:$($cfg.Remote)"
            $appChanged = $true
            Invoke-RemoteChecked "[4/6] Install $($cfg.Source)" $AppNode $cfg.Install
        }
    }
    if (-not (Test-Path (Join-Path $PSScriptRoot "tnl-frontend-nginx.conf"))) {
        Invoke-RemoteChecked "[4/6] Install fallback SEO frontend site" $AppNode "install -m 0644 /tmp/nginx-ct103.conf /etc/nginx/sites-available/tnl-frontend"
    }
    if (-not $SkipBackendDeploy) {
        Invoke-RemoteChecked "[4/6] Install lock, migrate identity keys & restart backend" $AppNode "set -e; /opt/tnl/backend/venv/bin/python -m pip install --quiet --require-hashes -r /opt/tnl/backend/requirements.txt; /opt/tnl/backend/venv/bin/python -m pip check; cd /opt/tnl/backend; /opt/tnl/backend/venv/bin/python -m lib.registration_integrity --apply; systemctl restart tnl-backend; curl --fail --silent --show-error --retry 20 --retry-connrefused --retry-delay 1 --max-time 3 http://127.0.0.1:8001/api/health >/dev/null"
    }
    Invoke-RemoteChecked "[4/6] Validate & reload Nginx CT 103" $AppNode "nginx -t && systemctl reload nginx"

    if (Test-Path "$PSScriptRoot\nginx-ct102.conf") {
        $edgeChanged = $true
        Invoke-ScpChecked "[5/6] Upload Nginx config CT 102" "$PSScriptRoot\nginx-ct102.conf" "root@${EdgeNode}:/etc/nginx/sites-available/labtnl"
        Invoke-RemoteChecked "[5/6] Validate & reload Nginx CT 102" $EdgeNode "nginx -t && systemctl reload nginx"
    }

    Invoke-PsScriptChecked "[6/6] Post-deploy health check" (Join-Path $PSScriptRoot "health-check.ps1")
    Invoke-RemoteChecked "[6/6] Verify production environment unchanged" $AppNode "sha256sum --status -c '$snapshot/config/env.sha256'"

    Write-Host "`n==========================================================" -ForegroundColor Green
    Write-Host "   Deployment successfully executed to Proxmox LXC!       " -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "Rollback snapshots: CT 103 $snapshot; CT 102 $edgeSnapshot"
} catch {
    $deploymentError = $_.Exception.Message
    try { Invoke-Rollback -Reason $deploymentError }
    catch { Write-Warning $_.Exception.Message }
    Write-Error "Deployment GAGAL: $deploymentError"
    exit 1
}
