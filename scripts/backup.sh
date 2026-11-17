#!/usr/bin/env bash
# Daily backup of the TNL Studio database and uploaded media.
# Keeps the last 14 days. Run nightly with cron:
#   0 2 * * *  /app/scripts/backup.sh >> /var/log/tnl-backup.log 2>&1
#
# Restore:
#   mongorestore --uri="$MONGO_URL" --drop --archive=/app/backups/db-YYYY-MM-DD.archive --gzip
#   tar -xzf /app/backups/media-YYYY-MM-DD.tar.gz -C /
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/app/backups}"
STAMP="$(date +%F)"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

# shellcheck disable=SC1091
set -a; [ -f /app/backend/.env ] && . /app/backend/.env; set +a
MEDIA_DIR="${MEDIA_DIR:-/app/backend/media}"

mkdir -p "$BACKUP_DIR"

echo "[$(date -Is)] backing up database ${DB_NAME}…"
mongodump --uri="${MONGO_URL}" --db="${DB_NAME}" --archive="${BACKUP_DIR}/db-${STAMP}.archive" --gzip

echo "[$(date -Is)] backing up media from ${MEDIA_DIR}…"
if [ -d "$MEDIA_DIR" ]; then
  tar -czf "${BACKUP_DIR}/media-${STAMP}.tar.gz" "$MEDIA_DIR"
else
  echo "  (no media directory yet — skipped)"
fi

echo "[$(date -Is)] pruning backups older than ${RETENTION_DAYS} days…"
find "$BACKUP_DIR" -name 'db-*.archive' -mtime "+${RETENTION_DAYS}" -delete
find "$BACKUP_DIR" -name 'media-*.tar.gz' -mtime "+${RETENTION_DAYS}" -delete

echo "[$(date -Is)] backup complete: ${BACKUP_DIR}"
