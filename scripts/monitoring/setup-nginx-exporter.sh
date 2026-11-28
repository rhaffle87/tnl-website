#!/usr/bin/env bash
set -euo pipefail

web_ip="100.102.105.77"
execute=0
mode="execute"
rollback_dir=""
for argument in "$@"; do
  case "$argument" in
    --execute) execute=1 ;;
    --web-ip=*) web_ip=${argument#*=} ;;
    --snapshot-only) mode="snapshot" ;;
    --rollback) mode="rollback" ;;
    --commit) mode="commit" ;;
    --rollback-dir=*) rollback_dir=${argument#*=} ;;
    *) printf '%s\n' "Unknown argument." >&2; exit 2 ;;
  esac
done
if [[ "$web_ip" != "100.102.105.77" ]]; then
  printf '%s\n' "Only the known CT 102 Tailscale address is allowed." >&2
  exit 2
fi

if [[ "$execute" -ne 1 && "$mode" == "execute" ]]; then
  printf 'Plan only: install a loopback Nginx exporter with a CT 117-only proxy on CT 102 (%s:9113).\n' "$web_ip"
  printf '%s\n' "Run through deploy-monitoring.ps1 so the change is snapshotted and verified from both guests."
  exit 0
fi
if [[ "$EUID" -ne 0 ]]; then
  printf '%s\n' "Run as root on the edge guest." >&2
  exit 1
fi
if [[ ! "$rollback_dir" =~ ^/tmp/tnl-monitoring-[0-9a-f]{32}/rollback$ ]]; then
  printf '%s\n' "A guarded monitoring staging rollback directory is required." >&2
  exit 2
fi
stage_dir=${rollback_dir%/rollback}
if [[ ! -d "$stage_dir" || "$(stat -c '%U:%a' "$stage_dir")" != "root:700" ]]; then
  printf '%s\n' "The rollback directory must be inside the root-only deployment staging directory." >&2
  exit 1
fi

status_conf=/etc/nginx/conf.d/tnl-prometheus-status.conf
proxy_conf=/etc/nginx/conf.d/tnl-prometheus-exporter-proxy.conf
unit_path=/etc/systemd/system/tnl-nginx-exporter.service
default_units=(prometheus-nginx-exporter.service nginx-prometheus-exporter.service)

restore_file() {
  local name=$1
  local path=$2
  local source="$rollback_dir/$name"
  local temporary="${path}.restore-$$"
  if [[ -f "$rollback_dir/absent-$name" ]]; then
    rm -f -- "$path"
  elif [[ -f "$source" ]]; then
    cp -a -- "$source" "$temporary"
    mv -f -- "$temporary" "$path"
  else
    printf 'Missing rollback snapshot for %s.\n' "$path" >&2
    return 1
  fi
}

restore_unit_states() {
  local unit enabled active
  while read -r unit enabled active; do
    case "$enabled" in
      enabled|enabled-runtime) systemctl enable "$unit" >/dev/null ;;
      masked) systemctl mask "$unit" >/dev/null ;;
      *) systemctl disable "$unit" >/dev/null 2>&1 || true ;;
    esac
    if [[ "$active" == "active" ]]; then
      systemctl restart "$unit"
    else
      systemctl stop "$unit" >/dev/null 2>&1 || true
    fi
  done < "$rollback_dir/unit-states"
}

if [[ "$mode" == "rollback" || "$mode" == "commit" ]]; then
  if [[ ! -f "$rollback_dir/manifest" ]] || ! grep -Fxq 'TNL_NGINX_EXPORTER_ROLLBACK_V1' "$rollback_dir/manifest"; then
    printf '%s\n' "A valid monitoring rollback snapshot was not found." >&2
    exit 1
  fi
  if [[ "$mode" == "commit" ]]; then
    rm -rf -- "$rollback_dir"
    printf '%s\n' "The verified Nginx exporter change was committed; rollback snapshots were removed."
    exit 0
  fi
  restore_file unit "$unit_path"
  restore_file status-conf "$status_conf"
  restore_file proxy-conf "$proxy_conf"
  systemctl daemon-reload
  nginx -t
  systemctl reload nginx
  restore_unit_states
  printf '%s\n' "The previous Nginx exporter configuration and service states were restored."
  exit 0
