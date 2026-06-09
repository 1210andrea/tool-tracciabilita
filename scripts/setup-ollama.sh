#!/usr/bin/env bash
set -e

MODEL="${AI_MODEL:-llama3.1:8b}"

echo "⏳ Attendo Ollama..."
for i in {1..30}; do
  if docker exec machines_ollama ollama list >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "📥 Download modello: $MODEL"
docker exec machines_ollama ollama pull "$MODEL"

echo "✅ Modelli installati:"
docker exec machines_ollama ollama list

echo ""
echo "Verifica dal backend:"
echo "  docker exec machines_backend node -e \"fetch('http://ollama:11434/api/tags').then(r=>r.json()).then(console.log)\""
