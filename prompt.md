Tu sei un assistente specializzato nel progetto Tool-Tracciabilità (React/TypeScript frontend + Node.js/Express backend, PostgreSQL database).

OBIETTIVO PRINCIPALE: SEPARARE COMPLETAMENTE OPERATORI DA UTENTI
=================================================================

ATTUALMENTE:
- Operatori sono legati agli Utenti
- Quando crei un utente ti chiede quale operatore associare
- Non è possibile avere operatori gestiti indipendentemente

DOPO IL REFACTORING:
- Operatori e Utenti sono ENTITÀ COMPLETAMENTE SEPARATE
- Un Utente NON DEVE avere un operatore obbligatorio
- Gli Operatori sono una lista indipendente gestita da admin
- Nella form "Crea Caso" si seleziona un operatore dal menu a tendina

---

TASK 0: REFACTORING DATABASE
=============================

1. Se esiste una colonna "operatore_id" o "operatore" nella tabella "users", ELIMINARLA completamente

2. Crea una nuova tabella "operatori" (se non esiste):
```sql
CREATE TABLE operatori (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(255) NOT NULL UNIQUE,
  attivo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

3. Nella tabella "casi", assicurati che esista:
```sql
ALTER TABLE casi ADD COLUMN operatore_id INTEGER REFERENCES operatori(id);
```

4. Se hai una tabella intermedia "user_operatori" o simile, ELIMINALA

5. Aggiungi alcuni operatori di default:
```sql
INSERT INTO operatori (nome, attivo) VALUES 
('Operatore 1', true),
('Operatore 2', true),
('Operatore 3', true);
```

---

TASK 1: MODIFICARE FORM CREAZIONE UTENTI (RIMUOVERE OPERATORE)
===============================================================

Nel Frontend (React component User Registration/Creation):

1. RIMUOVI completamente il campo "Operatore" dalla form
   - Cancella il SELECT che chiede l'operatore
   - Cancella la validazione che rendeva obbligatorio selezionare operatore
   - Cancella qualsiasi API call a /api/operatori durante la creazione utente

2. La form deve contenere SOLO:
   - Username
   - Email
   - Password
   - Nome Cognome (opzionale)
   - Ruolo (admin, user, etc.) - SE HAI UN SISTEMA DI RUOLI
   - Attivo (checkbox)

3. Il POST /api/users NON deve contenere il campo operatore

---

TASK 2: MODIFICARE BACKEND - CREAZIONE UTENTI
===============================================

Nel backend (Express):

1. Rotta POST /api/users (creazione utente):
   - RIMUOVI ogni logica che richiede operatore_id
   - RIMUOVI il validaton check su operatore_id
   - Accetta SOLO: username, email, password, nome, ruolo, attivo
   - Body di esempio:
   ```json
   {
     "username": "andrea_mario",
     "email": "andrea@example.com",
     "password": "securepass123",
     "nome": "Andrea",
     "cognome": "Rossi",
     "ruolo": "user",
     "attivo": true
   }
   ```

2. Rotta GET /api/users (lista utenti):
   - Ritorna gli utenti senza alcun campo "operatore"
   - Se c'è, rimuovi i JOIN con tabella operatori

3. Rotta GET /api/users/:id (dettagli utente):
   - Stessa cosa: niente operatore associato

---

TASK 3: CREARE CRUD OPERATORI SEPARATO
========================================

Nel backend (Express):

1. Crea una NUOVA rotta GET /api/operatori:
```javascript
GET /api/operatori
- Ritorna lista di tutti gli operatori attivi
- Response: [{id, nome, attivo, created_at}, ...]
- Deve essere accessibile da qualsiasi utente autenticato
```

2. Crea rotta POST /api/operatori (admin only):
```javascript
POST /api/operatori
- Richiede body: {nome, attivo: true/false}
- Verifica che 'nome' non sia già presente (UNIQUE)
- Salva il nuovo operatore
- Response: {id, nome, attivo, created_at}
```

3. Crea rotta PUT /api/operatori/:id (admin only):
```javascript
PUT /api/operatori/:id
- Richiede body: {nome, attivo}
- Valida che l'operatore esista
- Aggiorna
- Response: {id, nome, attivo, updated_at}
```

4. Crea rotta DELETE /api/operatori/:id (admin only):
```javascript
DELETE /api/operatori/:id
- Soft delete oppure hard delete (decidi tu)
- Se hard delete: first check che nessun 'caso' lo referenzia
- Response: {success: true, message: "Operatore eliminato"}
```

---

TASK 4: MODIFICARE FORM CREA CASO
==================================

Nel Frontend (component Crea Caso):

1. Aggiungi un nuovo SELECT field "Operatore":
   - Chiama GET /api/operatori al mount del component
   - Popola il menu con la lista di operatori
   - Rendi obbligatorio (validazione required)
   - Storage: nel state come "operatore_id"

2. Quando submitti la form (POST /api/casi):
   - Includi il campo operatore_id nel body
   ```json
   {
     "machina_name": "...",
     "problema": "...",
     "operatore_id": 5,  // <-- NUOVO
     "note": "..."
   }
   ```

---

TASK 5: AGGIUNGERE PAGINA GESTIONE OPERATORI (ADMIN)
====================================================

Nel Frontend, crea una nuova pagina/componente "Gestione Operatori":

1. Visualizza lista di tutti gli operatori (GET /api/operatori)
2. Aggiungi bottone "Nuovo Operatore" che apre una modal/form
3. Nella form:
   - Campo "Nome Operatore" (text input)
   - Checkbox "Attivo"
   - Bottone "Salva" (POST /api/operatori)
   - Bottone "Annulla"

4. Per ogni operatore in lista:
   - Mostra nome e stato (attivo/inattivo)
   - Bottone "Modifica" (apre form PUT /api/operatori/:id)
   - Bottone "Elimina" (DELETE /api/operatori/:id con conferma)

5. Aggiungi link a questa pagina nel menu admin

---

TASK 6: AGGIUNGERE LOGICA AI ALL'ANALISI (COME PRIMA)
========================================================

QUANDO L'UTENTE SELEZIONA MACCHINA + PROBLEMA NELLA PAGINA ANALISI IA:

1. Query il database con QUESTA PRIORITÀ:
   a) Cerca TUTTI i casi nel DB dove:
      - machine_name = [macchina selezionata]
      - problem_category = [problema selezionato]
      Estrai: soluzioni_applicate (risolte e non risolte), pezzi_ricambio, note_tecniche, operatori usati

   b) SE NON TROVI RISULTATI, ripeti per machine_line (linea della macchina) invece del nome

   c) Aggiungi anche i dati da "spare_parts_history" collegati a questa macchina/linea

2. Constructa un context per Ollama/Mistral così:
```
Database Context per Analisi IA:
Macchina: [nome_macchina] (Linea: [linea])
Problema Riportato: [problema]

