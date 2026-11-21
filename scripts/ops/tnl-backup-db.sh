#!/usr/bin/env bash
# /usr/local/bin/tnl-backup-db.sh
# Automated MongoDB Backup with gzip compression and 14-day safe rotation for CT 116 (labtnl-db)
set -euo pipefail

BACKUP_DIR="/var/backups/tnl/db"
DATABASE="tnl"
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/tnl-db-${TIMESTAMP}.archive.gz"
LATEST_LINK="${BACKUP_DIR}/latest.archive.gz"
MIN_KEEP=3
MAX_DAYS=14

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

echo "[$(date -Iseconds)] Starting MongoDB backup for database: '${DATABASE}'"

# 1. Execute mongodump with gzip compression
mongodump --db "${DATABASE}" --gzip --archive="${BACKUP_FILE}"

# 2. Strict Integrity Verification
if [ ! -s "${BACKUP_FILE}" ]; then
    echo "[$(date -Iseconds)] [ERROR] Backup archive is missing or empty: ${BACKUP_FILE}" >&2
    rm -f "${BACKUP_FILE}"
    exit 1
fi

if ! gzip -t "${BACKUP_FILE}"; then
    echo "[$(date -Iseconds)] [ERROR] Backup archive failed gzip integrity check: ${BACKUP_FILE}" >&2
    rm -f "${BACKUP_FILE}"
    exit 1
fi

chmod 600 "${BACKUP_FILE}"

# 3. Update 'latest' symlink atomically
ln -sfn "${BACKUP_FILE}" "${LATEST_LINK}"

FILE_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "[$(date -Iseconds)] [SUCCESS] Backup verified successfully. Size: ${FILE_SIZE}. Path: ${BACKUP_FILE}"

# 4. Safe 14-day rotation (always preserving at least MIN_KEEP files)
TOTAL_FILES=$(find "${BACKUP_DIR}" -maxdepth 1 -name "tnl-db-*.archive.gz" | wc -l)
if [ "${TOTAL_FILES}" -gt "${MIN_KEEP}" ]; then
    echo "[$(date -Iseconds)] Running safe prune for backups older than ${MAX_DAYS} days..."
    # Find candidates older than MAX_DAYS
    OLD_CANDIDATES=$(find "${BACKUP_DIR}" -maxdepth 1 -name "tnl-db-*.archive.gz" -mtime +"${MAX_DAYS}" | sort)
    for f in ${OLD_CANDIDATES}; do
        # Recount before each deletion
        CURRENT_COUNT=$(find "${BACKUP_DIR}" -maxdepth 1 -name "tnl-db-*.archive.gz" | wc -l)
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
tnl_backup_last_timestamp_seconds{type="mongodb",target="ct_116"} ${BACKUP_EPOCH}
# HELP tnl_backup_size_bytes Size of last successful backup archive in bytes
# TYPE tnl_backup_size_bytes gauge
tnl_backup_size_bytes{type="mongodb",target="ct_116"} ${BACKUP_BYTES}
# HELP tnl_backup_success Status of last backup operation (1 = success, 0 = failed)
# TYPE tnl_backup_success gauge
tnl_backup_success{type="mongodb",target="ct_116"} 1
EOF
mv "${PROM_FILE}.tmp" "${PROM_FILE}"

echo "[$(date -Iseconds)] Backup operation finished cleanly."
