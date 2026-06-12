# Machines App (Industrial Machine Trouble Management)

**Machines App** è una piattaforma web moderna per la gestione, la tracciabilità e l'analisi degli interventi di manutenzione su macchine e linee industriali. Integra un motore di Intelligenza Artificiale locale (Ollama) per suggerire soluzioni immediate in tempo reale agli operatori e analizzare lo storico dei guasti.

---

## 🚀 Stack Tecnologico

Il sistema è basato su un'architettura a microservizi containerizzata, pensata per garantire alte prestazioni, sicurezza e facilità di deployment:

*   **Frontend**: React (SPA) + TypeScript + Vite + TailwindCSS per una UI scura ed elegante + Recharts per i grafici interattivi.
*   **Backend**: Node.js + Express + TypeScript, con log strutturati gestiti da Winston.
*   **Database**: PostgreSQL per la persistenza dei dati e lo storico dei casi.
*   **Cache & Real-time**: Redis per caching/rate-limiting + Socket.io per gli aggiornamenti dei casi in tempo reale.
*   **Web Server / Proxy**: Nginx come reverse proxy con rate limiting, header di sicurezza avanzati e terminazione SSL/TLS.
*   **Intelligenza Artificiale**: Ollama (self-hosted) per l'elaborazione dei modelli LLM locali (es. Llama 3.1) a tutela della privacy dei dati industriali.
*   **Containerizzazione**: Docker e Docker Compose per una gestione semplificata in sviluppo e produzione.

---

## 🛠️ Funzionalità Principali

### 1. Registrazione Interventi (Scheda "Nuovo Caso")
*   **Ricerca Macchina Intelligente**: Input di testo autocompilante con menu di suggerimento a comparsa in tempo reale per selezionare rapidamente la macchina tramite codice o nome.
*   **Filtro Ricambi Dinamico**: Il campo "Pezzo di ricambio" si adatta dinamicamente mostrando solo i ricambi associati alla tipologia o al reparto della macchina selezionata.
*   **Campi Strutturati**: Compilazione guidata dei dettagli del fermo:
    *   **Problema** (es. Fettuccia inceppata, Sensore difettoso)
    *   **Causa** (es. Usura meccanica, Sporcizia)
    *   **Soluzione Applicata** (es. Sostituzione componente, Pulizia)
    *   **Note dell'Operatore** (campo di testo libero fino a 1000 caratteri)
*   **Assistente IA Real-time (Debounced)**: Durante la digitazione, l'IA genera una proposta di soluzione preliminare basata sui parametri selezionati.
*   **Generazione Soluzione IA Asincrona**: All'invio del caso, l'IA elabora in background un'analisi più profonda e salva il report finale nel database, aggiornando la pagina dell'utente via Socket.io senza ricaricare.

### 2. Dashboard & KPI Analitici
*   **Andamento Giornaliero**: Grafico interattivo del trend dei casi registrati nel tempo.
*   **Classifiche d'Impatto (Top 5/10/15)**:
    *   *Top Problemi per Linea*: Conteggio dei problemi suddivisi per linea produttiva.
    *   *Top Problemi*: I guasti registrati più frequentemente.
    *   *Top Cause*: Le cause primarie dei fermi macchina.
    *   *Top Macchine*: Le macchine più critiche con maggior numero di guasti.
    *   *Top Ricambi*: I componenti di ricambio più frequentemente utilizzati.
*   **Filtri Avanzati di Analisi**: Filtrazione istantanea di grafici e statistiche per macchina, problema, causa, linea produttiva, intervallo di date, fascia oraria di turno, anno o mese.

### 3. Storico Interventi & Esportazione
*   **Ricerca Avanzata e Paginazione**: Elenco dei casi con filtri granulari e navigazione paginata per gestire volumi elevati di dati.
*   **Esportazione CSV**: Esportazione istantanea in formato CSV di tutti i dati storici filtrati, ideale per analisi offline in Excel o BI tools.
*   **Dettaglio Intervento**: Pagina di dettaglio per ciascun caso contenente i metadati dell'operatore, della macchina, le soluzioni applicate, le note libere e il report finale generato dall'IA.

