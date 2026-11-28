#!/usr/bin/env bash
set -euo pipefail

web_ip="100.102.105.77"
execute=0
for argument in "$@"; do
  case "$argument" in
    --execute) execute=1 ;;
    --web-ip=*) web_ip=${argument#*=} ;;
    *) printf '%s\n' "Unknown argument." >&2; exit 2 ;;
  esac
done
if [[ "$web_ip" != "100.102.105.77" ]]; then
  printf '%s\n' "Only the known CT 102 Tailscale address is allowed." >&2
  exit 2
fi

if [[ "$execute" -ne 1 ]]; then
  printf 'Plan only: install Nginx status exporter on CT 102 (%s:9113).\n' "$web_ip"
  printf '%s\n' "Run with --execute after the parent approves monitoring integration."
  exit 0
fi
if [[ "$EUID" -ne 0 ]]; then
  printf '%s\n' "Run as root on the edge guest." >&2
  exit 1
fi
if ! ip -o -4 addr show | awk '{print $4}' | cut -d/ -f1 | grep -Fxq "$web_ip"; then
  printf '%s\n' "The configured exporter address is not assigned to this host." >&2
  exit 1
fi
if ss -ltn | awk 'NR > 1 {print $4}' | grep -Eq "(^|:)$web_ip:9113$|:9113$"; then
  printf '%s\n' "Port 9113 is already listening; refusing to replace an unknown service."
  exit 1
fi

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y prometheus-nginx-exporter nginx
exporter_bin=$(command -v prometheus-nginx-exporter || command -v nginx-prometheus-exporter || true)
if [[ -z "$exporter_bin" ]]; then
  printf '%s\n' "Nginx Prometheus exporter binary was not installed." >&2
  exit 1
fi

status_conf=/etc/nginx/conf.d/tnl-prometheus-status.conf
created_status_conf=0
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

install -d -m 0755 /etc/systemd/system/tnl-nginx-exporter.service.d
cat > /etc/systemd/system/tnl-nginx-exporter.service <<EOF
[Unit]
Description=TNL Nginx Prometheus Exporter
After=network-online.target nginx.service
Wants=network-online.target

[Service]
Type=simple
User=nobody
Group=nogroup
ExecStart=$exporter_bin --nginx.scrape-uri=http://127.0.0.1:8081/stub_status --web.listen-address=$web_ip:9113
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
  if [[ "$created_status_conf" -eq 1 ]]; then
    rm -f -- "$status_conf"
  fi
  exit 1
fi
systemd-analyze verify /etc/systemd/system/tnl-nginx-exporter.service
systemctl daemon-reload
systemctl reload nginx
systemctl enable --now tnl-nginx-exporter.service
curl --fail --silent --show-error --max-time 5 "http://$web_ip:9113/metrics" | grep -q '^nginx_up '
printf 'Nginx exporter is active on %s:9113. Restrict tailnet access to CT 117 using the existing ACL/firewall.\n' "$web_ip"
