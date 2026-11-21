#!/usr/bin/env bash
# /usr/local/bin/tnl-backup-media.sh
# Automated Media & Uploads Backup with 14-day safe rotation for CT 103 (labtnl-app)
set -euo pipefail

BACKUP_DIR="/var/backups/tnl/media"
SOURCE_DIR="/opt/tnl/media"
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/tnl-media-${TIMESTAMP}.tar.gz"
LATEST_LINK="${BACKUP_DIR}/latest.tar.gz"
MIN_KEEP=3
MAX_DAYS=14

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

echo "[$(date -Iseconds)] Starting media backup from '${SOURCE_DIR}'"

if [ ! -d "${SOURCE_DIR}" ]; then
    echo "[$(date -Iseconds)] [ERROR] Source media directory does not exist: ${SOURCE_DIR}" >&2
    exit 1
fi

# 1. Archive media directory
tar -czf "${BACKUP_FILE}" -C "/opt/tnl" "media"

# 2. Strict Integrity Check
if [ ! -s "${BACKUP_FILE}" ]; then
    echo "[$(date -Iseconds)] [ERROR] Backup archive is missing or empty: ${BACKUP_FILE}" >&2
    rm -f "${BACKUP_FILE}"
    exit 1
fi

if ! tar -tzf "${BACKUP_FILE}" > /dev/null 2>&1; then
    echo "[$(date -Iseconds)] [ERROR] Backup archive failed tar integrity check: ${BACKUP_FILE}" >&2
    rm -f "${BACKUP_FILE}"
    exit 1
fi

chmod 600 "${BACKUP_FILE}"

# 3. Update 'latest' symlink atomically
ln -sfn "${BACKUP_FILE}" "${LATEST_LINK}"

FILE_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "[$(date -Iseconds)] [SUCCESS] Media backup verified successfully. Size: ${FILE_SIZE}. Path: ${BACKUP_FILE}"

# 4. Safe 14-day rotation (always preserving at least MIN_KEEP files)
TOTAL_FILES=$(find "${BACKUP_DIR}" -maxdepth 1 -name "tnl-media-*.tar.gz" | wc -l)
if [ "${TOTAL_FILES}" -gt "${MIN_KEEP}" ]; then
    echo "[$(date -Iseconds)] Running safe prune for backups older than ${MAX_DAYS} days..."
    OLD_CANDIDATES=$(find "${BACKUP_DIR}" -maxdepth 1 -name "tnl-media-*.tar.gz" -mtime +"${MAX_DAYS}" | sort)
    for f in ${OLD_CANDIDATES}; do
        CURRENT_COUNT=$(find "${BACKUP_DIR}" -maxdepth 1 -name "tnl-media-*.tar.gz" | wc -l)
        if [ "${CURRENT_COUNT}" -gt "${MIN_KEEP}" ]; then
            echo "[$(date -Iseconds)] Pruning expired backup: $f"
            rm -f "$f"
        else
            echo "[$(date -Iseconds)] Minimum threshold of ${MIN_KEEP} backups reached. Stopping prune."
            break
        fi
    done
else
    echo "[$(date -Iseconds)] Only ${TOTAL_FILES} backup(s) present (threshold: ${MIN_KEEP}). No prune necessary."
fi

# 5. Export metrics for Prometheus node_exporter textfile collector
PROM_FILE="/var/lib/prometheus/node-exporter/tnl_backup.prom"
mkdir -p "$(dirname "${PROM_FILE}")"
BACKUP_EPOCH=$(stat -c %Y "${BACKUP_FILE}")
BACKUP_BYTES=$(stat -c %s "${BACKUP_FILE}")
cat <<EOF > "${PROM_FILE}.tmp"
# HELP tnl_backup_last_timestamp_seconds Timestamp of last successful backup in unix epoch seconds
# TYPE tnl_backup_last_timestamp_seconds gauge
tnl_backup_last_timestamp_seconds{type="media",target="ct_103"} ${BACKUP_EPOCH}
# HELP tnl_backup_size_bytes Size of last successful backup archive in bytes
# TYPE tnl_backup_size_bytes gauge
tnl_backup_size_bytes{type="media",target="ct_103"} ${BACKUP_BYTES}
# HELP tnl_backup_success Status of last backup operation (1 = success, 0 = failed)
# TYPE tnl_backup_success gauge
tnl_backup_success{type="media",target="ct_103"} 1
EOF
mv "${PROM_FILE}.tmp" "${PROM_FILE}"

echo "[$(date -Iseconds)] Media backup operation finished cleanly."
