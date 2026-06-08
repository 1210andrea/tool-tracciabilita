# TODO - Prompt FIX Tool-Tracciabilità

## Passo 1 - Analisi (già raccolto)
- Dashboard.tsx: filtri attuali (status + macchina) e tabella.
- CreateCase.tsx: priorità + assegnato a + payload (description/priority/assigned_to).
- AdminPanel.tsx: tab categorie unica e delete senza conferma.
- Backend: cases POST valida `body.solution` e inserisce `solution`/`ai_solution`.
- Backend: categories DELETE senza check referenziale.

## Stato
- [x] Step avviati: TODO creato


## Passo 2 - Dashboard
- [x] Rimuovere filtro “Tutti gli status”.
- [x] Aggiungere UI filtri: DATA (da/a), ORA (da/a), LINEA, OPERATORE, PROBLEMA, CAUSA.
- [x] Pulsanti APPLICA FILTRI e RESET.
- [ ] Dashboard: filtri Operatore/Problema/Causa come select (non input id) popolati da `/api/categories?type=...`.

- [x] Collegare i filtri ai nuovi parametri della GET /api/cases.

## Passo 3 - CreateCase
- [x] Rimuovere campo Priorità.
- [x] Rimuovere campo “Assegna a”.
- [x] Allineare payload con backend: invio `solution` = `description`.
- [x] Debug/validazione: errore chiaro su campo mancante.
- [ ] Verificare che il flusso AI Solution (manuale + AI) sia effettivamente mostrato in UI.

## Passo 4 - AdminPanel
- [ ] Rivisitare tab categorie in: OPERATORI | PROBLEMI | CAUSE (tab interne).
- [ ] Modal conferma prima di eliminare con testo “Sei sicuro di cancellare?”.
- [ ] Lista filtrata per type.

## Passo 5 - Backend categories delete referenziale
- [x] DELETE /api/categories/:id: check uso in cases su operator_id/problem_id/cause_id.
- [x] Se usato: 400 { error: "In uso da X casi" }
- [x] Se non usato: delete.

## Passo 6 - Backend cases validazione + filtri
- [x] POST /api/cases: validare campi obbligatori e messaggio chiaro.
- [x] GET /api/cases: filtri date_from/date_to, time_from/time_to, line, operator_id/problem_id/cause_id.

## Passo 7 - Test rapidi
- [x] Verificare creazione caso dall’UI.
- [x] Verificare filtri dashboard (almeno parzialmente).
- [ ] Verificare eliminazione categorie con errori corretti.