STORICO SOLUZIONI APPLICATE:
- [soluzione 1] (Operatore: [nome]) → RISOLTIVA? [sì/no]
- [soluzione 2] (Operatore: [nome]) → RISOLTIVA? [sì/no]

PEZZI DI RICAMBIO USATI STORICAMENTE:
- [pezzo 1] - Note: [note]
- [pezzo 2] - Note: [note]

NOTE TECNICHE ACCUMULATE:
[tutte le note da casi precedenti di questa macchina/linea]

ISTRUZIONI: Analizza il problema alla luce di questo storico. Proponi soluzioni basate su
quello che ha funzionato prima. Se una soluzione non ha funzionato, spiega perché potrebbe
non funzionare di nuovo.
```

3. Invia questo context a Ollama (endpoint locale POST /api/ai-analysis)

---

TASK 7: DEBUGGARE ERRORE "ERRORE DURANTE L'ANALISI IA"
=======================================================

Nel backend, aggiungi logging dettagliato:

1. Endpoint POST /api/ai-analysis deve:
   a) Loggare il payload ricevuto (console.log con JSON.stringify)
   b) Loggare il response da Ollama (status, errore, testo completo)
   c) Fare error handling specifico:
      - Se timeout Ollama: "Ollama non risponde, verifica il servizio"
      - Se macchina non trovata: "Nessun storico trovato per questa macchina"
      - Se errore di parsing: "Errore nel parsing della risposta IA"
      - Se errore di connessione DB: "Errore nel caricamento dati dal database"
   d) Ritornare {success: false, error: "messaggio specifico", details: {...}}

2. Nel frontend, nel catch dell'IA analysis:
   - Log console.error con response.details
   - Mostra l'errore specifico (non generico)

3. Verifica:
   - Ollama è running su http://localhost:11434
   - Il modello 'mistral' è scaricato (ollama list)
   - La connessione da Express a Ollama non ha firewall issues

---

ORDINE DI IMPLEMENTAZIONE SUGGERITO:

1. Task 0 (Database) - PRIMO
2. Task 1 + 2 (Rimuovere operatore da utenti) - Quando crei utente non chiede più operatore
3. Task 3 (CRUD operatori) - Operatori gestiti indipendentemente
4. Task 5 (Pagina gestione operatori) - Admin può gestire operatori
5. Task 4 (Aggiungere operatore a form Crea Caso) - Ora quando crei caso seleziona operatore
6. Task 6 + 7 (Logica IA) - Con visibilità su errori specifici

---

PER OGNI FILE MODIFICATO:
- Mostra i PRIMA/DOPO con i cambiamenti evidenziati
- Spiega PERCHÉ il cambiamento è necessario
- Se aggiungi colonne DB, dammi lo script SQL esatto da eseguire