### 4. Strumenti di Analisi Storica IA
*   **Valutazione dei Casi Simili**: L'IA esamina lo storico del database confrontando i casi precedenti sulla stessa macchina o linea per lo stesso problema.
*   **Statistiche di Ricorrenza**: Calcolo automatico di:
    *   *Occorrenze dello stesso problema sulla stessa macchina*.
    *   *Occorrenze dello stesso problema sulla stessa linea produttiva*.
*   **Sintesi Operativa**: L'IA genera un report in italiano strutturato che descrive come il problema è stato risolto in passato e propone un piano operativo per il caso corrente basato su dati storici, avvisando in caso di dati insufficienti.

### 5. Gestione Master Data (Admin Panel)
*   **Gestione Macchine**: Inserimento, modifica ed eliminazione di macchine (codici, nomi, linee produttive, reparti e tipologie).
*   **Associazione Ricambi**: Associazione dei pezzi di ricambio alle tipologie di macchina supportate.
*   **Gestione Utenti**: Configurazione degli operatori, delle password e dei ruoli (Admin per il controllo completo e la gestione delle anagrafiche, User per la registrazione dei casi).
*   **Supporto LDAP/Active Directory**: Integrazione per l'autenticazione tramite server aziendali esterni.

---

## 📂 Struttura del Progetto

```
├── backend/                  # API Server (Node.js + Express + TypeScript)
│   ├── src/
│   │   ├── config/           # Configurazione env e logger
│   │   ├── middleware/       # Middleware di autenticazione e sicurezza
│   │   ├── routes/           # Endpoint dell'applicazione (auth, cases, ai, stats, etc.)
│   │   ├── services/         # Logica di business (Socket.io, integrazione Ollama)
│   │   └── index.ts          # Entry point backend
├── frontend/                 # React SPA (React + TypeScript + Vite + TailwindCSS)
│   ├── src/
│   │   ├── components/       # Componenti riutilizzabili (modali, grafici)
│   │   ├── context/          # Stato globale (Autenticazione)
│   │   ├── pages/            # Pagine (Dashboard, Nuovo Caso, Storico, Admin)
│   │   └── App.tsx           # Router e layout principale
├── nginx/                    # Reverse proxy Nginx e configurazione SSL/Security
├── scripts/                  # Script Bash/SQL per manutenzione e installazione
├── init.sql                  # Script SQL di inizializzazione Database (Schema + Seed)
├── docker-compose.dev.yml    # Orchestrazione container per sviluppo locale
└── docker-compose.prod.yml   # Orchestrazione container per l'ambiente di produzione
```

---

## ⚙️ Variabili d'Ambiente (`.env`)

Copia il file `.env.example` nominando il nuovo file `.env` ed imposta i parametri necessari:

