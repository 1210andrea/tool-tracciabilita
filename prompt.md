# Prompt per Cursor - Tool Tracciabilità - BUGFIX & REFINEMENT

## 🐛 BUG & ISSUES DA SISTEMARE

---

## 1. GRAFICO "PROBLEMI PER LINEA" - AGGIUNGERE FILTRO TOP X

File: `frontend/src/pages/Dashboard.tsx`

**PROBLEMA:** Il grafico "Problemi per Linea" non ha il selector "Top 5/10/15" come gli altri grafici.

**SOLUZIONE:**
```jsx
// Nel componente del grafico "Problemi per Linea"
// Aggiungi sopra il grafico:
<div className="flex justify-between items-center mb-4">
  <h3 className="text-lg font-semibold">Problemi per Linea</h3>
  <select 
    value={topProblemiLinea} 
    onChange={(e) => setTopProblemiLinea(Number(e.target.value))}
    className="px-3 py-1 rounded-md bg-slate-700 text-white"
  >
    <option value={5}>Top 5</option>
    <option value={10}>Top 10</option>
    <option value={15}>Top 15</option>
  </select>
</div>

// Modifica la query API:
GET /api/stats/problems-by-line?limit=${topProblemiLinea}&...
```

---

## 2. CREAZIONE MACCHINE - TOGLIERE MENÙ A TENDINA

File: `frontend/src/components/AdminPanel.tsx` (tab Macchine)

**PROBLEMA:** Nel form di creazione macchine c'è un menù a tendina "Tipo" che non serve.

**SOLUZIONE:**
Rimuovi completamente il campo:
```jsx
// TOGLI QUESTO CAMPO:
<select value={tipoMacchina} onChange={...}>
  <option>generico</option>
  ...
</select>

// Il form deve avere SOLO:
- Codice macchina (text)
- Nome macchina (text)
- Linea (text)
- [AGGIUNGI MACCHINA]
```

---

## 3. PEZZI DI RICAMBIO - TOGLIERE DROPDOWN, AGGIUNGERE CAMPO "TIPO"

### 3A. DATABASE SCHEMA CHANGES

File: `init.sql`

**Attuale (SBAGLIATO):**
```sql
CREATE TABLE spare_parts (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL,
  description TEXT
);
```

**Nuovo (CORRETTO):**
```sql
-- Tabella pezzi di ricambio
CREATE TABLE IF NOT EXISTS spare_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabella tipo di ricambio (es. "Generico", "Specifico", ecc)
CREATE TABLE IF NOT EXISTS spare_part_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spare_part_id UUID NOT NULL REFERENCES spare_parts(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL,  -- Deve corrispondere a machine.reparto
  UNIQUE(spare_part_id, type)
);

-- Indici
CREATE INDEX idx_spare_parts_type ON spare_part_types(type);
CREATE INDEX idx_spare_parts_spare_part ON spare_part_types(spare_part_id);
```

### 3B. BACKEND ROUTES

File: `backend/src/routes/spareparts.ts`

**Modifica POST /api/spare-parts:**
```typescript
POST /api/spare-parts
  Body: { 
    name: string, 
    description: string,
    types: string[]  // array di tipi/reparti, es: ["Generico", "Specifico"]
  }
  
  // Logica:
  1. Crea record in spare_parts
  2. Per ogni tipo in types[], crea record in spare_part_types
  3. Ritorna { id, name, types }
```

**Aggiungi GET /api/spare-parts/by-type/:type:**
```typescript
GET /api/spare-parts/by-type/:type
  Response: {
    spareparts: [
      { id, name, description, types: [...] },
      ...
    ]
  }
```

**Modifica DELETE /api/spare-parts/:id:**
```typescript
DELETE /api/spare-parts/:id
  // Controllo referenziale:
  1. Controlla se il pezzo è usato in qualche caso
  2. Se usato: return 400 { error: "In uso da X casi" }
  3. Se non usato: delete sia da spare_parts che da spare_part_types
  4. Chiedi conferma con modal
```

### 3C. FRONTEND - FORM PEZZI DI RICAMBIO

File: `frontend/src/components/AdminPanel.tsx` (tab Ricambi e Soluzioni)

**TOGLI il menù a tendina "Tipo"**

