# Automatically configures Cloudflare DNS and SSL/TLS once labtnl.site is registered in Cloudflare
param (
    [string]$Domain = "labtnl.site",
    [string]$TunnelId = "53798da4-8b22-49e3-893b-0a85053942fc",
    [string]$Token = $env:CLOUDFLARE_API_TOKEN
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Cloudflare Zone & Tunnel DNS Automation for $Domain     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Fetch Zone ID
Write-Host "[1/4] Looking up zone '$Domain' in Cloudflare..." -ForegroundColor Yellow
$zoneResp = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones?name=$Domain" -Headers @{ Authorization = "Bearer $Token" }

if (-not $zoneResp.result -or $zoneResp.result.Count -eq 0) {
    Write-Host "[WARN] Zone '$Domain' was not found in your Cloudflare account." -ForegroundColor Red
    Write-Host "Please add '$Domain' (Free Plan) at https://dash.cloudflare.com first." -ForegroundColor Yellow
    exit 1
}

$zone = $zoneResp.result[0]
$zoneId = $zone.id
Write-Host "Found Zone ID: $zoneId (Status: $($zone.status))" -ForegroundColor Green
Write-Host "Assigned Nameservers: $($zone.name_servers -join ', ')" -ForegroundColor Cyan

# 2. Configure SSL/TLS & Always Use HTTPS
Write-Host "`n[2/4] Setting SSL/TLS to Full & Always Use HTTPS..." -ForegroundColor Yellow
try {
    # Set SSL mode to full
    $sslBody = @{ value = "full" } | ConvertTo-Json
    Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/settings/ssl" -Method Patch -Headers @{ Authorization = "Bearer $Token"; "Content-Type" = "application/json" } -Body $sslBody | Out-Null
    Write-Host " - SSL Mode: Full (Active)" -ForegroundColor Green
} catch {
    Write-Host " - SSL Mode error: $($_.Exception.Message)" -ForegroundColor DarkGray
}

try {
    # Set Always Use HTTPS
    $httpsBody = @{ value = "on" } | ConvertTo-Json
    Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/settings/always_use_https" -Method Patch -Headers @{ Authorization = "Bearer $Token"; "Content-Type" = "application/json" } -Body $httpsBody | Out-Null
    Write-Host " - Always Use HTTPS: ON" -ForegroundColor Green
} catch {
    Write-Host " - Always Use HTTPS error: $($_.Exception.Message)" -ForegroundColor DarkGray
}

# 3. Create CNAME DNS Records
Write-Host "`n[3/4] Configuring DNS Records pointing to Cloudflare Tunnel..." -ForegroundColor Yellow
$tunnelTarget = "$TunnelId.cfargotunnel.com"
$subdomains = @(
    @{ Name = "@"; Full = $Domain },
    @{ Name = "www"; Full = "www.$Domain" },
    @{ Name = "grafana"; Full = "grafana.$Domain" }
)

# Fetch existing DNS records to prevent duplicates
$existingRecords = (Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records" -Headers @{ Authorization = "Bearer $Token" }).result

foreach ($sub in $subdomains) {
    $existing = $existingRecords | Where-Object { $_.name -eq $sub.Full }
    if ($existing) {
        Write-Host " - Record '$($sub.Full)' already exists (ID: $($existing.id)). Updating target to $tunnelTarget..." -ForegroundColor DarkGray
        $updateBody = @{
            type = "CNAME"
            name = $sub.Full
            content = $tunnelTarget
            proxied = $true
            ttl = 1
        } | ConvertTo-Json
        Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records/$($existing.id)" -Method Put -Headers @{ Authorization = "Bearer $Token"; "Content-Type" = "application/json" } -Body $updateBody | Out-Null
        Write-Host "   Updated $($sub.Full) -> $tunnelTarget (Proxied)" -ForegroundColor Green
    } else {
        Write-Host " - Creating CNAME '$($sub.Full)' -> $tunnelTarget (Proxied)..." -ForegroundColor Yellow
        $createBody = @{
            type = "CNAME"
            name = $sub.Full
            content = $tunnelTarget
            proxied = $true
            ttl = 1
        } | ConvertTo-Json
        Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records" -Method Post -Headers @{ Authorization = "Bearer $Token"; "Content-Type" = "application/json" } -Body $createBody | Out-Null
        Write-Host "   Created $($sub.Full) -> $tunnelTarget (Proxied)" -ForegroundColor Green
    }
}

# 4. Final Verification
Write-Host "`n[4/4] Verifying DNS Records on Cloudflare Zone..." -ForegroundColor Yellow
$finalRecords = (Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records?type=CNAME" -Headers @{ Authorization = "Bearer $Token" }).result
$finalRecords | Select-Object name, type, content, proxied | Format-Table -AutoSize

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "   Cloudflare Zone & Tunnel DNS successfully configured!  " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
