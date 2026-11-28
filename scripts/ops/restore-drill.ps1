param (
    [Parameter(Mandatory = $true)]
    [string]$DatabaseArchive,
    [Parameter(Mandatory = $true)]
    [string]$MediaArchive,
    [string]$MongoImage = "mongo:7@sha256:41e8195b2791692695e1dc9bd21cd51d0a3af05fff8ace9304a5c1acf94f1ae1"
)

$ErrorActionPreference = "Stop"
$dbPath = (Resolve-Path -LiteralPath $DatabaseArchive -ErrorAction Stop).Path
$mediaPath = (Resolve-Path -LiteralPath $MediaArchive -ErrorAction Stop).Path
if (-not (Get-Command docker.exe -ErrorAction SilentlyContinue)) {
    throw "Docker is required for the isolated database restore drill."
}
if (-not (Get-Command python.exe -ErrorAction SilentlyContinue)) {
    throw "Python is required to validate and extract media into a temporary directory."
}

$archiveCheck = @'
import pathlib, re, sys, tarfile
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
& python.exe -c $archiveCheck $mediaPath 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Media archive validation failed; no extraction was performed."
}

$gzipCheck = @'
import gzip
import sys

seen = False
with gzip.open(sys.argv[1], 'rb') as archive:
    while archive.read(1024 * 1024):
        seen = True
if not seen:
    raise SystemExit(2)
'@
& python.exe -c $gzipCheck $dbPath 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Database archive gzip validation failed; no restore was performed."
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("tnl-restore-drill-" + [guid]::NewGuid().ToString("N"))
$mediaOutput = Join-Path $tempRoot "media"
$containerName = "tnl-restore-drill-" + [guid]::NewGuid().ToString("N")
$restoreDb = "tnl_restore_drill_" + [guid]::NewGuid().ToString("N")
$started = $false
try {
    New-Item -ItemType Directory -Path $mediaOutput -Force | Out-Null
    $extractCheck = @'
import pathlib, sys, tarfile
root = pathlib.Path(sys.argv[2]).resolve()
with tarfile.open(sys.argv[1], 'r:gz') as archive:
    members = archive.getmembers()
    for member in members:
        path = pathlib.PurePosixPath(member.name)
        if path.is_absolute() or '..' in path.parts or '\\' in member.name or ':' in member.name:
            raise SystemExit(3)
        target = (root / pathlib.Path(*path.parts)).resolve()
        if root not in target.parents and target != root:
            raise SystemExit(3)
        if not (member.isdir() or member.isfile()):
            raise SystemExit(4)
    archive.extractall(root, members=members)
print(len(members))
'@
    $extractResult = & python.exe -c $extractCheck $mediaPath $mediaOutput 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Media restore into the temporary drill directory failed."
    }
    $mediaEntries = [int]($extractResult | Select-Object -Last 1)

    & docker.exe run --detach --rm --name $containerName --network none --tmpfs "/data/db:rw,noexec,nosuid,size=1g" --mount "type=bind,source=$dbPath,target=/tmp/backup.archive.gz,readonly" $MongoImage --bind_ip 127.0.0.1 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Could not start the isolated MongoDB container."
    }
    $started = $true

    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        & docker.exe exec $containerName mongosh --quiet --eval "db.adminCommand({ping:1}).ok" 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $ready = $true
            break
        }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) {
        throw "The isolated MongoDB container did not become ready."
    }

    & docker.exe exec $containerName mongorestore --gzip --archive=/tmp/backup.archive.gz --nsFrom="tnl.*" --nsTo="$restoreDb.*" --stopOnError 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "mongorestore failed in the isolated container."
    }

    $verifyScript = "const d=db.getSiblingDB('$restoreDb'); const names=d.getCollectionNames().filter(n=>!n.startsWith('system.')); let count=0; for (const n of names) count += d.getCollection(n).countDocuments({}); print(names.length + ' ' + count); if(names.length===0) quit(2);"
    $summary = & docker.exe exec $containerName mongosh --quiet --eval $verifyScript 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "The restored database did not pass the isolated collection check."
    }
    $parts = [regex]::Match([string]$summary[-1], '^([0-9]+) ([0-9]+)$')
    if (-not $parts.Success) {
        throw "The isolated restore returned invalid verification metadata."
    }

    Write-Host "Isolated restore drill passed: collections=$($parts.Groups[1].Value), documents=$($parts.Groups[2].Value), media archive entries=$mediaEntries."
    Write-Host "MongoDB ran with --network none and tmpfs data; no production host or database was contacted."
}
finally {
    if ($started) {
        & docker.exe stop $containerName 2>$null | Out-Null
    }
    if (Test-Path -LiteralPath $tempRoot -PathType Container) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}
