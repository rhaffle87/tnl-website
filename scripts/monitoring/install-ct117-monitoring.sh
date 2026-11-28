#!/usr/bin/env bash
set -euo pipefail

execute=0
enable_alert_delivery=0
for argument in "$@"; do
  case "$argument" in
    --execute) execute=1 ;;
    --enable-alert-delivery) enable_alert_delivery=1 ;;
    *) printf '%s\n' "Unknown argument." >&2; exit 2 ;;
  esac
done

if [[ "$execute" -ne 1 ]]; then
  printf '%s\n' "Plan only: install local Alertmanager and blackbox exporters on CT 117."
  printf '%s\n' "Run with --execute after the parent approves monitoring integration."
  exit 0
fi
if [[ "$EUID" -ne 0 ]]; then
  printf '%s\n' "Run as root on the monitoring guest." >&2
  exit 1
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y prometheus-alertmanager prometheus-blackbox-exporter

alertmanager_bin=$(command -v prometheus-alertmanager || command -v alertmanager || true)
amtool_bin=$(command -v prometheus-amtool || command -v amtool || true)
blackbox_bin=$(command -v prometheus-blackbox-exporter || command -v blackbox_exporter || true)
if [[ -z "$alertmanager_bin" || -z "$amtool_bin" || -z "$blackbox_bin" ]]; then
  printf '%s\n' "Required exporter binaries were not installed." >&2
  exit 1
fi

install -d -m 0755 /usr/local/lib/tnl-monitoring /etc/prometheus
install -m 0644 "$script_dir/render-alertmanager-config.py" /usr/local/lib/tnl-monitoring/render-alertmanager-config.py
install -m 0644 "$script_dir/blackbox.yml" /etc/prometheus/tnl-blackbox.yml.new
install -m 0644 "$script_dir/prometheus.yml" /etc/prometheus/prometheus.yml.new
install -m 0644 "$script_dir/alert_rules.yml" /etc/prometheus/alert_rules.yml.new

if ! command -v promtool >/dev/null 2>&1; then
  printf '%s\n' "promtool is required to validate the staged Prometheus config." >&2
  exit 1
fi
promtool check rules /etc/prometheus/alert_rules.yml.new
validation_config=$(mktemp)
sed 's#/etc/prometheus/alert_rules.yml#/etc/prometheus/alert_rules.yml.new#g' "$script_dir/prometheus.yml" > "$validation_config"
if ! promtool check config "$validation_config"; then
  rm -f "$validation_config" /etc/prometheus/prometheus.yml.new /etc/prometheus/alert_rules.yml.new /etc/prometheus/tnl-blackbox.yml.new
  exit 1
fi
rm -f "$validation_config"
"$blackbox_bin" --config.file=/etc/prometheus/tnl-blackbox.yml.new --config.check

if ! id prometheus >/dev/null 2>&1; then
  printf '%s\n' "The Prometheus service account is unavailable." >&2
  exit 1
fi
install -d -o prometheus -g prometheus -m 0750 /var/lib/prometheus/tnl-alertmanager

install -d -m 0755 /etc/systemd/system/tnl-alertmanager.service.d
cat > /etc/systemd/system/tnl-alertmanager.service <<EOF
[Unit]
Description=TNL Alertmanager
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=prometheus
Group=prometheus
RuntimeDirectory=tnl-alertmanager
RuntimeDirectoryMode=0750
ExecStartPre=/usr/bin/python3 /usr/local/lib/tnl-monitoring/render-alertmanager-config.py --output /run/tnl-alertmanager/alertmanager.yml
ExecStartPre=$amtool_bin check-config /run/tnl-alertmanager/alertmanager.yml
ExecStart=$alertmanager_bin --config.file=/run/tnl-alertmanager/alertmanager.yml --storage.path=/var/lib/prometheus/tnl-alertmanager --web.listen-address=127.0.0.1:9093
Restart=on-failure
RestartSec=5s
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/prometheus/tnl-alertmanager /run/tnl-alertmanager

[Install]
WantedBy=multi-user.target
EOF

if [[ "$enable_alert_delivery" -eq 1 ]]; then
  if [[ ! -f /etc/tnl/alertmanager.env ]]; then
    printf '%s\n' "Optional delivery requested but /etc/tnl/alertmanager.env is missing." >&2
    exit 1
  fi
  env_owner=$(stat -c %U /etc/tnl/alertmanager.env)
  env_mode=$(stat -c %a /etc/tnl/alertmanager.env)
  if [[ "$env_owner" != "root" || ( "$env_mode" != "400" && "$env_mode" != "600" ) ]]; then
    printf '%s\n' "Optional Alertmanager environment file must be root-owned with mode 0400 or 0600." >&2
    exit 1
  fi
  cat > /etc/systemd/system/tnl-alertmanager.service.d/delivery.conf <<'EOF'
