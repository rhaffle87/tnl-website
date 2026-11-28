# Automated Database Backup Tool for CT 116 (labtnl-db) via Tailscale
param (
    [string]$DbNode = "100.111.32.102",
    [string]$Database = "tnl",
    [string]$OutputDir = "$PSScriptRoot\..\..\backups\db"
)

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$remoteArchive = "/tmp/${Database}-backup-${timestamp}.archive"
$localDir = [System.IO.Path]::GetFullPath($OutputDir)
if (-not (Test-Path $localDir)) {
    New-Item -ItemType Directory -Path $localDir -Force | Out-Null
}
$localArchive = Join-Path $localDir "${Database}-backup-${timestamp}.archive"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "      TNL MongoDB Remote Backup via Tailscale             " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Target Host: $DbNode"
Write-Host "Database:    $Database"
Write-Host "Destination: $localArchive`n"

Write-Host "[1/3] Executing mongodump on CT 116..." -ForegroundColor Yellow
$dumpCmd = "mongodump --db $Database --archive=$remoteArchive"
$sshResult = ssh root@$DbNode "$dumpCmd"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Remote mongodump failed: $sshResult" -ForegroundColor Red
    exit 1
}

Write-Host "[2/3] Transferring archive over Tailscale..." -ForegroundColor Yellow
scp "root@${DbNode}:${remoteArchive}" "$localArchive"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to download archive over SCP." -ForegroundColor Red
    exit 1
}

Write-Host "[3/3] Cleaning up temporary remote archive..." -ForegroundColor Yellow
ssh root@$DbNode "rm -f $remoteArchive"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARN] Remote temporary archive cleanup failed (exit $LASTEXITCODE)." -ForegroundColor Yellow
}

$fileInfo = Get-Item $localArchive
Write-Host "`n[SUCCESS] Backup completed successfully!" -ForegroundColor Green
Write-Host "File size: $([math]::Round($fileInfo.Length / 1KB, 2)) KB"
Write-Host "Local file: $localArchive"
# Catatan: dump ad-hoc ini menggunakan ekstensi .archive (tanpa gzip).
# Backup terjadwal di server menggunakan .archive.gz (gzip); lihat runbook backup.
exit 0
