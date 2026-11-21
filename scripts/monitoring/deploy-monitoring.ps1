# Deploy & Sync TNL Monitoring Infrastructure to CT 117 (labtnl-monitor)
param (
    [string]$MonitorIp = "100.114.215.48",
    [string]$WebIp = "100.102.105.77",
    [string]$AppIp = "100.65.129.8",
    [string]$DbIp = "100.111.32.102"
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   Deploying TNL Unified Monitoring & Observability Stack  " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1. Sync Prometheus Config & Alert Rules
Write-Host "[1/5] Syncing Prometheus configuration & alerting rules to CT 117..." -ForegroundColor Yellow
$promYml = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes("$scriptDir\prometheus.yml"))
$alertYml = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes("$scriptDir\alert_rules.yml"))

$syncPromCmd = @"
echo '$promYml' | base64 -d > /etc/prometheus/prometheus.yml
echo '$alertYml' | base64 -d > /etc/prometheus/alert_rules.yml
promtool check config /etc/prometheus/prometheus.yml
systemctl reload prometheus || systemctl restart prometheus
"@

ssh root@$MonitorIp $syncPromCmd
if ($LASTEXITCODE -ne 0) { throw "Prometheus configuration check or reload failed on CT 117!" }
Write-Host "  -> Prometheus config & alerting rules verified and active." -ForegroundColor Green

# 2. Sync Grafana Dashboard Provisioning Configuration
Write-Host "[2/5] Setting up Grafana dashboard provisioning on CT 117..." -ForegroundColor Yellow
$dashProvYml = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes("$scriptDir\dashboards-provisioning.yaml"))

$syncProvCmd = @"
mkdir -p /var/lib/grafana/dashboards
chown -R grafana:grafana /var/lib/grafana/dashboards
chmod 755 /var/lib/grafana/dashboards
echo '$dashProvYml' | base64 -d > /etc/grafana/provisioning/dashboards/dashboards.yaml
chown root:grafana /etc/grafana/provisioning/dashboards/dashboards.yaml
chmod 640 /etc/grafana/provisioning/dashboards/dashboards.yaml
"@

ssh root@$MonitorIp $syncProvCmd
if ($LASTEXITCODE -ne 0) { throw "Failed to configure dashboard provisioning on CT 117!" }
Write-Host "  -> Dashboard provisioning directory and config ready." -ForegroundColor Green

# 3. Sync Dashboard JSON Definitions
Write-Host "[3/5] Uploading Dashboard JSON definitions to CT 117..." -ForegroundColor Yellow
$dashboards = Get-ChildItem "$scriptDir\dashboards\*.json"
foreach ($dash in $dashboards) {
    $dashName = $dash.Name
    $dashB64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($dash.FullName))
    $uploadCmd = @"
echo '$dashB64' | base64 -d > /var/lib/grafana/dashboards/$dashName
chown grafana:grafana /var/lib/grafana/dashboards/$dashName
chmod 644 /var/lib/grafana/dashboards/$dashName
"@
    ssh root@$MonitorIp $uploadCmd
    Write-Host "  -> Synced dashboard: $dashName" -ForegroundColor DarkGreen
}

# 4. Security Hardening on CT 117 (grafana.ini)
Write-Host "[4/5] Enforcing Grafana security settings (allow_sign_up = false)..." -ForegroundColor Yellow
$secCmd = @'
python3 -c '
with open("/etc/grafana/grafana.ini", "r") as f:
    lines = f.readlines()

new_lines = []
in_users = False
for line in lines:
    if line.strip() == "[users]":
        in_users = True
        new_lines.append(line)
        continue
    if in_users and line.startswith("["):
        in_users = False
    
    if in_users and ("allow_sign_up" in line):
        new_lines.append("allow_sign_up = false\n")
    elif "disable_gravatar" in line and not line.startswith(";"):
        new_lines.append("disable_gravatar = true\n")
    else:
        new_lines.append(line)

with open("/etc/grafana/grafana.ini", "w") as f:
    f.writelines(new_lines)
print("Updated grafana.ini security settings")
'
systemctl restart grafana-server
'@
$secB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($secCmd))
ssh root@$MonitorIp "echo '$secB64' | base64 -d | bash"
Write-Host "  -> Grafana security hardened & service restarted." -ForegroundColor Green

# 5. Verification
Write-Host "[5/5] Verifying health across all Prometheus & Grafana endpoints..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

$verifyCmd = @"
python3 -c "
import urllib.request, json
# 1. Prometheus targets
targets = json.loads(urllib.request.urlopen('http://localhost:9090/api/v1/targets').read().decode())
print(f'Active Prometheus targets: {len(targets[\"data\"][\"activeTargets\"])}')
for t in targets['data']['activeTargets']:
    print(f'  - {t[\"labels\"].get(\"job\")}: {t[\"labels\"].get(\"instance\")} -> {t[\"health\"]}')

# 2. Prometheus rules
rules = json.loads(urllib.request.urlopen('http://localhost:9090/api/v1/rules').read().decode())
groups = rules['data']['groups']
total_rules = sum(len(g['rules']) for g in groups)
print(f'Loaded Alerting Rules: {total_rules} across {len(groups)} group(s)')

# 3. Grafana status
grafana_resp = urllib.request.urlopen('http://localhost:3000/api/health')
print('Grafana API health:', grafana_resp.read().decode().strip())
"
"@

$verifyB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($verifyCmd))
ssh root@$MonitorIp "echo '$verifyB64' | base64 -d | bash"

Write-Host "`n[SUCCESS] TNL Monitoring Infrastructure successfully deployed!" -ForegroundColor Cyan
