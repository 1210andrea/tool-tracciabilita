# TODO - machines-app

## Step 1 — Scaffold progetto
- [x] Crea cartelle: `backend/`, `frontend/`, `nginx/`, `scripts/`
- [x] Aggiungi file root: `docker-compose.prod.yml`, `docker-compose.dev.yml`, `.env.example`, `.env.production`, `init.sql`, `README.md`

## Step 2 — Nginx
- [x] Crea `nginx/Dockerfile`
- [x] Crea `nginx/nginx.conf` con rate limiting, gzip, security headers, websocket, health proxy

## Step 3 — Backend (Express + TS)
- [x] `backend/package.json`, `tsconfig.json`, `Dockerfile`
- [x] Config env validation (`src/config/env.ts`)
- [x] Winston logger (`src/config/logger.ts`)
- [x] Middleware: rate limiter, request logger, error handler
- [x] Auth JWT (LDAP opzionale via `ldapService.ts`) 
- [x] Routes: auth, machines, categories, cases, dashboard, stats, health(/health e /metrics)
- [x] Services: dbService, redisService, aiService (Ollama), ldapService (opzionale)
- [x] Socket.io: setup server (evento placeholder)

## Step 4 — Database schema
- [x] Scrivere `init.sql` con schema completo (users, machines, categories, cases, events)

## Step 5 — Frontend (React + TS + Tailwind + Recharts)
- [x] `frontend/package.json`, `vite.config.ts`, `Dockerfile`
- [x] AuthContext + hooks + protected routing
- [x] UI pagine: Login, Dashboard, CreateCase, AdminPanel
- [ ] Componenti: CaseForm, CaseList, charts avanzati, filterbar

## Step 6 — AI (Ollama)
- [x] Implementare ping in `aiService.ts`
- [ ] Endpoint API backend per generazione testo (integrazione reale)

## Step 7 — Scripts
- [x] `scripts/backup.sh`
- [x] `scripts/restore.sh`
- [x] `scripts/deploy.sh`
- [x] `scripts/init-ssl.sh`

## Step 8 — Docker Compose
- [x] `docker-compose.prod.yml` (nginx+frontend+backend+postgres+redis+ollama)
- [x] `docker-compose.dev.yml` (volumi + dev mode)
- [ ] Verifiche healthcheck e reti/volumi + fix compose env substitution

## Step 9 — Test rapido
- [ ] `docker compose -f docker-compose.prod.yml up -d --build`
- [ ] Verificare /health, /metrics, login, CRUD case
- [ ] Verificare websocket (socket.io) e charts

## Step 10 — Finishing
- [ ] Aggiornare `README.md` con istruzioni complete e note SSL/cert paths


