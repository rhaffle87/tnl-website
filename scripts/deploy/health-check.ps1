# Health Check across all TNL Proxmox LXC nodes via Tailscale
param (
    [string]$WebIp = "100.102.105.77",
    [string]$AppIp = "100.65.129.8",
    [string]$DbIp = "100.111.32.102",
    [string]$MonitorIp = "100.114.215.48"
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   TNL Studio Infrastructure Health Audit (Tailscale)     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`n"

$results = [System.Collections.Generic.List[PSCustomObject]]::new()

function Test-NodeEndpoint {
    param ($Name, $HostTarget, $Port, $Type, $Url, $Expected)
    $status = "FAIL"
    $detail = ""
    
    try {
        if ($Type -eq "TCP") {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $asyncResult = $tcp.BeginConnect($HostTarget, $Port, $null, $null)
            $wait = $asyncResult.AsyncWaitHandle.WaitOne(2000, $false)
            if ($wait -and $tcp.Connected) {
                $status = "OK"
                $detail = "Port $Port reachable"
                $tcp.EndConnect($asyncResult)
            } else {
                $detail = "Connection timeout"
            }
            $tcp.Close()
        } elseif ($Type -eq "HTTP") {
            $req = [System.Net.HttpWebRequest]::Create($Url)
            $req.Timeout = 4000
            $req.Method = "GET"
            $resp = $req.GetResponse()
            $code = [int]$resp.StatusCode
            if ($code -eq 200) {
                $status = "OK"
                $detail = "HTTP $code"
            } else {
                $detail = "HTTP $code"
            }
            $resp.Close()
        } elseif ($Type -eq "JSON") {
            $json = Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 4
            $status = "OK"
            $detail = ($json | ConvertTo-Json -Compress)
            if ($detail.Length -gt 35) { $detail = $detail.Substring(0, 32) + "..." }
        }
    } catch {
        $status = "FAIL"
        $detail = $_.Exception.Message
        if ($detail.Length -gt 35) { $detail = $detail.Substring(0, 32) + "..." }
    }

    return [PSCustomObject]@{
        Node = $Name
        Target = "$HostTarget"
        Test = if ($Type -eq "TCP") { "Port $Port" } else { $Url.Replace("http://$HostTarget", "") }
        Status = $status
        Detail = $detail
    }
}

# 1. CT 102 (labtnl-web)
$results.Add((Test-NodeEndpoint -Name "CT 102 (Web Edge)" -HostTarget $WebIp -Port 80 -Type "TCP"))
$results.Add((Test-NodeEndpoint -Name "CT 102 (Web Edge)" -HostTarget $WebIp -Type "HTTP" -Url "http://$WebIp/"))
$results.Add((Test-NodeEndpoint -Name "CT 102 (API Proxy)" -HostTarget $WebIp -Type "JSON" -Url "http://$WebIp/api/health"))
$results.Add((Test-NodeEndpoint -Name "CT 102 (Public Stats)" -HostTarget $WebIp -Type "JSON" -Url "http://$WebIp/api/public/stats"))

# 2. CT 103 (labtnl-app)
$results.Add((Test-NodeEndpoint -Name "CT 103 (Backend App)" -HostTarget $AppIp -Port 8001 -Type "TCP"))
$results.Add((Test-NodeEndpoint -Name "CT 103 (Frontend App)" -HostTarget $AppIp -Port 3000 -Type "TCP"))
$results.Add((Test-NodeEndpoint -Name "CT 103 (Direct Health)" -HostTarget $AppIp -Type "JSON" -Url "http://${AppIp}:8001/api/health"))

# 3. CT 116 (labtnl-db)
$results.Add((Test-NodeEndpoint -Name "CT 116 (MongoDB)" -HostTarget $DbIp -Port 27017 -Type "TCP"))

# 4. CT 117 (labtnl-monitor)
$results.Add((Test-NodeEndpoint -Name "CT 117 (Prometheus)" -HostTarget $MonitorIp -Port 9090 -Type "TCP"))
$results.Add((Test-NodeEndpoint -Name "CT 117 (Grafana)" -HostTarget $MonitorIp -Port 3000 -Type "TCP"))

# Output table
$results | Format-Table -AutoSize

$allOk = ($results | Where-Object { $_.Status -ne "OK" }).Count -eq 0
if ($allOk) {
    Write-Host "[PASS] All services across the 4 LXC nodes are healthy and responding." -ForegroundColor Green
} else {
    Write-Host "[WARN] One or more endpoints reported errors. Review table above." -ForegroundColor Yellow
}
