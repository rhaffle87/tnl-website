# Sync assistant LinkedIn URLs from docs/members-linkedin-template.json to MongoDB CT 116
[CmdletBinding()]
param (
    [string]$TemplatePath = "",
    [string]$TargetHost = "100.111.32.102"
)

$ErrorActionPreference = "Stop"

if (-not $TemplatePath) {
    $TemplatePath = Join-Path $PSScriptRoot "..\docs\members-linkedin-template.json"
}

$TemplatePath = [System.IO.Path]::GetFullPath($TemplatePath)

if (-not (Test-Path $TemplatePath)) {
    Write-Error "Template file not found at: $TemplatePath"
    exit 1
}

$raw = Get-Content -Raw -Path $TemplatePath -Encoding UTF8
$entries = $raw | ConvertFrom-Json

$toUpdate = @($entries | Where-Object { $_.linkedin -and $_.linkedin.Trim() -ne "" })

if ($toUpdate.Count -eq 0) {
    Write-Host "[INFO] No LinkedIn URLs populated in $TemplatePath yet." -ForegroundColor Yellow
    Write-Host "Populate the 'linkedin' field (e.g. 'https://linkedin.com/in/username') for any assistant and re-run this script."
    exit 0
}

Write-Host "Found $($toUpdate.Count) assistant(s) with LinkedIn URLs to sync." -ForegroundColor Cyan

# Build mongosh updates
$jsLines = @("const updates = " + ($toUpdate | ConvertTo-Json -Compress) + ";")
$jsLines += @'
let count = 0;
for (const item of updates) {
  const url = item.linkedin.trim();
  const res = db.members.updateOne(
    { name: item.name },
    { $set: { "social.linkedin": url } }
  );
  if (res.matchedCount > 0) {
    print(`[UPDATED] ${item.name} -> ${url}`);
    count++;
  } else {
    print(`[NOT FOUND] ${item.name}`);
  }
}
print(`\nTotal updated: ${count} of ${updates.length}`);
'@

$tempJs = [System.IO.Path]::GetTempFileName() + ".js"
$jsLines -join "`n" | Out-File -FilePath $tempJs -Encoding utf8

try {
    Write-Host "Applying updates to MongoDB CT 116 ($TargetHost)..." -ForegroundColor Cyan
    scp $tempJs "root@${TargetHost}:/tmp/sync-linkedin-temp.js"
    ssh "root@${TargetHost}" "mongosh tnl /tmp/sync-linkedin-temp.js --quiet"
    ssh "root@${TargetHost}" "rm -f /tmp/sync-linkedin-temp.js"
    Write-Host "Sync completed successfully." -ForegroundColor Green
} finally {
    Remove-Item -Force $tempJs -ErrorAction SilentlyContinue
}
