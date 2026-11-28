param (
    [ValidateSet("100.111.32.102")]
    [string]$DbNode = "100.111.32.102",
    [ValidateSet("100.65.129.8")]
    [string]$AppNode = "100.65.129.8",
    [string]$DestDir = "$PSScriptRoot\..\..\backups\offsite",
    [ValidateRange(1, 168)]
    [int]$MaxAgeHours = 30,
    [ValidateRange(3, 60)]
    [int]$ConnectTimeoutSec = 10,
    [ValidateRange(30, 1800)]
    [int]$RemoteCommandTimeoutSec = 900
)

$ErrorActionPreference = "Stop"
$phase = "preflight"
$phaseDetail = ""
$ssh = Get-Command ssh.exe -ErrorAction SilentlyContinue
$scp = Get-Command scp.exe -ErrorAction SilentlyContinue
if (-not $ssh -or -not $scp) {
    throw "OpenSSH ssh.exe and scp.exe are required."
}
if (-not (Get-Command python.exe -ErrorAction SilentlyContinue)) {
    throw "python.exe is required for local archive integrity checks."
}

$DestDir = [System.IO.Path]::GetFullPath($DestDir)
if (-not (Test-Path -LiteralPath $DestDir -PathType Container)) {
    New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
}

$sshOptions = @(
    "-o", "BatchMode=yes",
    "-o", "ConnectionAttempts=1",
    "-o", "ConnectTimeout=$ConnectTimeoutSec",
    "-o", "ServerAliveInterval=5",
    "-o", "ServerAliveCountMax=3",
    "-T"
)
$scpOptions = @(
    "-q",
    "-o", "BatchMode=yes",
    "-o", "ConnectionAttempts=1",
    "-o", "ConnectTimeout=$ConnectTimeoutSec",
    "-o", "ServerAliveInterval=5",
    "-o", "ServerAliveCountMax=3"
)
$now = [DateTimeOffset]::UtcNow
$stamp = $now.ToString("yyyyMMdd-HHmmss")
$runId = [guid]::NewGuid().ToString("N").Substring(0, 8)
$dbPartial = Join-Path $DestDir ".tnl-db-$stamp-$runId.partial"
$mediaPartial = Join-Path $DestDir ".tnl-media-$stamp-$runId.partial"
$dbLatestStage = Join-Path $DestDir ".latest-db-$stamp-$runId.partial"
$mediaLatestStage = Join-Path $DestDir ".latest-media-$stamp-$runId.partial"
$manifestStage = Join-Path $DestDir ".latest-backups-$stamp-$runId.partial"