| Variabile | Descrizione | Default / Esempio |
| :--- | :--- | :--- |
| **Database Config** | | |
| `DB_USER` | Nome utente del database PostgreSQL | `machines_user` |
| `DB_PASSWORD` | Password sicura del database | `change_me_secure_password` |
| `DATABASE_URL` | Stringa di connessione JDBC per PostgreSQL | `postgres://user:pass@postgres:5432/machines_db` |
| **Redis Config** | | |
| `REDIS_URL` | Stringa di connessione a Redis | `redis://redis:6379` |
| **JWT Config** | | |
| `JWT_SECRET` | Chiave segreta JWT per la firma degli access token | *Minimo 32 caratteri casuali* |
| `JWT_REFRESH_SECRET` | Chiave segreta JWT per i refresh token | *Minimo 32 caratteri casuali* |
| `JWT_EXPIRY` | Durata di validità dell'access token | `24h` |
| `JWT_REFRESH_EXPIRY` | Durata di validità del refresh token | `7d` |
| **Server Config** | | |
| `PORT` | Porta interna su cui gira il backend Express | `3001` |
| `NODE_ENV` | Ambiente d'esecuzione | `production` o `development` |
| `LOG_LEVEL` | Livello di log per Winston | `info` o `debug` |
| `CORS_ORIGIN` | Indirizzo IP/Dominio del frontend abilitato | `http://192.168.50.132` |
| **Frontend Config** | | |
| `VITE_API_URL` | Base path per le API (gestito da Nginx) | `/api` |
| **AI (Ollama) Config** | | |
| `AI_PROVIDER` | Provider di Intelligenza Artificiale | `ollama` |
| `AI_API_URL` | Indirizzo del container Ollama | `http://ollama:11434` |
| `AI_MODEL` | Modello da utilizzare per i suggerimenti | `llama3.1:8b` (o altri modelli compatibili) |
| `AI_TIMEOUT` | Timeout massimo in ms per l'elaborazione dei modelli | `120000` (2 minuti) |
| **LDAP Config (Opzionale)**| | |
| `LDAP_ENABLED` | Abilitazione autenticazione LDAP | `false` |
| `LDAP_SERVER` | URL del server LDAP | `ldap://domain.local` |
| `LDAP_BASE_DN` | Base DN per le query LDAP | `ou=Users,dc=domain,dc=local` |

---

## 🛠️ Setup e Avvio Rapido

### 1. Prerequisiti
*   Docker installato sul sistema ospitante.
*   Docker Compose abilitato.

### 2. Configurazione file d'ambiente
Crea una copia del file `.env.example` e denominala `.env`:
```bash
cp .env.example .env
```
*Modifica le chiavi segrete e configura l'indirizzo IP del server in `CORS_ORIGIN`.*

### 3. Avvio dei container (Produzione)
Esegui il comando di build e avvio in background:
```bash
docker compose -f docker-compose.prod.yml up -d --build
```
Questo avvierà automaticamente:
*   Il database **PostgreSQL** (configurato con `init.sql`).
*   La cache **Redis**.
*   Il **Backend API** (Node.js/Express).
*   Il **Frontend React** (compilato in produzione).
*   Il server **Nginx** come reverse proxy esterno.
*   Il motore **Ollama** per l'intelligenza artificiale locale.

### 4. Setup dell'Intelligenza Artificiale (Ollama)
Dopo aver avviato i container, è necessario scaricare localmente il modello LLM configurato in `.env` (ad esempio `llama3.1:8b`):

*   **Opzione A (Automatico)**: Esegui lo script incluso:
    ```bash
    chmod +x scripts/setup-ollama.sh
    ./scripts/setup-ollama.sh
    ```
*   **Opzione B (Manuale)**: Avvia il download direttamente nel container Ollama:
    ```bash
    docker exec -it machines_ollama ollama pull llama3.1:8b
    ```

### 5. Configurazione SSL (Certificati)
Nginx è configurato per puntare a `/etc/nginx/ssl/cert.pem` e `/etc/nginx/ssl/key.pem` all'interno del container.
*   Puoi generare certificati self-signed o configurare la cartella locale con quelli validi eseguendo:
    ```bash
    chmod +x scripts/init-ssl.sh
    ./scripts/init-ssl.sh
    ```
*   I file dei certificati devono essere salvati nella directory `nginx/ssl/` dell'host.

---

## 📂 Script di Utilità (`scripts/`)

La cartella `scripts/` contiene strumenti automatizzati per gestire l'applicazione:

*   `setup-ollama.sh`: Scarica e inizializza il modello LLM nel container Ollama.
*   `init-ssl.sh`: Genera i certificati SSL per il proxy Nginx.
*   `backup.sh`: Esegue un backup automatico a caldo (dump SQL) del database PostgreSQL.
*   `restore.sh`: Ripristina il database a partire da un file di dump precedentemente creato.
*   `diagnose-502.sh`: Effettua una scansione dello stato di salute dei container e della rete Docker per diagnosticare eventuali errori 502 (Bad Gateway).
*   `deploy.sh`: Script rapido per eseguire il pull dell'ultima versione del codice da git e riavviare i servizi.
