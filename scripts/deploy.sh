#!/usr/bin/env bash
set -e

echo "🚀 Deployment started..."

git pull origin main

docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d

echo "⏳ Waiting backend health..."
for i in {1..30}; do
  if curl -fsS http://localhost/health 2>/dev/null || curl -fsS https://localhost/health 2>/dev/null; then
    echo "✅ Backend healthy."
    exit 0
  fi
  sleep 2
done

echo "❌ Health check failed."
exit 1

