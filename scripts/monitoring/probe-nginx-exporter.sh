#!/usr/bin/env bash
set -euo pipefail

expect=""
web_ip="100.102.105.77"
for argument in "$@"; do
  case "$argument" in
    --expect-up) expect="up" ;;
    --expect-denied) expect="denied" ;;
    --web-ip=*) web_ip=${argument#*=} ;;
    *) printf '%s\n' "Unknown argument." >&2; exit 2 ;;
  esac
done

if [[ "$web_ip" != "100.102.105.77" || ( "$expect" != "up" && "$expect" != "denied" ) ]]; then
  printf '%s\n' "A supported probe mode and the known CT 102 address are required." >&2
  exit 2
fi

if [[ "$expect" == "up" ]]; then
  metrics=$(curl --fail --silent --show-error --max-time 4 "http://$web_ip:9113/metrics")
  awk '/^nginx_up / { found = 1 } END { exit !found }' <<<"$metrics"
  printf '%s\n' "The CT 117 allowlisted scrape returned nginx_up."
else
  status=$(curl --silent --show-error --max-time 4 --output /dev/null --write-out '%{http_code}' "http://$web_ip:9113/metrics")
  if [[ "$status" != "403" ]]; then
    printf 'Expected HTTP 403 from this guest; received HTTP %s.\n' "$status" >&2
    exit 1
  fi
  printf '%s\n' "The CT 102 metrics proxy rejected this non-monitoring guest with HTTP 403."
fi
