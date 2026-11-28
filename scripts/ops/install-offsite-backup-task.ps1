param (
    [string]$TaskName = "TNL Verified Offsite Backup Pull",
    [datetime]$At = (Get-Date).Date.AddHours(5),
    [switch]$Execute
)

$ErrorActionPreference = "Stop"
$pullScript = Join-Path $PSScriptRoot "pull-latest-backups.ps1"
if (-not (Test-Path -LiteralPath $pullScript -PathType Leaf)) {
    throw "The verified backup pull script is missing."
}

if (-not $Execute) {
    Write-Host "Plan only: register a daily, interactive-user task at $($At.ToString('HH:mm'))."
    Write-Host "It runs only while the current Windows user is logged on; no password or SSH key is copied."
    Write-Host "Run this installer with -Execute after validating Tailscale, SSH and the backup destination."
    exit 0
}

$powerShell = Join-Path $PSHOME "powershell.exe"
$arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$pullScript`""
$action = New-ScheduledTaskAction -Execute $powerShell -Argument $arguments
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Verifies source freshness, SHA-256, gzip and archive paths before updating local offsite backup copies." -Force | Out-Null
Write-Host "Registered daily backup verification task for the current interactive user at $($At.ToString('HH:mm'))."
