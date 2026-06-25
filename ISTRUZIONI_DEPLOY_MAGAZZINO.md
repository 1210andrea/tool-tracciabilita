# Deploy: Gestione Magazzino Ricambi

## Cosa contiene questa feature

- **Magazzino ricambi**: giacenza, scorta minima, quantità di riordino per ogni pezzo
- **Ordini di riapprovvigionamento**: generazione automatica quando un pezzo va sotto scorta, ricezione parziale o totale, stampa PDF
- **Frontend**: pagine `/magazzino` e `/ordini` già operative
- **Backend**: tutti gli endpoint REST montati su `/api/spare-parts` e `/api/reorders`
- **PDF**: generato server-side con `pdfkit`

---

## Passi per il deploy

### 1. Applica la migration sul database

> Da eseguire **una sola volta** sul DB di produzione/dev.
> Il file è idempotente: puoi rieseguirlo senza danni se necessario.

```bash
# Opzione A — tramite Docker (il container DB deve essere in running)
docker exec -i <nome_container_postgres> \
  psql -U <POSTGRES_USER> -d <POSTGRES_DB> \
  < migration_magazzino_ricambi.sql

# Opzione B — da host con psql installato
psql -h localhost -U <POSTGRES_USER> -d <POSTGRES_DB> \
  -f migration_magazzino_ricambi.sql
```

Sostituisci `<nome_container_postgres>`, `<POSTGRES_USER>` e `<POSTGRES_DB>` 
con i valori del tuo `.env` (solitamente `postgres`, `postgres`, `machines_db`).

Per trovare il nome del container:
```bash
docker ps --format '{{.Names}}'
```

### 2. Riavvia il backend

```bash
# Dev
docker compose -f docker-compose.dev.yml restart backend

# Produzione
docker compose -f docker-compose.prod.yml restart backend
```

### 3. Verifica

Apri il browser su `/magazzino` (admin) e controlla che:
- La lista ricambi carichi con le colonne Giacenza, Scorta minima, Qtà riordino
- Il badge colorato (OK / Sotto scorta / Esaurito) sia visibile
- Il pulsante "Genera ordine" appaia se ci sono pezzi sotto scorta
- Su `/ordini` si possano aprire i dettagli e stampare il PDF

---

## Cosa fa la migration (riepilogo)

| Operazione | Dettaglio |
|---|---|
| `ALTER TABLE spare_parts` | Aggiunge `codice`, `quantita`, `scorta_minima`, `qty_riordino`, `updated_at` |
| Rename automatico | Se esiste il vecchio campo `quantita_riordino` lo rinomina in `qty_riordino` |
| `CREATE TABLE reorders` | Testata ordine: numero progressivo, status, note, created_by |
| `CREATE TABLE reorder_items` | Righe ordine: collegata a `spare_parts` via FK, quantità ordinata/ricevuta |
| `refresh_reorder_status()` | Funzione PL/pgSQL chiamata dal backend per aggiornare lo status dell'ordine dopo ogni ricezione parziale |
| Trigger `updated_at` | Aggiornamento automatico del timestamp su tutte e 3 le tabelle |

---

## Note

- Il campo **`qty_riordino`** in `spare_parts` è la quantità che viene inserita automaticamente nell'ordine quando si clicca "Genera ordine automatico".
- La **ricezione parziale** aggiorna direttamente la giacenza in `spare_parts.quantita` solo per il delta positivo (quanti pezzi in più sono arrivati rispetto alla volta prima).
- Il **PDF** è generato lato server con `pdfkit` già installato in `backend/package.json`. Non serve nessuna dipendenza aggiuntiva.
