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
$ct102Backup = Join-Path $env:TEMP "tnl-ct102-labtnl-$timestamp.conf"

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
    ssh "root@$Node" $RemoteCommand
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
    Write-Host "  2. Snapshot remote (frontend, backend source, configs) ke $snapshot"
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
    $rollbackCmd = @"
set +e
if [ -d '$snapshot/frontend/dist' ]; then rm -rf /opt/tnl/frontend/dist && cp -a '$snapshot/frontend/dist' /opt/tnl/frontend/dist; fi
if [ -f '$snapshot/backend/backend-src.tar.gz' ]; then tar -xzf '$snapshot/backend/backend-src.tar.gz' --no-same-owner --no-same-permissions -C /opt/tnl/backend; fi
if [ -f '$snapshot/config/tnl-frontend' ]; then cp -a '$snapshot/config/tnl-frontend' /etc/nginx/sites-available/tnl-frontend; fi
if [ -f '$snapshot/config/nginx-ct103.conf' ]; then cp -a '$snapshot/config/nginx-ct103.conf' /etc/nginx/sites-available/nginx-ct103.conf; fi
if [ -f '$snapshot/config/tnl-backend.service' ]; then cp -a '$snapshot/config/tnl-backend.service' /etc/systemd/system/tnl-backend.service; systemctl daemon-reload; fi
systemctl restart tnl-backend
nginx -t && systemctl reload nginx
"@
    try { Invoke-RemoteChecked "Memulihkan CT 103 dari snapshot $timestamp" $AppNode $rollbackCmd }
    catch { Write-Host "[ROLLBACK WARNING] $($_.Exception.Message)" -ForegroundColor Yellow }
    if (Test-Path $ct102Backup) {
        try {
            Invoke-ScpChecked "Memulihkan konfigurasi Nginx CT 102" $ct102Backup "root@${EdgeNode}:/etc/nginx/sites-available/labtnl"
            Invoke-RemoteChecked "Memuat ulang Nginx CT 102" $EdgeNode "nginx -t && systemctl reload nginx"
        } catch { Write-Host "[ROLLBACK WARNING] $($_.Exception.Message)" -ForegroundColor Yellow }
    } else {
        Write-Host "[ROLLBACK WARNING] Tidak ada snapshot config CT 102; periksa manual." -ForegroundColor Yellow
    }
}