**NUOVO FORM:**
```jsx
<div className="mb-6">
  <h3>Nuovo pezzo di ricambio</h3>
  
  <input 
    type="text" 
    placeholder="Nome ricambio" 
    value={nomeRicambio}
    onChange={...}
  />
  
  <textarea 
    placeholder="Descrizione (opzionale)" 
    value={descrizioneRicambio}
    onChange={...}
  />
  
  <label>Tipi/Reparti (seleziona uno o più):</label>
  <div className="flex flex-wrap gap-2">
    {repartiMacchine.map(reparto => (
      <label key={reparto} className="flex items-center gap-2">
        <input 
          type="checkbox" 
          checked={tipiRicambio.includes(reparto)}
          onChange={(e) => {
            if (e.target.checked) {
              setTipiRicambio([...tipiRicambio, reparto]);
            } else {
              setTipiRicambio(tipiRicambio.filter(t => t !== reparto));
            }
          }}
        />
        {reparto}
      </label>
    ))}
  </div>
  
  <button onClick={handleAggiungiRicambio}>
    Aggiungi ricambio
  </button>
</div>

// Lista pezzi:
{ricambi.map(ricambio => (
  <div key={ricambio.id} className="border p-3 rounded mb-2">
    <h4>{ricambio.name}</h4>
    <p className="text-sm">{ricambio.description}</p>
    <p className="text-xs text-gray-400">
      Tipi: {ricambio.types.join(", ")}
    </p>
    <button onClick={() => handleEliminaRicambio(ricambio.id)} className="bg-red-600">
      Elimina
    </button>
  </div>
))}
```

---

## 4. CREAZIONE CASO - RICAMBI DINAMICI PER TIPO MACCHINA

### 4A. DATABASE - MACCHINE CON REPARTO

Ogni macchina ha un "reparto" che corrisponde ai "tipi" dei pezzi di ricambio.

```sql
-- Modifica tabella machines (se non già fatto)
ALTER TABLE machines ADD COLUMN reparto VARCHAR(100);

-- Esempio:
UPDATE machines SET reparto = 'Generico' WHERE name = 'SIMM45';
UPDATE machines SET reparto = 'Specifico' WHERE name = 'SIMM47';
```

### 4B. FRONTEND - FORM NUOVO CASO

File: `frontend/src/pages/CreateCase.tsx`

**Logica:**
```jsx
const [macchinaSelezionata, setMacchinaSelezionata] = useState(null);
const [ricambiDisponibili, setRicambiDisponibili] = useState([]);

// Quando scegli macchina:
const handleMacchinaChange = async (machineId) => {
  setMacchinaSelezionata(machineId);
  
  // Ottieni il reparto della macchina
  const machine = macchine.find(m => m.id === machineId);
  const reparto = machine.reparto;
  
  // Carica i ricambi del tipo corrispondente
  const response = await fetch(`/api/spare-parts/by-type/${reparto}`);
  const data = await response.json();
  setRicambiDisponibili(data.spareparts);
};

// Nel form:
<select onChange={(e) => handleMacchinaChange(e.target.value)}>
  <option>Seleziona macchina</option>
  {macchine.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
</select>

<select value={ricambioSelezionato} onChange={(e) => setRicambioSelezionato(e.target.value)}>
  <option>Seleziona pezzo di ricambio</option>
  {ricambiDisponibili.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
</select>
```

---

## 5. BUG: CREAZIONE CASO CARICA ALL'INFINITO

### PROBLEMA IDENTIFICATO:
La creazione caso è lenta perché:
1. **Ollama è lenta** (15-30 secondi la prima volta)
2. **Nessun feedback dell'utente** durante l'attesa

### SOLUZIONE:

**Backend - Rendi l'API asincrona:**
File: `backend/src/routes/cases.ts`

```typescript
POST /api/cases
  // VECCHIO: attende che Ollama finisca, poi ritorna
  // NUOVO: crea il caso, genera AI in background, ritorna subito
  
  try {
    // 1. Crea il caso nel DB (senza aspettare AI)
    const newCase = await db.query(
      'INSERT INTO cases (...) VALUES (...) RETURNING *'
    );
    
    // 2. Ritorna subito al client
    res.json({ 
      id: newCase.id, 
      status: 'created',
      ai_status: 'generating'  // Indica che l'AI è in generazione
    });
    
    // 3. Genera AI Solution in BACKGROUND (async)
    generateAISolution(newCase.id).catch(err => {
      logger.error('AI generation failed', err);
    });
    
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
```

**Frontend - Mostra stato durante l'attesa:**
File: `frontend/src/pages/CreateCase.tsx`

```jsx
const [isLoading, setIsLoading] = useState(false);
const [caseCreated, setCaseCreated] = useState(null);
const [aiStatus, setAiStatus] = useState(null); // 'generating', 'ready'

const handleCreaCaso = async () => {
  setIsLoading(true);
  
  try {
    const response = await fetch('/api/cases', {
      method: 'POST',
      body: JSON.stringify({...datiCaso})
    });
    
    const result = await response.json();
    setCaseCreated(result);
    setAiStatus(result.ai_status); // 'generating'
    
    // Mostra feedback all'utente
    toast.success('Caso creato! La soluzione IA è in generazione...');
    
    // Polling per controllare se l'AI è finita
    const checkAIInterval = setInterval(async () => {
      const checkResponse = await fetch(`/api/cases/${result.id}`);
      const updatedCase = await checkResponse.json();
      
      if (updatedCase.ai_solution) {
        setAiStatus('ready');
        setAiSolution(updatedCase.ai_solution);
        clearInterval(checkAIInterval);
        toast.success('Soluzione IA generata!');
      }
    }, 2000); // Controlla ogni 2 secondi
    
  } catch (err) {
    toast.error(err.message);
  } finally {
    setIsLoading(false);
  }
};

// Nel JSX:
{isLoading && <p>⏳ Creando caso...</p>}
{caseCreated && (
  <div>
    <p>✅ Caso creato: {caseCreated.id}</p>
    {aiStatus === 'generating' && (
      <p>⏳ Generando soluzione IA (può impiegare fino a 30 secondi)...</p>
    )}
    {aiStatus === 'ready' && (
      <div>
        <h3>Soluzione IA:</h3>
        <p>{aiSolution}</p>
      </div>
    )}
  </div>
)}
```