[Service]
EnvironmentFile=/etc/tnl/alertmanager.env
EOF
  chmod 0640 /etc/systemd/system/tnl-alertmanager.service.d/delivery.conf
else
  rm -f /etc/systemd/system/tnl-alertmanager.service.d/delivery.conf
fi

install -d -m 0755 /etc/systemd/system/tnl-blackbox-exporter.service.d
cat > /etc/systemd/system/tnl-blackbox-exporter.service <<EOF
[Unit]
Description=TNL Blackbox Exporter
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=prometheus
Group=prometheus
ExecStart=$blackbox_bin --config.file=/etc/prometheus/tnl-blackbox.yml --web.listen-address=127.0.0.1:9115
Restart=on-failure
RestartSec=5s
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

for unit in tnl-alertmanager.service tnl-blackbox-exporter.service; do
  systemd-analyze verify "/etc/systemd/system/$unit"
done

stamp=$(date -u +%Y%m%dT%H%M%SZ)-$$
prometheus_snapshot=
rules_snapshot=
blackbox_snapshot=
for path in /etc/prometheus/prometheus.yml /etc/prometheus/alert_rules.yml /etc/prometheus/tnl-blackbox.yml; do
  if [[ -f "$path" ]]; then
    snapshot="$path.pre-tnl-$stamp"
    cp -a -- "$path" "$snapshot"
    if [[ "$path" == /etc/prometheus/prometheus.yml ]]; then
      prometheus_snapshot=$snapshot
    elif [[ "$path" == /etc/prometheus/alert_rules.yml ]]; then
      rules_snapshot=$snapshot
    else
      blackbox_snapshot=$snapshot
    fi
  fi
done
systemctl daemon-reload

rollback_prometheus_config() {
  if [[ -n "$prometheus_snapshot" ]]; then
    cp -a -- "$prometheus_snapshot" /etc/prometheus/prometheus.yml
  else
    rm -f -- /etc/prometheus/prometheus.yml
  fi
  if [[ -n "$rules_snapshot" ]]; then
    cp -a -- "$rules_snapshot" /etc/prometheus/alert_rules.yml
  else
    rm -f -- /etc/prometheus/alert_rules.yml
  fi
  if [[ -n "$blackbox_snapshot" ]]; then
    cp -a -- "$blackbox_snapshot" /etc/prometheus/tnl-blackbox.yml
  else
    rm -f -- /etc/prometheus/tnl-blackbox.yml
  fi
}

if ! mv -f -- /etc/prometheus/tnl-blackbox.yml.new /etc/prometheus/tnl-blackbox.yml; then
  rollback_prometheus_config
  printf '%s\n' "Could not replace the blackbox config; the previous config was restored." >&2
  exit 1
fi
if ! mv -f -- /etc/prometheus/prometheus.yml.new /etc/prometheus/prometheus.yml; then
  rollback_prometheus_config
  printf '%s\n' "Could not replace Prometheus config; the previous config was restored." >&2
  exit 1
fi
if ! mv -f -- /etc/prometheus/alert_rules.yml.new /etc/prometheus/alert_rules.yml; then
  rollback_prometheus_config
  printf '%s\n' "Could not replace Prometheus rules; the previous config was restored." >&2
  exit 1
fi
if ! promtool check config /etc/prometheus/prometheus.yml; then
  rollback_prometheus_config
  printf '%s\n' "Installed Prometheus config validation failed; the previous config was restored." >&2
  exit 1
fi
if ! systemctl reload prometheus && ! systemctl restart prometheus; then
  rollback_prometheus_config
  systemctl reload prometheus || systemctl restart prometheus || true
  printf '%s\n' "Prometheus could not load the new config; the previous config was restored." >&2
  exit 1
fi
rm -f -- /etc/prometheus/prometheus.yml.new /etc/prometheus/alert_rules.yml.new /etc/prometheus/tnl-blackbox.yml.new
systemctl enable --now tnl-blackbox-exporter.service tnl-alertmanager.service

printf '%s\n' "Prometheus config, blackbox exporter and Alertmanager are installed."
if [[ "$enable_alert_delivery" -eq 1 ]]; then
  printf '%s\n' "Optional webhook routing is enabled from the private root-only environment file."
else
  printf '%s\n' "No delivery endpoint was configured; alerts are evaluated but not sent externally."
fi