fi

if [[ "$mode" == "snapshot" ]]; then
  if [[ -e "$rollback_dir" || -L "$rollback_dir" ]]; then
    printf '%s\n' "The monitoring rollback directory already exists." >&2
    exit 1
  fi
  install -d -m 0700 "$rollback_dir"
  printf '%s\n' 'TNL_NGINX_EXPORTER_ROLLBACK_V1' > "$rollback_dir/manifest"
  snapshot_file() {
    local name=$1
    local path=$2
    if [[ -L "$path" || -d "$path" ]]; then
      printf 'Refusing to snapshot non-regular managed path %s.\n' "$path" >&2
      return 1
    elif [[ -f "$path" ]]; then
      cp -a -- "$path" "$rollback_dir/$name"
    else
      touch "$rollback_dir/absent-$name"
    fi
  }
  snapshot_file unit "$unit_path"
  snapshot_file status-conf "$status_conf"
  snapshot_file proxy-conf "$proxy_conf"
  {
    for unit in tnl-nginx-exporter.service "${default_units[@]}"; do
      enabled=$(systemctl is-enabled "$unit" 2>/dev/null || true)
      active=$(systemctl is-active "$unit" 2>/dev/null || true)
      printf '%s %s %s\n' "$unit" "${enabled:-not-found}" "${active:-inactive}"
    done
  } > "$rollback_dir/unit-states"
  chmod 0600 "$rollback_dir/manifest" "$rollback_dir/unit-states"
  printf '%s\n' "A root-only Nginx exporter rollback snapshot was created."
  exit 0
fi

if [[ "$execute" -ne 1 ]]; then
  printf '%s\n' "Pass --execute after creating a guarded rollback snapshot."
  exit 2
fi
if [[ ! -f "$rollback_dir/manifest" ]] || ! grep -Fxq 'TNL_NGINX_EXPORTER_ROLLBACK_V1' "$rollback_dir/manifest"; then
  printf '%s\n' "Create a guarded rollback snapshot before applying this change." >&2
  exit 1
fi
if ! ip -o -4 addr show | awk '{print $4}' | cut -d/ -f1 | grep -Fxq "$web_ip"; then
  printf '%s\n' "The configured exporter address is not assigned to this host." >&2
  exit 1
fi
if ss -ltn | awk 'NR > 1 {print $4}' | grep -Eq "(^|:)$web_ip:9113$|:9113$"; then
  if systemctl is-active --quiet tnl-nginx-exporter.service \
    && grep -Fq -- 'Description=TNL Nginx Prometheus Exporter' /etc/systemd/system/tnl-nginx-exporter.service \
    && grep -Eq -- '--web.listen-address=(127\.0\.0\.1:9114|100\.102\.105\.77:9113)' /etc/systemd/system/tnl-nginx-exporter.service; then
    :
  else
    printf '%s\n' "Port 9113 is already listening; refusing to replace an unknown service."
    exit 1
  fi
fi
if ss -ltn | awk 'NR > 1 {print $4}' | grep -Eq '(^|:)9114$'; then
  printf '%s\n' "Loopback exporter port 9114 is already occupied; refusing to replace an unknown listener." >&2
  exit 1
fi

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y prometheus-nginx-exporter nginx

# Keep the package-default exporter from binding a wildcard listener on port 9113.
for unit in prometheus-nginx-exporter.service nginx-prometheus-exporter.service; do
  if systemctl cat "$unit" >/dev/null 2>&1; then
    systemctl disable "$unit" >/dev/null 2>&1 || true
    systemctl stop "$unit" >/dev/null 2>&1 || true
    if systemctl is-active --quiet "$unit"; then
      printf 'Could not stop the package-default exporter unit %s.\n' "$unit" >&2
      exit 1
    fi
  fi
