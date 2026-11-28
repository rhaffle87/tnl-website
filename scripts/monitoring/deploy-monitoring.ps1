param (
    [ValidateSet("100.114.215.48")]
    [string]$MonitorIp = "100.114.215.48",
    [ValidateSet("100.102.105.77")]
    [string]$WebIp = "100.102.105.77",
    [ValidateSet("100.65.129.8")]
    [string]$AppIp = "100.65.129.8",
    [switch]$InstallNginxExporter,
    [switch]$ExporterOnly,
    [switch]$EnableAlertDelivery,
    [switch]$Execute
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

if ($ExporterOnly -and (-not $InstallNginxExporter -or $EnableAlertDelivery)) {
    throw "-ExporterOnly requires -InstallNginxExporter and cannot enable alert delivery."
}

if (-not $Execute) {
    Write-Host "Plan only. No SSH, SCP, package install, file write, service restart, or alert delivery will occur."
    if (-not $ExporterOnly) {
        Write-Host "CT 117: validate and install Prometheus rules, blackbox exporter, local Alertmanager, Grafana datasource and dashboards."
    }
    else {
        Write-Host "CT 117: run a read-only positive scrape probe; do not install or restart services."
    }
    if ($InstallNginxExporter) {
        Write-Host "CT 102: install a loopback-only exporter and CT 117-only Nginx metrics proxy on $WebIp`:9113."
    }
    else {
        Write-Host "CT 102 Nginx exporter is not included; pass -InstallNginxExporter after operator approval."
    }
    if ($EnableAlertDelivery) {
        Write-Host "Alert delivery will use the root-only /etc/tnl/alertmanager.env on CT 117."
    }
    else {
        Write-Host "No alert delivery endpoint or recipient will be configured."
    }
    if ($ExporterOnly) {
        Write-Host "Exporter-only mode will not install or restart CT 117 services or Grafana."
    }
    Write-Host "Pass -Execute only after the parent approves remote monitoring integration."
    exit 0
}

$sshCommand = Get-Command ssh.exe -ErrorAction SilentlyContinue
$scpCommand = Get-Command scp.exe -ErrorAction SilentlyContinue
if (-not $sshCommand -or -not $scpCommand) {
    throw "OpenSSH ssh.exe and scp.exe are required."
}

$connectOptions = @(
    "-o", "BatchMode=yes",
    "-o", "ConnectionAttempts=1",
    "-o", "ConnectTimeout=10",
    "-o", "ServerAliveInterval=5",
    "-o", "ServerAliveCountMax=3"
)
$stage = "/tmp/tnl-monitoring-" + [guid]::NewGuid().ToString("N")
$monitorFiles = @(
    "prometheus.yml",
    "alert_rules.yml",
    "blackbox.yml",
    "render-alertmanager-config.py",
    "install-ct117-monitoring.sh",
    "dashboards-provisioning.yaml",
    "grafana-datasource.yaml"
)
$dashboardFiles = Get-ChildItem -LiteralPath (Join-Path $scriptDir "dashboards") -Filter "*.json" -File
foreach ($dashboard in $dashboardFiles) {
    if ($dashboard.Name -notmatch '^[A-Za-z0-9_.-]+\.json$') {
        throw "A dashboard filename is not safe for remote staging."
    }
}
$grafanaReadiness = "systemctl restart grafana-server && for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do if curl --fail --silent --max-time 3 http://127.0.0.1:3000/api/health >/dev/null; then exit 0; fi; sleep 2; done; exit 1"
$grafanaBackupTargets = @()
$grafanaTransactionStarted = $false
$grafanaTransactionComplete = $false
$preserveMonitorStage = $false

function Invoke-Remote {
    param ([string]$Node, [string]$Command, [string]$FailureMessage)

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & $sshCommand.Source @connectOptions "root@$Node" $Command 2>&1 | Out-Null
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($exitCode -ne 0) {
        throw $FailureMessage
    }
}

function Copy-RemoteFile {
    param ([string]$LocalPath, [string]$Node, [string]$RemotePath)

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        & $scpCommand.Source @connectOptions $LocalPath "root@${Node}:$RemotePath" 2>&1 | Out-Null
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($exitCode -ne 0) {
        throw "Could not stage an approved monitoring artifact."
    }
}

$stagedMonitor = $false
$stagedWeb = $false
$stagedApp = $false
$webRollbackPending = $false
$preserveWebStage = $false
try {
    Invoke-Remote -Node $MonitorIp -Command "install -d -m 0700 '$stage'" -FailureMessage "Could not create the CT 117 staging directory."
    $stagedMonitor = $true
    if (-not $ExporterOnly) {
        foreach ($name in $monitorFiles) {
            Copy-RemoteFile -LocalPath (Join-Path $scriptDir $name) -Node $MonitorIp -RemotePath "$stage/$name"
        }

        $monitorInstall = "bash '$stage/install-ct117-monitoring.sh' --execute"
        if ($EnableAlertDelivery) {
            $monitorInstall += " --enable-alert-delivery"
        }
        Invoke-Remote -Node $MonitorIp -Command $monitorInstall -FailureMessage "CT 117 monitoring installation or config validation failed."

        Invoke-Remote -Node $MonitorIp -Command "install -d -m 0755 /etc/grafana/provisioning/dashboards /etc/grafana/provisioning/datasources /var/lib/grafana/dashboards" -FailureMessage "Could not create Grafana provisioning directories."
        Copy-RemoteFile -LocalPath (Join-Path $scriptDir "dashboards-provisioning.yaml") -Node $MonitorIp -RemotePath "$stage/dashboards-provisioning.yaml"
        Copy-RemoteFile -LocalPath (Join-Path $scriptDir "grafana-datasource.yaml") -Node $MonitorIp -RemotePath "$stage/grafana-datasource.yaml"

        $grafanaTargets = @(
            "/etc/grafana/provisioning/dashboards/dashboards.yaml",
            "/etc/grafana/provisioning/datasources/prometheus.yaml"
        ) + @($dashboardFiles | ForEach-Object { "/var/lib/grafana/dashboards/$($_.Name)" })
        Invoke-Remote -Node $MonitorIp -Command "install -d -m 0700 '$stage/grafana-rollback'" -FailureMessage "Could not create the Grafana rollback staging directory."
        $backupIndex = 0
        foreach ($target in $grafanaTargets) {
            $backupPath = "$stage/grafana-rollback/$backupIndex"
            $backupCommand = "if [ -L '$target' ] || [ -d '$target' ]; then exit 1; elif [ -f '$target' ]; then cp -a -- '$target' '$backupPath'; else touch '$backupPath.absent'; fi"
            Invoke-Remote -Node $MonitorIp -Command $backupCommand -FailureMessage "Could not snapshot existing Grafana configuration."
            $grafanaBackupTargets += [pscustomobject]@{ Path = $target; Backup = $backupPath }
            $backupIndex++
        }

        $grafanaTransactionStarted = $true
        Invoke-Remote -Node $MonitorIp -Command "install -o root -g grafana -m 0640 '$stage/dashboards-provisioning.yaml' /etc/grafana/provisioning/dashboards/dashboards.yaml && install -o root -g grafana -m 0640 '$stage/grafana-datasource.yaml' /etc/grafana/provisioning/datasources/prometheus.yaml" -FailureMessage "Could not install Grafana provisioning files."

        foreach ($dashboard in $dashboardFiles) {
            Copy-RemoteFile -LocalPath $dashboard.FullName -Node $MonitorIp -RemotePath "$stage/$($dashboard.Name)"
            Invoke-Remote -Node $MonitorIp -Command "install -o grafana -g grafana -m 0644 '$stage/$($dashboard.Name)' '/var/lib/grafana/dashboards/$($dashboard.Name)'" -FailureMessage "Could not install a Grafana dashboard."
        }
        Invoke-Remote -Node $MonitorIp -Command $grafanaReadiness -FailureMessage "Grafana did not become healthy after bounded readiness retries."
        $grafanaTransactionComplete = $true
    }

    if ($InstallNginxExporter) {
        $webStage = "/tmp/tnl-monitoring-" + [guid]::NewGuid().ToString("N")
        Invoke-Remote -Node $WebIp -Command "install -d -m 0700 '$webStage'" -FailureMessage "Could not create the CT 102 staging directory."
        $stagedWeb = $true
        Copy-RemoteFile -LocalPath (Join-Path $scriptDir "setup-nginx-exporter.sh") -Node $WebIp -RemotePath "$webStage/setup-nginx-exporter.sh"
        $rollbackDir = "$webStage/rollback"
        Invoke-Remote -Node $WebIp -Command "bash '$webStage/setup-nginx-exporter.sh' --snapshot-only --web-ip=$WebIp --rollback-dir='$rollbackDir'" -FailureMessage "Could not snapshot the previous CT 102 exporter state."
        $webRollbackPending = $true
        Invoke-Remote -Node $WebIp -Command "bash '$webStage/setup-nginx-exporter.sh' --execute --web-ip=$WebIp --rollback-dir='$rollbackDir'" -FailureMessage "CT 102 Nginx exporter setup or local verification failed."

        $probeScript = Join-Path $scriptDir "probe-nginx-exporter.sh"
        Copy-RemoteFile -LocalPath $probeScript -Node $MonitorIp -RemotePath "$stage/probe-nginx-exporter.sh"
        Invoke-Remote -Node $MonitorIp -Command "bash '$stage/probe-nginx-exporter.sh' --expect-up --web-ip=$WebIp" -FailureMessage "CT 117 could not scrape the allowlisted Nginx metrics endpoint."

        $appStage = "/tmp/tnl-monitoring-" + [guid]::NewGuid().ToString("N")
        Invoke-Remote -Node $AppIp -Command "install -d -m 0700 '$appStage'" -FailureMessage "Could not create the CT 103 probe staging directory."
        $stagedApp = $true
        Copy-RemoteFile -LocalPath $probeScript -Node $AppIp -RemotePath "$appStage/probe-nginx-exporter.sh"
        Invoke-Remote -Node $AppIp -Command "bash '$appStage/probe-nginx-exporter.sh' --expect-denied --web-ip=$WebIp" -FailureMessage "The Nginx metrics endpoint did not reject CT 103."

        Invoke-Remote -Node $WebIp -Command "bash '$webStage/setup-nginx-exporter.sh' --commit --web-ip=$WebIp --rollback-dir='$rollbackDir'" -FailureMessage "Could not finalize the verified CT 102 exporter change."
        $webRollbackPending = $false
    }

    if ($ExporterOnly) {
        Write-Host "CT 102 exporter allowlisting passed from CT 117 and was rejected from CT 103; other monitoring services were not changed."
    }
    else {
        Write-Host "Monitoring configs, exporters, and Grafana dashboards were installed and local health checks passed."
    }
    if ($EnableAlertDelivery) {
        Write-Host "Alert delivery was enabled from the existing root-only environment file; check its endpoint out of band."
    }
    else {
        Write-Host "Alertmanager remains configured with no external delivery endpoint."
    }
}
catch {
    $originalFailure = $_
    if ($webRollbackPending) {
        try {
            Invoke-Remote -Node $WebIp -Command "bash '$webStage/setup-nginx-exporter.sh' --rollback --web-ip=$WebIp --rollback-dir='$webStage/rollback'" -FailureMessage "Could not restore the previous CT 102 exporter state."
            $webRollbackPending = $false
        }
        catch {
            $preserveWebStage = $true
            throw "Monitoring deployment failed and CT 102 exporter rollback could not be confirmed. Rollback snapshot retained at $webStage/rollback."
        }
    }
    if ($grafanaTransactionStarted -and -not $grafanaTransactionComplete) {
        $rollbackFailed = $false
        foreach ($target in $grafanaBackupTargets) {
            $restorePath = "$($target.Path).restore-" + [guid]::NewGuid().ToString("N")
            $restoreCommand = "if [ -f '$($target.Backup).absent' ]; then rm -f -- '$($target.Path)'; elif [ -e '$($target.Backup)' ] || [ -L '$($target.Backup)' ]; then cp -a -- '$($target.Backup)' '$restorePath' && mv -f -- '$restorePath' '$($target.Path)'; else exit 1; fi"
            try {
                Invoke-Remote -Node $MonitorIp -Command $restoreCommand -FailureMessage "Could not restore a Grafana configuration snapshot."
            }
            catch {
                $rollbackFailed = $true
            }
        }
        try {
            Invoke-Remote -Node $MonitorIp -Command $grafanaReadiness -FailureMessage "Grafana did not recover after restoring its previous configuration."
        }
        catch {
            $rollbackFailed = $true
        }
        if ($rollbackFailed) {
            $preserveMonitorStage = $true
            throw "Monitoring deployment failed; Grafana rollback could not be confirmed. Snapshots remain staged at $stage."
        }
    }
    throw $originalFailure
}
finally {
    if ($stagedMonitor -and -not $preserveMonitorStage) {
        Invoke-Remote -Node $MonitorIp -Command "rm -rf -- '$stage'" -FailureMessage "Could not remove the CT 117 staging directory."
    }
    elseif ($preserveMonitorStage) {
        Write-Host "Grafana rollback snapshots were retained at $stage."
    }
    if ($stagedWeb) {
        if (-not $preserveWebStage) {
            Invoke-Remote -Node $WebIp -Command "rm -rf -- '$webStage'" -FailureMessage "Could not remove the CT 102 staging directory."
        }
        else {
            Write-Host "CT 102 rollback artifacts were retained at $webStage."
        }
    }
    if ($stagedApp) {
        Invoke-Remote -Node $AppIp -Command "rm -rf -- '$appStage'" -FailureMessage "Could not remove the CT 103 probe staging directory."
    }
}
