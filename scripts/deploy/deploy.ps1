# Automated Deployment Tool from Windows to CT 103 (labtnl-app) via Tailscale
param (
    [string]$AppNode = "100.65.129.8",
    [switch]$SkipFrontendBuild = $false,
    [switch]$SkipBackendDeploy = $false
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "    TNL Studio Automated Deployment over Tailscale        " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Target Host: $AppNode"
Write-Host "Workspace:   $root`n"

# 1. Frontend Build
$distPath = Join-Path $root "frontend\dist"
if (-not $SkipFrontendBuild) {
    Write-Host "[1/5] Building frontend production bundle..." -ForegroundColor Yellow
    if (Test-Path "$root\frontend\node_modules") {
        Push-Location "$root\frontend"
        try {
            npm run build
            if ($LASTEXITCODE -ne 0) { throw "Frontend build failed with exit code $LASTEXITCODE" }
        } finally {
            Pop-Location
        }
    } else {
        Write-Host "Local node_modules not present, pulling build from docker compose..." -ForegroundColor DarkGray
        docker compose cp frontend:/usr/share/nginx/html "$distPath"
    }
} else {
    Write-Host "[1/5] Skipping frontend build per flag." -ForegroundColor DarkGray
}

# 2. Package Frontend Dist
if (Test-Path $distPath) {
    Write-Host "[2/5] Packaging and deploying frontend dist..." -ForegroundColor Yellow
    $frontendTar = "$env:TEMP\tnl-frontend-$timestamp.tar.gz"
    # NOTE: bundle from a relative filename inside $env:TEMP. GNU tar reads a colon in
    # "-f E:\..." as a remote host spec ("Cannot connect to E: resolve failed"), and
    # $env:TEMP can sit on any drive, so never hand tar a drive-lettered archive path.
    Push-Location $env:TEMP
    try {
        tar -czf "tnl-frontend-$timestamp.tar.gz" -C ($distPath -replace '\\', '/') .
        if ($LASTEXITCODE -ne 0) { throw "tar failed to package frontend dist (exit $LASTEXITCODE)" }
    } finally {
        Pop-Location
    }
    scp "$frontendTar" "root@${AppNode}:/tmp/frontend-dist.tar.gz"
    if ($LASTEXITCODE -ne 0) { throw "scp of frontend dist to CT 103 failed (exit $LASTEXITCODE)" }
    ssh root@$AppNode "mkdir -p /opt/tnl/frontend/dist && tar -xzf /tmp/frontend-dist.tar.gz --no-same-owner --no-same-permissions -C /opt/tnl/frontend/dist && rm -f /tmp/frontend-dist.tar.gz"
    if ($LASTEXITCODE -ne 0) { throw "frontend dist extraction on CT 103 failed (exit $LASTEXITCODE)" }
    Remove-Item "$frontendTar" -Force -ErrorAction SilentlyContinue
} else {
    Write-Host "[2/5] No frontend dist found at $distPath, skipping frontend copy." -ForegroundColor Yellow
}

# 3. Package & Deploy Backend
if (-not $SkipBackendDeploy) {
    Write-Host "[3/5] Packaging and deploying backend source..." -ForegroundColor Yellow
    $backendTar = "$env:TEMP\tnl-backend-$timestamp.tar.gz"
    Push-Location $env:TEMP
    try {
        tar -czf "tnl-backend-$timestamp.tar.gz" -C (($root + "\backend") -replace '\\', '/') --exclude="__pycache__" --exclude="*.pyc" --exclude=".pytest_cache" --exclude=".env" .
        if ($LASTEXITCODE -ne 0) { throw "tar failed to package backend source (exit $LASTEXITCODE)" }
    } finally {
        Pop-Location
    }
    scp "$backendTar" "root@${AppNode}:/tmp/backend-src.tar.gz"
    if ($LASTEXITCODE -ne 0) { throw "scp of backend source to CT 103 failed (exit $LASTEXITCODE)" }
    ssh root@$AppNode "tar -xzf /tmp/backend-src.tar.gz --no-same-owner --no-same-permissions -C /opt/tnl/backend && rm -f /tmp/backend-src.tar.gz"
    if ($LASTEXITCODE -ne 0) { throw "backend source extraction on CT 103 failed (exit $LASTEXITCODE)" }
    Remove-Item "$backendTar" -Force -ErrorAction SilentlyContinue

    Write-Host "[4/5] Updating python dependencies & reloading services..." -ForegroundColor Yellow
    ssh root@$AppNode "/opt/tnl/backend/venv/bin/pip install --quiet -r /opt/tnl/backend/requirements.txt && systemctl restart tnl-backend && systemctl reload nginx"
    if ($LASTEXITCODE -ne 0) { throw "backend dependency install / service reload on CT 103 failed (exit $LASTEXITCODE)" }
    Start-Sleep -Seconds 3
} else {
    Write-Host "[3/5 & 4/5] Skipping backend deploy per flag. Reloading Nginx on CT 103..." -ForegroundColor DarkGray
    ssh root@$AppNode "systemctl reload nginx"
}

# 4b. Sync CT 102 Edge Nginx Config
if (Test-Path "$PSScriptRoot\nginx-ct102.conf") {
    Write-Host "Syncing Nginx configuration to CT 102 (Web Edge)..." -ForegroundColor Yellow
    scp "$PSScriptRoot\nginx-ct102.conf" "root@100.102.105.77:/etc/nginx/sites-available/labtnl"
    if ($LASTEXITCODE -ne 0) { throw "scp of nginx config to CT 102 failed (exit $LASTEXITCODE)" }
    ssh root@100.102.105.77 "nginx -t && systemctl reload nginx"
    if ($LASTEXITCODE -ne 0) { throw "nginx reload on CT 102 failed (exit $LASTEXITCODE)" }
}

# 5. Post-deploy Health Check
Write-Host "`n[5/5] Running post-deploy verification..." -ForegroundColor Yellow
& "$PSScriptRoot\health-check.ps1"

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "   Deployment successfully executed to Proxmox LXC!       " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
