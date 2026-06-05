# Machines App (Industrial Machine Trouble Management)

App web per la gestione dei problemi e manutenzione di macchine industriali.

## Stack
- Frontend: React + TypeScript + TailwindCSS + Recharts
- Backend: Node.js + Express + TypeScript
- Database: PostgreSQL
- Cache/Real-time: Redis + Socket.io
- Web Server: Nginx (reverse proxy + SSL)
- Container: Docker + Docker Compose
- AI: Ollama (self-hosted) oppure Hugging Face API (futuro)
- Auth: JWT + opzionale LDAP/AD
- Logging: Winston
- Monitoraggio: `GET /health` + `GET /metrics` (base)

## Struttura
- `backend/` server API
- `frontend/` web app
- `nginx/` reverse proxy + rate limiting + security headers
- `scripts/` backup/restore/deploy/ssl

## Setup rapido (produzione)
1. Imposta variabili d'ambiente in `.env` (copia da `.env.example`).
2. Avvia:
   - `docker compose -f docker-compose.prod.yml up -d --build`
3. Verifica:
   - `https://<dominio>/health`

## Note SSL
- La config Nginx punta a `/etc/nginx/ssl/cert.pem` e `/etc/nginx/ssl/key.pem`.
- Genera certificati con `scripts/init-ssl.sh` e rendili disponibili in `nginx/ssl/`.