try {
    if ($SkipBackup) {
        Write-Host "[0/6] Backup database dilewati (-SkipBackup)." -ForegroundColor DarkGray
    } else {
        Invoke-PsScriptChecked "[0/6] Backup database pra-update" (Join-Path $PSScriptRoot "backup-db.ps1")
    }

    $distPath = Join-Path $root "frontend\dist"
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

    $snapshotCmd = @"
set -e
mkdir -p '$snapshot/frontend' '$snapshot/backend' '$snapshot/config'
if [ -d /opt/tnl/frontend/dist ]; then cp -a /opt/tnl/frontend/dist '$snapshot/frontend/dist'; fi
if [ -d /opt/tnl/backend ]; then tar -czf '$snapshot/backend/backend-src.tar.gz' --exclude='./venv' --exclude='./.env' -C /opt/tnl/backend .; fi
if [ -f /etc/nginx/sites-available/tnl-frontend ]; then cp -a /etc/nginx/sites-available/tnl-frontend '$snapshot/config/tnl-frontend'; fi
if [ -f /etc/nginx/sites-available/nginx-ct103.conf ]; then cp -a /etc/nginx/sites-available/nginx-ct103.conf '$snapshot/config/nginx-ct103.conf'; fi
if [ -f /etc/systemd/system/tnl-backend.service ]; then cp -a /etc/systemd/system/tnl-backend.service '$snapshot/config/tnl-backend.service'; fi
"@
    Invoke-RemoteChecked "[2/6] Snapshot konfigurasi & artifact CT 103 untuk rollback" $AppNode $snapshotCmd

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
        Invoke-RemoteChecked "[3/6] Extract frontend dist" $AppNode "set -e; mkdir -p /opt/tnl/frontend/dist && tar -xzf /tmp/frontend-dist.tar.gz --no-same-owner --no-same-permissions -C /opt/tnl/frontend/dist && rm -f /tmp/frontend-dist.tar.gz"
        Remove-Item $frontendTar -Force -ErrorAction SilentlyContinue
    } else {
        Write-Host "[3/6] No frontend dist found at $distPath, skipping frontend copy." -ForegroundColor Yellow
    }

    if (-not $SkipBackendDeploy) {
        $backendTar = "$env:TEMP\tnl-backend-$timestamp.tar.gz"
        Push-Location $env:TEMP
        try {
            Invoke-LocalNativeChecked "[3/6] Packaging backend source" "tar" @("-czf", "tnl-backend-$timestamp.tar.gz", "-C", (($root + "\backend") -replace '\\', '/'), "--exclude=__pycache__", "--exclude=*.pyc", "--exclude=.pytest_cache", "--exclude=.env", ".")
        } finally {
            Pop-Location
        }
        Invoke-ScpChecked "[3/6] Upload backend source" $backendTar "root@${AppNode}:/tmp/backend-src.tar.gz"
        Invoke-RemoteChecked "[3/6] Extract backend source" $AppNode "set -e; tar -xzf /tmp/backend-src.tar.gz --no-same-owner --no-same-permissions -C /opt/tnl/backend && rm -f /tmp/backend-src.tar.gz"
        Remove-Item $backendTar -Force -ErrorAction SilentlyContinue
    } else {
        Write-Host "[3/6] Skipping backend source update per flag." -ForegroundColor DarkGray
    }

    $configs = @(
        @{ Source = (Join-Path $PSScriptRoot "nginx-ct103.conf"); Remote = "/tmp/nginx-ct103.conf"; Install = "install -m 0644 /tmp/nginx-ct103.conf /etc/nginx/sites-available/nginx-ct103.conf" },
        @{ Source = (Join-Path $PSScriptRoot "tnl-backend.service"); Remote = "/tmp/tnl-backend.service"; Install = "install -m 0644 /tmp/tnl-backend.service /etc/systemd/system/tnl-backend.service && systemctl daemon-reload" },
        @{ Source = (Join-Path $PSScriptRoot "tnl-frontend-nginx.conf"); Remote = "/tmp/tnl-frontend-nginx.conf"; Install = "install -m 0644 /tmp/tnl-frontend-nginx.conf /etc/nginx/sites-available/tnl-frontend" }
    )
    foreach ($cfg in $configs) {
        if (Test-Path $cfg.Source) {
            Invoke-ScpChecked "[4/6] Upload $($cfg.Source)" $cfg.Source "root@${AppNode}:$($cfg.Remote)"
            Invoke-RemoteChecked "[4/6] Install $($cfg.Source)" $AppNode $cfg.Install
        }
    }
    if (-not (Test-Path (Join-Path $PSScriptRoot "tnl-frontend-nginx.conf"))) {
        Invoke-RemoteChecked "[4/6] Install fallback SEO frontend site" $AppNode "install -m 0644 /tmp/nginx-ct103.conf /etc/nginx/sites-available/tnl-frontend"
    }
    if (-not $SkipBackendDeploy) {
        Invoke-RemoteChecked "[4/6] Update dependencies & restart backend" $AppNode "/opt/tnl/backend/venv/bin/pip install --quiet -r /opt/tnl/backend/requirements.txt && systemctl restart tnl-backend"
    }
    Invoke-RemoteChecked "[4/6] Validate & reload Nginx CT 103" $AppNode "nginx -t && systemctl reload nginx"
    Start-Sleep -Seconds 3

    if (Test-Path "$PSScriptRoot\nginx-ct102.conf") {
        Invoke-ScpChecked "[5/6] Snapshot konfigurasi Nginx CT 102" "root@${EdgeNode}:/etc/nginx/sites-available/labtnl" $ct102Backup
        Invoke-ScpChecked "[5/6] Upload Nginx config CT 102" "$PSScriptRoot\nginx-ct102.conf" "root@${EdgeNode}:/etc/nginx/sites-available/labtnl"
        Invoke-RemoteChecked "[5/6] Validate & reload Nginx CT 102" $EdgeNode "nginx -t && systemctl reload nginx"
    }

    Invoke-PsScriptChecked "[6/6] Post-deploy health check" (Join-Path $PSScriptRoot "health-check.ps1")

    Write-Host "`n==========================================================" -ForegroundColor Green
    Write-Host "   Deployment successfully executed to Proxmox LXC!       " -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
} catch {
    Invoke-Rollback -Reason $_.Exception.Message
    Write-Error "Deployment GAGAL: $($_.Exception.Message)"
    exit 1
}
