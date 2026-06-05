#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-your-domain.com}"
EMAIL="${EMAIL:-admin@${DOMAIN}}"
SSL_DIR="${SSL_DIR:-./nginx/ssl}"

mkdir -p "${SSL_DIR}"

docker run --rm -it \
  -v "$(pwd)/${SSL_DIR}:/etc/letsencrypt" \
  certbot/certbot certonly \
  --standalone \
  -d "${DOMAIN}" \
  --agree-tos \
  --email "${EMAIL}" \
  --non-interactive

echo "Certbot finished."