function Get-RemoteMetadata {
    param (
        [string]$Node,
        [ValidateSet("db", "media")]
        [string]$Kind
    )

    if ($Kind -eq "db") {
        $latestPath = "/var/backups/tnl/db/latest.archive.gz"
        $pathGuard = '/var/backups/tnl/db/tnl-db-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9].archive.gz'
        $integrity = "timeout --signal=TERM --kill-after=5s ${RemoteCommandTimeoutSec}s gzip -t -- `$file"
    }
    else {
        $latestPath = "/var/backups/tnl/media/latest.tar.gz"
        $pathGuard = '/var/backups/tnl/media/tnl-media-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9].tar.gz'
        $integrity = "timeout --signal=TERM --kill-after=5s ${RemoteCommandTimeoutSec}s gzip -t -- `$file && timeout --signal=TERM --kill-after=5s ${RemoteCommandTimeoutSec}s tar -tzf `$file >/dev/null"
    }

    $remoteCommand = @'
set -eu
latest=REMOTE_PATH
resolved=$(timeout 15s readlink -f -- $latest)
case $resolved in PATH_GUARD) ;; *) exit 1 ;; esac
file=$resolved
test -s $file
INTEGRITY_COMMAND
printf '%s\n' $resolved
timeout 15s stat -c '%Y %s' $file
timeout --signal=TERM --kill-after=5s REMOTE_TIMEOUT_SECONDS sha256sum -- $file | cut -d ' ' -f 1
'@
    $remoteCommand = $remoteCommand.Replace("REMOTE_PATH", $latestPath).Replace("PATH_GUARD", $pathGuard).Replace("INTEGRITY_COMMAND", $integrity).Replace("REMOTE_TIMEOUT_SECONDS", "${RemoteCommandTimeoutSec}s")
    $remoteCommand = $remoteCommand.Replace("`r`n", "`n").Replace("`r", "`n")
    $output = & $ssh.Source @sshOptions "root@$Node" $remoteCommand 2>$null
    if ($LASTEXITCODE -ne 0 -or $output.Count -lt 3) {
        throw "Could not validate the $Kind backup on its source host."
    }

    $resolved = [string]$output[-3]
    $pathPattern = if ($Kind -eq "db") {
        '^/var/backups/tnl/db/tnl-db-[0-9]{8}-[0-9]{6}\.archive\.gz$'
    }
    else {
        '^/var/backups/tnl/media/tnl-media-[0-9]{8}-[0-9]{6}\.tar\.gz$'
    }
    $stat = [regex]::Match([string]$output[-2], '^([0-9]+) ([0-9]+)$')
    $hash = [regex]::Match([string]$output[-1], '^[a-fA-F0-9]{64}$')
    if (-not [regex]::IsMatch($resolved, $pathPattern) -or -not $stat.Success -or -not $hash.Success) {
        throw "The $Kind backup source returned invalid integrity metadata."
    }

    [pscustomobject]@{
        Node = $Node
        RemotePath = $resolved
        ModifiedUnix = [long]$stat.Groups[1].Value
        Length = [long]$stat.Groups[2].Value
        Sha256 = $hash.Value.ToLowerInvariant()
    }
}

function Assert-BackupFresh {
    param ([pscustomobject]$Metadata, [string]$Kind)

    $ageSeconds = $now.ToUnixTimeSeconds() - $Metadata.ModifiedUnix
    if ($ageSeconds -lt -300 -or $ageSeconds -gt ($MaxAgeHours * 3600)) {
        throw "The $Kind backup is outside the allowed age window ($MaxAgeHours hours)."
    }
    if ($Metadata.Length -le 0) {
        throw "The $Kind backup is empty."
    }
}

function Copy-VerifiedBackup {
    param ([pscustomobject]$Metadata, [string]$LocalPath, [string]$Kind)

    $remoteSpec = "root@$($Metadata.Node):$($Metadata.RemotePath)"
    & $scp.Source @scpOptions $remoteSpec $LocalPath 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Could not download the $Kind backup."
    }
    $item = Get-Item -LiteralPath $LocalPath -ErrorAction Stop
    if ($item.Length -ne $Metadata.Length) {
        throw "The downloaded $Kind backup size does not match the source."
    }
    $localHash = (Get-FileHash -LiteralPath $LocalPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($localHash -ne $Metadata.Sha256) {
        throw "The downloaded $Kind backup checksum does not match the source."
    }
}

function Assert-LocalArchive {
    param ([string]$Path, [ValidateSet("db", "media")][string]$Kind)

    $pythonCheck = if ($Kind -eq "db") {
@'
import gzip
import sys

seen = False
with gzip.open(sys.argv[1], 'rb') as archive:
    while archive.read(1024 * 1024):
        seen = True
if not seen:
    raise SystemExit(2)
'@
    }
    else {
@'
import pathlib
import re
import sys
import tarfile

with tarfile.open(sys.argv[1], 'r:gz') as archive:
    members = archive.getmembers()
    if not members:
        raise SystemExit(2)
    for member in members:
        path = pathlib.PurePosixPath(member.name)
        if path.is_absolute() or '..' in path.parts or '\\' in member.name or ':' in member.name or re.match(r'^[A-Za-z]:', member.name):
            raise SystemExit(3)
        if not (member.isdir() or member.isfile()):
            raise SystemExit(4)
'@
    }
    & python.exe -c $pythonCheck $Path 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        $script:phaseDetail = switch ($LASTEXITCODE) {
            2 { "empty archive" }
            3 { "unsafe archive path" }
            4 { "unsupported archive member type" }
            default { "local archive parser or decompressor rejected the archive" }
        }
        throw "The downloaded $Kind archive failed its local integrity check."
    }
}