done

exporter_bin=$(command -v prometheus-nginx-exporter || command -v nginx-prometheus-exporter || true)
if [[ -z "$exporter_bin" ]]; then
  printf '%s\n' "Nginx Prometheus exporter binary was not installed." >&2
  exit 1
fi

status_conf=/etc/nginx/conf.d/tnl-prometheus-status.conf
proxy_conf=/etc/nginx/conf.d/tnl-prometheus-exporter-proxy.conf
created_status_conf=0
created_proxy_conf=0
if [[ ! -e "$status_conf" ]]; then
  cat > "$status_conf" <<'EOF'
server {
    listen 127.0.0.1:8081;
    server_name _;
    access_log off;
    location = /stub_status {
        stub_status;
        allow 127.0.0.1;
        deny all;
    }
}
EOF
  chmod 0644 "$status_conf"
  created_status_conf=1
elif ! grep -q 'listen 127.0.0.1:8081;' "$status_conf" || ! grep -q 'location = /stub_status' "$status_conf"; then
  printf '%s\n' "An existing TNL status config differs; refusing to overwrite it." >&2
  exit 1
fi

proxy_candidate=$(mktemp)
cat > "$proxy_candidate" <<EOF
server {
    listen $web_ip:9113;
    server_name _;
    access_log off;
    location = /metrics {
        allow 100.114.215.48;
        deny all;
        proxy_pass http://127.0.0.1:9114/metrics;
    }
    location / {
        return 404;
    }
}
EOF
if [[ ! -e "$proxy_conf" ]]; then
  install -m 0644 "$proxy_candidate" "$proxy_conf"
  created_proxy_conf=1
elif [[ -L "$proxy_conf" || ! -f "$proxy_conf" ]] || ! cmp -s -- "$proxy_candidate" "$proxy_conf"; then
  rm -f -- "$proxy_candidate"
  printf '%s\n' "An existing TNL exporter proxy config differs; refusing to overwrite it." >&2
  if [[ "$created_status_conf" -eq 1 ]]; then rm -f -- "$status_conf"; fi
  exit 1
fi
rm -f -- "$proxy_candidate"

install -d -m 0755 /etc/systemd/system/tnl-nginx-exporter.service.d
cat > /etc/systemd/system/tnl-nginx-exporter.service <<EOF
[Unit]
Description=TNL Nginx Prometheus Exporter
After=network-online.target nginx.service
Wants=network-online.target

[Service]
Type=simple
User=prometheus
Group=prometheus
ExecStart=$exporter_bin --nginx.scrape-uri=http://127.0.0.1:8081/stub_status --web.listen-address=127.0.0.1:9114
Restart=on-failure
RestartSec=5s
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

if ! nginx -t; then
  exit 1
fi
if ! systemd-analyze verify "$unit_path"; then
  exit 1
fi
systemctl daemon-reload
systemctl enable tnl-nginx-exporter.service
systemctl restart tnl-nginx-exporter.service
systemctl reload nginx
ready=0
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if metrics=$(curl --fail --silent --max-time 3 "http://127.0.0.1:9114/metrics" 2>/dev/null) \
    && awk '/^nginx_up / { found = 1 } END { exit !found }' <<<"$metrics"; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" -ne 1 ]]; then
  printf '%s\n' "Nginx exporter did not become ready with an nginx_up metric." >&2
  exit 1
fi
if ! ss -ltn | awk 'NR > 1 {print $4}' | grep -Fxq '127.0.0.1:9114'; then
  printf '%s\n' "The exporter is not listening only on the expected loopback address." >&2
  exit 1
fi
if ! ss -ltn | awk 'NR > 1 {print $4}' | grep -Fxq "$web_ip:9113"; then
  printf '%s\n' "The CT 117 metrics proxy is not listening on the expected tailnet address." >&2
  exit 1
fi
printf 'Nginx exporter is loopback-only on 127.0.0.1:9114; the CT 117-only metrics proxy listens on %s:9113.\n' "$web_ip"
