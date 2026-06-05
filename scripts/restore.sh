#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
DB_CONTAINER="${DB_CONTAINER:-machines_postgres}"
DB_USER="${DB_USER:-machines_user}"
DB_NAME="${DB_NAME:-machines_db}"

if [[ $# -ge 1 ]]; then
  BACKUP_FILE="$1"
else
  BACKUP_FILE="$(ls -1t ${BACKUP_DIR}/backup_*.sql.gz | head -n 1)"
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

echo "Restoring from: ${BACKUP_FILE}"

docker exec -i "${DB_CONTAINER}" sh -c "gunzip -c | psql -U '${DB_USER}' '${DB_NAME}'" < "${BACKUP_FILE}"

echo "Restore completed."