function Move-Atomically {
    param ([string]$Source, [string]$Destination)

    if (Test-Path -LiteralPath $Destination -PathType Leaf) {
        $backupPath = "$Destination.$([guid]::NewGuid().ToString('N')).rollback"
        try {
            [System.IO.File]::Replace($Source, $Destination, $backupPath)
        }
        catch {
            if (Test-Path -LiteralPath $backupPath -PathType Leaf) {
                try {
                    $failedPath = "$Destination.$([guid]::NewGuid().ToString('N')).failed"
                    [System.IO.File]::Replace($backupPath, $Destination, $failedPath)
                    Remove-Item -LiteralPath $failedPath -Force -ErrorAction SilentlyContinue
                }
                catch {
                    $script:rollbackFailed = $true
                }
            }
            throw "Could not atomically replace a local backup copy."
        }
        return $backupPath
    }

    [System.IO.File]::Move($Source, $Destination)
    return $null
}

function Restore-PublishedCopy {
    param ([string]$Destination, [string]$BackupPath, [bool]$WasPublished)

    if (-not $WasPublished) {
        return
    }
    if ($BackupPath -and (Test-Path -LiteralPath $BackupPath -PathType Leaf)) {
        $failedPath = "$Destination.$([guid]::NewGuid().ToString('N')).failed"
        [System.IO.File]::Replace($BackupPath, $Destination, $failedPath)
        Remove-Item -LiteralPath $failedPath -Force -ErrorAction SilentlyContinue
    }
    elseif (Test-Path -LiteralPath $Destination -PathType Leaf) {
        Remove-Item -LiteralPath $Destination -Force
    }
}

$dbLatestPath = Join-Path $DestDir "latest-db.archive.gz"
$mediaLatestPath = Join-Path $DestDir "latest-media.tar.gz"
$manifestPath = Join-Path $DestDir "latest-backups.json"
$dbLatestBackup = $null
$mediaLatestBackup = $null
$manifestBackup = $null
$dbLatestPublished = $false
$mediaLatestPublished = $false
$manifestPublished = $false
$rollbackFailed = $false

