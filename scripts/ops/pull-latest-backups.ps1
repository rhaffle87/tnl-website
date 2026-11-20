# scripts/ops/pull-latest-backups.ps1
# Off-Site Backup Sync Tool for TNL Website
# Pulls latest verified database and media archives from Proxmox cluster to local storage

param (
    [string]$DbNode = "100.111.32.102",
    [string]$AppNode = "100.65.129.8",
    [string]$DestDir = "$PSScriptRoot\..\..\backups\offsite"
)

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "    TNL Off-Site Backup Downloader (Tailscale Cluster)    " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "DB Node:     $DbNode"
Write-Host "App Node:    $AppNode"
Write-Host "Destination: $DestDir`n"

if (-not (Test-Path $DestDir)) {
    New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
}

# 1. Download Latest Database Archive from CT 116
Write-Host "[1/2] Pulling latest MongoDB archive from CT 116..." -ForegroundColor Yellow
$targetDbFile = Join-Path $DestDir "tnl-db-offsite-$timestamp.archive.gz"
$latestDbFile = Join-Path $DestDir "latest-db.archive.gz"

scp "root@${DbNode}:/var/backups/tnl/db/latest.archive.gz" "$targetDbFile"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to download DB backup from CT 116!" -ForegroundColor Red
    exit 1
}
Copy-Item "$targetDbFile" "$latestDbFile" -Force

$dbSize = (Get-Item "$targetDbFile").Length
Write-Host "[SUCCESS] DB archive pulled: $([math]::Round($dbSize / 1KB, 2)) KB -> $targetDbFile" -ForegroundColor Green

# 2. Download Latest Media Archive from CT 103
Write-Host "`n[2/2] Pulling latest Media archive from CT 103..." -ForegroundColor Yellow
$targetMediaFile = Join-Path $DestDir "tnl-media-offsite-$timestamp.tar.gz"
$latestMediaFile = Join-Path $DestDir "latest-media.tar.gz"

scp "root@${AppNode}:/var/backups/tnl/media/latest.tar.gz" "$targetMediaFile"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to download media backup from CT 103!" -ForegroundColor Red
    exit 1
}
Copy-Item "$targetMediaFile" "$latestMediaFile" -Force

$mediaSize = (Get-Item "$targetMediaFile").Length
Write-Host "[SUCCESS] Media archive pulled: $([math]::Round($mediaSize / 1KB, 2)) KB -> $targetMediaFile" -ForegroundColor Green

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "  Off-Site backup synchronization completed successfully! " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
