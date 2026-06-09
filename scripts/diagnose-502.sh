#!/usr/bin/env bash
set -uo pipefail

echo "=== Diagnostica 502 Bad Gateway ==="
echo ""

echo "--- Stato container ---"
docker compose -f docker-compose.prod.yml ps 2>/dev/null || docker ps -a --filter "name=machines_"

echo ""
echo "--- Ultimi log frontend ---"
docker logs machines_frontend --tail 30 2>&1 || echo "(container frontend non trovato)"

echo ""
echo "--- Ultimi log backend ---"
docker logs machines_backend --tail 30 2>&1 || echo "(container backend non trovato)"

echo ""
echo "--- Ultimi log nginx ---"
docker logs machines_nginx --tail 15 2>&1 || echo "(container nginx non trovato)"

echo ""
echo "--- Test rete interna ---"
docker exec machines_nginx wget -qO- http://frontend:3000/ 2>&1 | head -c 200 && echo "" || echo "frontend:3000 NON raggiungibile"
docker exec machines_nginx wget -qO- http://backend:3001/health 2>&1 || echo "backend:3001 NON raggiungibile"

echo ""
echo "--- Riparazione rapida ---"
echo "Esegui: chmod +x scripts/deploy.sh && ./scripts/deploy.sh"
