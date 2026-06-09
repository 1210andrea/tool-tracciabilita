#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Deployment started..."

if [ ! -f .env ]; then
  echo "❌ File .env mancante. Copia .env.example in .env e configuralo."
  exit 1
fi

git pull origin main

echo "📦 Build immagini..."
docker compose -f docker-compose.prod.yml build --no-cache frontend backend

echo "🗄️  Migrazione database (idempotente)..."
set -a && source .env && set +a
docker compose -f docker-compose.prod.yml up -d postgres
sleep 3
docker exec -i machines_postgres psql -U "${DB_USER}" -d machines_db < scripts/migrate-refinement.sql || true

echo "🔄 Riavvio servizi (senza cancellare i volumi)..."
docker compose -f docker-compose.prod.yml up -d --remove-orphans

echo "⏳ Attendo avvio..."
for i in {1..45}; do
  if curl -fsS http://localhost/health >/dev/null 2>&1; then
    echo "✅ Deploy completato. Health OK."
    docker compose -f docker-compose.prod.yml ps
    exit 0
  fi
  sleep 2
done

echo "❌ Health check fallito. Log utili:"
docker compose -f docker-compose.prod.yml ps
docker logs machines_frontend --tail 40 2>&1 || true
docker logs machines_backend --tail 40 2>&1 || true
docker logs machines_nginx --tail 20 2>&1 || true
exit 1