try {
    $phase = "inspect-db-source"
    Write-Host "[$phase] Validating source archive metadata and gzip integrity."
    $db = Get-RemoteMetadata -Node $DbNode -Kind db

    $phase = "inspect-media-source"
    Write-Host "[$phase] Validating source archive metadata and tar integrity."
    $media = Get-RemoteMetadata -Node $AppNode -Kind media

    $phase = "validate-source-freshness"
    Write-Host "[$phase] Checking source age and non-empty archive sizes."
    Assert-BackupFresh -Metadata $db -Kind "MongoDB"
    Assert-BackupFresh -Metadata $media -Kind "media"

    $phase = "download-db"
    Write-Host "[$phase] Downloading the verified MongoDB archive."
    Copy-VerifiedBackup -Metadata $db -LocalPath $dbPartial -Kind "MongoDB"

    $phase = "download-media"
    Write-Host "[$phase] Downloading the verified media archive."
    Copy-VerifiedBackup -Metadata $media -LocalPath $mediaPartial -Kind "media"

    $phase = "validate-local-db"
    Write-Host "[$phase] Checking the downloaded MongoDB gzip stream."
    Assert-LocalArchive -Path $dbPartial -Kind db

    $phase = "validate-local-media"
    Write-Host "[$phase] Checking media paths, file types, and archive integrity."
    Assert-LocalArchive -Path $mediaPartial -Kind media

    $phase = "publish-local-copies"
    Write-Host "[$phase] Updating dated and latest workstation copies."
    $dbDated = Join-Path $DestDir "tnl-db-offsite-$stamp-$runId.archive.gz"
    $mediaDated = Join-Path $DestDir "tnl-media-offsite-$stamp-$runId.tar.gz"
    $phase = "stage-latest-db"
    Copy-Item -LiteralPath $dbPartial -Destination $dbLatestStage
    $phase = "stage-latest-media"
    Copy-Item -LiteralPath $mediaPartial -Destination $mediaLatestStage

    $phase = "publish-dated-db"
    [System.IO.File]::Move($dbPartial, $dbDated)
    $phase = "publish-dated-media"
    [System.IO.File]::Move($mediaPartial, $mediaDated)
    $phase = "publish-latest-db"
    $dbLatestBackup = Move-Atomically -Source $dbLatestStage -Destination $dbLatestPath
    $dbLatestPublished = $true
    $phase = "publish-latest-media"
    $mediaLatestBackup = Move-Atomically -Source $mediaLatestStage -Destination $mediaLatestPath
    $mediaLatestPublished = $true

    $phase = "prepare-manifest"
    $manifest = [ordered]@{
        checkedAtUtc = $now.ToString("o")
        maxAgeHours = $MaxAgeHours
        mongodb = [ordered]@{
            source = $db.Node
            lastModifiedUtc = [DateTimeOffset]::FromUnixTimeSeconds($db.ModifiedUnix).ToString("o")
            bytes = $db.Length
            sha256 = $db.Sha256
            archive = [System.IO.Path]::GetFileName($dbDated)
        }
        media = [ordered]@{
            source = $media.Node
            lastModifiedUtc = [DateTimeOffset]::FromUnixTimeSeconds($media.ModifiedUnix).ToString("o")
            bytes = $media.Length
            sha256 = $media.Sha256
            archive = [System.IO.Path]::GetFileName($mediaDated)
        }
    }
    [System.IO.File]::WriteAllText($manifestStage, ($manifest | ConvertTo-Json -Depth 5), [System.Text.UTF8Encoding]::new($false))

    $phase = "publish-manifest"
    $manifestBackup = Move-Atomically -Source $manifestStage -Destination $manifestPath
    $manifestPublished = $true

    foreach ($backupPath in @($dbLatestBackup, $mediaLatestBackup, $manifestBackup)) {
        if ($backupPath -and (Test-Path -LiteralPath $backupPath -PathType Leaf)) {
            Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue
        }
    }

    Write-Host "Verified fresh MongoDB and media backups downloaded; gzip, archive paths, sizes, and SHA-256 checks passed."
    Write-Host "Backup age limit: $MaxAgeHours hours. Manifest: latest-backups.json"
}
catch {
    $detail = if ($phaseDetail) { " ($phaseDetail)" } else { "" }
    foreach ($published in @(
        @{ Destination = $manifestPath; BackupPath = $manifestBackup; WasPublished = $manifestPublished },
        @{ Destination = $mediaLatestPath; BackupPath = $mediaLatestBackup; WasPublished = $mediaLatestPublished },
        @{ Destination = $dbLatestPath; BackupPath = $dbLatestBackup; WasPublished = $dbLatestPublished }
    )) {
        try {
            Restore-PublishedCopy -Destination $published.Destination -BackupPath $published.BackupPath -WasPublished $published.WasPublished
        }
        catch {
            $rollbackFailed = $true
        }
    }
    $rollbackStatus = if ($rollbackFailed) { " Rollback could not be fully confirmed." } else { " Previous latest copies were preserved or restored." }
    Write-Host "FAILED[$phase]$detail Backup synchronization failed closed; source diagnostics and archive contents were withheld.$rollbackStatus"
    exit 1
}
finally {
    foreach ($path in @($dbPartial, $mediaPartial, $dbLatestStage, $mediaLatestStage, $manifestStage)) {
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
        }
    }
}