---

## 6. UI & RESPONSIVE IMPROVEMENTS

### 6A. PADDING & SPACING CONSISTENCY

Verifica che tutti i component abbiano padding consistente:
```jsx
// Card standard:
className="bg-slate-800 rounded-lg p-4 border border-slate-700"

// Form input standard:
className="w-full px-3 py-2 rounded-md bg-slate-700 border border-slate-600 text-white focus:outline-none focus:border-cyan-500"

// Button standard:
className="px-4 py-2 rounded-md bg-cyan-600 hover:bg-cyan-700 text-white transition-colors"
```

### 6B. MOBILE RESPONSIVENESS

Controlla tutti i breakpoint:
```jsx
// Griglia responsive:
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"

// Form 2 colonne su desktop, 1 su mobile:
className="grid grid-cols-1 lg:grid-cols-2 gap-4"

// Tabelle: scroll orizzontale su mobile
className="overflow-x-auto"
```

### 6C. MODAL DI CONFERMA ELIMINAZIONE

Aggiungi a TUTTI i button elimina:
```jsx
const handleElimina = (id) => {
  const confirmed = window.confirm('Sei sicuro di voler eliminare?');
  if (confirmed) {
    // Fai la delete
  }
};

// Oppure modal custom:
<Modal isOpen={showConfirm} onClose={() => setShowConfirm(false)}>
  <h3>Eliminare questo elemento?</h3>
  <p>Questa azione non può essere annullata.</p>
  <button onClick={handleConfirmDelete} className="bg-red-600">Sì, elimina</button>
  <button onClick={() => setShowConfirm(false)}>Annulla</button>
</Modal>
```

### 6D. LOADING STATES

Aggiungi spinner/skeleton loading su:
- Grafici (mentre caricano dati)
- Dropdown (mentre caricano opzioni)
- Button (durante submit)

```jsx
// Skeleton loader:
{isLoading ? <SkeletonLoader /> : <Chart data={data} />}

// Button loading state:
<button disabled={isLoading}>
  {isLoading ? '⏳ Caricando...' : 'Aggiungi'}
</button>
```

### 6E. VALIDAZIONE FORM

Aggiungi validazione lato client:
```jsx
const validateForm = () => {
  if (!macchinaSelezionata) {
    toast.error('Seleziona una macchina');
    return false;
  }
  if (!problemaSelezionato) {
    toast.error('Seleziona un problema');
    return false;
  }
  return true;
};

const handleSubmit = (e) => {
  e.preventDefault();
  if (!validateForm()) return;
  // Procedi con submit
};
```

---

## 📝 CHECKLIST IMPLEMENTAZIONE

- [ ] Grafico "Problemi per linea" - aggiungere selector top X
- [ ] Admin macchine - togliere dropdown "tipo"
- [ ] Pezzi di ricambio - togliere dropdown tipo, aggiungere checkbox per tipi
- [ ] Database - creare relazione many-to-many spare_part_types
- [ ] Backend API - aggiungere /api/spare-parts/by-type/:type
- [ ] Backend - rendere asincrona la generazione AI Solution
- [ ] Frontend - implementare ricambi dinamici quando scegli macchina
- [ ] Frontend - aggiungere polling per controllare stato AI
- [ ] Frontend - migliorare feedback utente durante creazione caso
- [ ] UI - rendere responsive con breakpoint md/lg/xl
- [ ] UI - aggiungere modal di conferma su tutti i delete
- [ ] UI - aggiungere loading state su grafici e button
- [ ] Validazione - form validation lato client
- [ ] Test - creare 10+ casi e verifica tutto funzioni

---

## 🧪 TESTING

Dopo ogni fix, testa:
1. **Creazione caso:** seleziona macchina → vedi ricambi filtrati → crea caso in <5 secondi
2. **Grafici:** cambio filtri → grafici si aggiornano dinamicamente
3. **Admin:** crea/elimina ricambio → controlla protezione referenziale
4. **Mobile:** apri app su iPhone → verifica responsive
5. **AI:** attendi generazione AI → controlla che la soluzione appaia con polling

---

**Implementa questi fix uno per uno. La priorità è:**
1. Bug creazione caso (timeout)
2. Ricambi dinamici
3. UI improvements