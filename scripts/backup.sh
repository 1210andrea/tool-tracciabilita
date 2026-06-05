#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
DATE="$(date +%Y%m%d_%H%M%S)"
DB_CONTAINER="${DB_CONTAINER:-machines_postgres}"
DB_USER="${DB_USER:-machines_user}"
DB_NAME="${DB_NAME:-machines_db}"

mkdir -p "${BACKUP_DIR}"

echo "Starting DB backup..."
docker exec "${DB_CONTAINER}" pg_dump -U "${DB_USER}" "${DB_NAME}" | gzip > "${BACKUP_DIR}/backup_${DATE}.sql.gz"

# Retention: keep last 30 days
find "${BACKUP_DIR}" -name "backup_*.sql.gz" -mtime +30 -delete

echo "Backup completed: ${BACKUP_DIR}/backup_${DATE}.sql.gz"

