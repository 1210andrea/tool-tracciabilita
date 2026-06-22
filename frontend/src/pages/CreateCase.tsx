import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API_URL = '/api';

type OperatoreItem = { id: string; nome: string; attivo: boolean };
type CategoryItem = { id: string; type: string; name: string };
type MachineItem = { id: string; code: string; name: string; tipologia?: string; type?: string; reparto?: string };
type SparePartItem = { id: string; name: string; tipologie?: string[]; types?: string[] };
type SolutionItem = { id: string; name: string; description?: string; cause_id?: string };

type CreateCaseResponse = {
  success?: boolean;
  case_id?: string;
  item?: { id?: string };
};

function MultiSelect({
  label,
  options,
  selectedValues,
  onChange,
  placeholder = 'Seleziona...',
  helperText,
  required = false,
  emptyMessage
}: {
  label: string;
  options: { id: string; name: string }[];
  selectedValues: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
  helperText?: string;
  required?: boolean;
  emptyMessage?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleValue = (id: string) => {
    onChange(selectedValues.includes(id)
      ? selectedValues.filter((v) => v !== id)
      : [...selectedValues, id]);
  };

  return (
    <div className="relative flex flex-col space-y-1.5">
      <label className="text-sm font-medium text-slate-200 flex justify-between">
        <span>{label} {required && <span className="text-rose-500 ml-1">*</span>}</span>
        {selectedValues.length > 0 && (
          <span className="text-xs text-cyan-400 font-semibold">
            {selectedValues.length} selezionat{selectedValues.length === 1 ? 'o' : 'i'}
          </span>
        )}
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full text-left px-3 py-2 rounded-md bg-slate-700 border border-slate-600 text-white focus:outline-none focus:border-cyan-500 text-sm flex justify-between items-center transition duration-150"
        >
          <span className="truncate">
            {selectedValues.length > 0
              ? options.filter((o) => selectedValues.includes(o.id)).map((o) => o.name).join(', ')
              : placeholder}
          </span>
          <svg className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setIsOpen(false)} />
            <div className="absolute left-0 right-0 z-40 mt-2 max-h-60 overflow-y-auto rounded-md border border-slate-600 bg-slate-800 p-2 shadow-2xl backdrop-blur-md transition-all duration-200">
              {options.length === 0 ? (
                <div className="px-4 py-3 text-sm text-slate-400 italic text-center">
                  {emptyMessage ?? 'Nessuna opzione disponibile'}
                </div>
              ) : (
                options.map((opt) => (
                  <label key={opt.id} className="flex items-center gap-3 px-4 py-2.5 rounded-md hover:bg-slate-700 hover:text-white text-slate-200 text-sm cursor-pointer transition select-none">
                    <input type="checkbox" checked={selectedValues.includes(opt.id)} onChange={() => toggleValue(opt.id)} className="accent-cyan-500 h-4 w-4 cursor-pointer rounded" />
                    <span className="truncate">{opt.name}</span>
                  </label>
                ))
              )}
            </div>
          </>
        )}
      </div>
      {helperText && <p className="text-xs text-slate-500">{helperText}</p>}
    </div>
  );
}

export default function CreateCase() {
  const { token, user } = useAuth();
  const navigate = useNavigate();

  const [machines, setMachines] = useState<MachineItem[]>([]);
  const [operatori, setOperatori] = useState<OperatoreItem[]>([]);
  const [problems, setProblems] = useState<CategoryItem[]>([]);
  const [causes, setCauses] = useState<CategoryItem[]>([]);
  const [spareParts, setSpareParts] = useState<SparePartItem[]>([]);
  const [allSolutions, setAllSolutions] = useState<SolutionItem[]>([]);
  const [filteredSolutions, setFilteredSolutions] = useState<SolutionItem[]>([]);

  const [machineId, setMachineId] = useState('');
  const [operatoreId, setOperatoreId] = useState('');
  const [machineSearch, setMachineSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [problemId, setProblemId] = useState('');
  const [causeId, setCauseId] = useState('');

  const [soluzioniProvate, setSoluzioniProvate] = useState<string[]>([]);
  const [soluzioniApplicate, setSoluzioniApplicate] = useState<string[]>([]);
  const [pezziRicambio, setPezziRicambio] = useState<string[]>([]);
  const [tempoImpiego, setTempoImpiego] = useState(0.5);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingParts, setLoadingParts] = useState(false);
  const [loadingSolutions, setLoadingSolutions] = useState(false);
  const [notes, setNotes] = useState('');

  const filteredMachines = machineSearch.trim() === ''
    ? [...machines].sort((a, b) => `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`))
    : machines
        .filter((m) => `${m.code} - ${m.name}`.toLowerCase().includes(machineSearch.toLowerCase()))
        .sort((a, b) => `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`));

  // -------------------------------------------------------
  // Caricamento dati iniziali
  // -------------------------------------------------------
  useEffect(() => {
    if (!token) return;
    const loadLookups = async () => {
      try {
        const [machinesResp, operatoriResp, categoriesResp, solutionsResp] = await Promise.all([
          axios.get(`${API_URL}/machines`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${API_URL}/operatori`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${API_URL}/categories`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${API_URL}/solutions-applied`, { headers: { Authorization: `Bearer ${token}` } })
        ]);

        setMachines(machinesResp.data.items || []);
        setOperatori((operatoriResp.data.items || []).sort((a: OperatoreItem, b: OperatoreItem) => a.nome.localeCompare(b.nome)));
        const items: CategoryItem[] = categoriesResp.data.items || [];
        setProblems(items.filter((i) => i.type === 'problem').sort((a, b) => a.name.localeCompare(b.name)));
        setCauses(items.filter((i) => i.type === 'cause').sort((a, b) => a.name.localeCompare(b.name)));
        const sols: SolutionItem[] = (solutionsResp.data.items || []).sort((a: SolutionItem, b: SolutionItem) => a.name.localeCompare(b.name));
        setAllSolutions(sols);
        setFilteredSolutions(sols);
      } catch {
        setMachines([]);
        setOperatori([]);
        setProblems([]);
        setCauses([]);
        setAllSolutions([]);
        setFilteredSolutions([]);
      }
    };
    loadLookups();
  }, [token]);

  // -------------------------------------------------------
  // Filtro soluzioni per causa selezionata
  // -------------------------------------------------------
  useEffect(() => {
    if (!causeId) {
      setFilteredSolutions(allSolutions);
      setSoluzioniProvate([]);
      setSoluzioniApplicate([]);
      return;
    }

    // Filtra localmente le soluzioni che hanno la causa corrispondente
    const byCause = allSolutions.filter((s) => s.cause_id === causeId);

    // Se nessuna soluzione è associata alla causa, prova a caricarle dal backend
    if (byCause.length === 0 && token) {
      setLoadingSolutions(true);
      axios
        .get(`${API_URL}/solutions-applied/by-cause/${causeId}`, { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => {
          const items: SolutionItem[] = (res.data.items || []).sort((a: SolutionItem, b: SolutionItem) => a.name.localeCompare(b.name));
          setFilteredSolutions(items);
        })
        .catch(() => setFilteredSolutions([]))
        .finally(() => setLoadingSolutions(false));
    } else {
      setFilteredSolutions(byCause);
    }

    // Deseleziona soluzioni non più disponibili
    setSoluzioniProvate((prev) => prev.filter((id) => byCause.some((s) => s.id === id)));
    setSoluzioniApplicate((prev) => prev.filter((id) => byCause.some((s) => s.id === id)));
  }, [causeId, allSolutions, token]);

  // -------------------------------------------------------
  // Ricambi filtrati per tipologia macchina
  // -------------------------------------------------------
  useEffect(() => {
    if (!token || !machineId) {
      setSpareParts([]);
      setPezziRicambio([]);
      return;
    }

    const machine = machines.find((m) => m.id === machineId);
    const tipologia = (machine?.tipologia ?? machine?.type ?? machine?.reparto) as string | undefined;

    if (!tipologia) {
      setSpareParts([]);
      setPezziRicambio([]);
      return;
    }

    const loadSpareParts = async () => {
      setLoadingParts(true);
      try {
        const resp = await axios.get(`${API_URL}/spare-parts/by-type/${encodeURIComponent(tipologia)}`, { headers: { Authorization: `Bearer ${token}` } });
        const parts: SparePartItem[] = (resp.data.items || []).sort((a: SparePartItem, b: SparePartItem) => a.name.localeCompare(b.name));
        setSpareParts(parts);
        setPezziRicambio([]);
      } catch {
        setSpareParts([]);
      } finally {
        setLoadingParts(false);
      }
    };
    loadSpareParts();
  }, [token, machineId, machines]);

  // -------------------------------------------------------
  // Opzioni MultiSelect ricambi (Nome + prima tipologia)
  // -------------------------------------------------------
  const sparePartOptions = spareParts.map((sp) => {
    const tList = sp.tipologie?.length ? sp.tipologie : (sp.types?.length ? sp.types : []);
    const label = tList.length ? `${sp.name} (${tList[0]})` : sp.name;
    return { id: sp.id, name: label };
  });

  const handleCreate = async () => {
    if (!token) return;
    if (!machineId || !operatoreId || !problemId || !causeId || !soluzioniApplicate.length) {
      setError('Compila tutti i campi obbligatori: operatore, macchina, problema, causa e almeno una soluzione applicata.');
      return;
    }
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await axios.post(
        `${API_URL}/cases`,
        {
          machine_id: machineId,
          operatore_id: operatoreId,
          problem_id: problemId,
          cause_id: causeId,
          soluzioni_provate: soluzioniProvate,
          soluzioni_applicate: soluzioniApplicate,
          pezzi_ricambio: pezziRicambio,
          tempo_impiego: tempoImpiego,
          notes: notes.trim() || null
        },
        { headers: { Authorization: `Bearer ${token}` } }
      ) as { data: CreateCaseResponse };

      setSuccess('Caso creato con successo! Reindirizzamento...');
      setMachineId('');
      setMachineSearch('');
      setProblemId('');
      setCauseId('');
      setSoluzioniProvate([]);
      setSoluzioniApplicate([]);
      setPezziRicambio([]);
      setTempoImpiego(0.5);
      setNotes('');

      setTimeout(() => {
        navigate(user?.role === 'admin' ? '/dashboard' : '/');
      }, 1500);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Errore durante la creazione del caso.');
    } finally {
      setLoading(false);
    }
  };

  const selectedMachine = machines.find((m) => m.id === machineId);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Nuovo caso</h1>
        <p className="text-sm text-slate-400">Registra un intervento completato sulla macchina.</p>
      </div>

      {error && <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-red-200">{error}</div>}
      {success && <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-emerald-200">{success}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:gap-4">

        {/* Macchina */}
        <div className="flex flex-col space-y-1.5">
          <label className="text-sm font-medium text-slate-200">Macchina <span className="text-rose-500 ml-1">*</span></label>
          <div className="relative">
            <input
              type="text"
              value={machineSearch}
              onChange={(e) => {
                const val = e.target.value;
                setMachineSearch(val);
                const exact = machines.find((m) =>
                  `${m.code} - ${m.name}`.toLowerCase() === val.toLowerCase().trim() ||
                  m.code.toLowerCase() === val.toLowerCase().trim()
                );
                setMachineId(exact ? exact.id : '');
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              onKeyDown={(e) => { if (e.key === 'Escape') setShowSuggestions(false); }}
              placeholder="Scrivi (es. SIMM45 - Linea 1 ...)"
              className="w-full px-3 py-2 rounded-md bg-slate-700 border border-slate-600 text-white focus:outline-none focus:border-cyan-500 text-sm"
            />
            {showSuggestions && filteredMachines.length > 0 && (
              <div className="absolute left-0 right-0 z-50 mt-2 max-h-60 overflow-y-auto rounded-md border border-slate-600 bg-slate-800 p-2 shadow-2xl backdrop-blur-md">
                {filteredMachines.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setMachineId(m.id); setMachineSearch(`${m.code} - ${m.name}`); setShowSuggestions(false); }}
                    className="w-full text-left px-4 py-2.5 rounded-md hover:bg-slate-700 hover:text-white text-slate-200 text-sm transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1"
                  >
                    <div className="font-semibold text-slate-100">{m.code}</div>
                    <div className="text-xs text-slate-400">{m.name}</div>
                  </button>
                ))}
              </div>
            )}
            {showSuggestions && machineSearch.trim() !== '' && filteredMachines.length === 0 && (
              <div className="absolute left-0 right-0 z-50 mt-2 rounded-md border border-slate-600 bg-slate-800 p-4 shadow-2xl text-sm text-slate-400 text-center italic">
                Nessuna macchina trovata
              </div>
            )}
          </div>
        </div>

        {/* Operatore */}
        <div className="flex flex-col space-y-1.5">
          <label className="text-sm font-medium text-slate-200">Operatore <span className="text-rose-500 ml-1">*</span></label>
          <select value={operatoreId} onChange={(e) => setOperatoreId(e.target.value)} className="w-full px-3 py-2 rounded-md bg-slate-700 border border-slate-600 text-white focus:outline-none focus:border-cyan-500 text-sm">
            <option value="">Seleziona operatore</option>
            {operatori.map((op) => (
              <option key={op.id} value={op.id}>{op.nome}</option>
            ))}
          </select>
        </div>

        {/* Pezzi di Ricambio — Nome (tipologia) */}
        <div className="flex flex-col space-y-1.5">
          <MultiSelect
            label="Pezzi di Ricambio"
            options={sparePartOptions}
            selectedValues={pezziRicambio}
            onChange={setPezziRicambio}
            placeholder={
              !machineId ? 'Seleziona prima una macchina'
              : loadingParts ? 'Caricamento ricambi...'
              : spareParts.length ? 'Seleziona pezzi di ricambio'
              : 'Nessun ricambio per questo tipo'
            }
            helperText={selectedMachine ? `Tipologia macchina: ${selectedMachine.tipologia ?? selectedMachine.type ?? selectedMachine.reparto ?? 'N/D'}` : 'Seleziona i pezzi di ricambio utilizzati'}
            required={false}
            emptyMessage="Nessun ricambio disponibile per questa macchina"
          />
        </div>

        {/* Problema */}
        <div className="flex flex-col space-y-1.5">
          <label className="text-sm font-medium text-slate-200">Problema <span className="text-rose-500 ml-1">*</span></label>
          <select value={problemId} onChange={(e) => setProblemId(e.target.value)} className="w-full px-3 py-2 rounded-md bg-slate-700 border border-slate-600 text-white focus:outline-none focus:border-cyan-500 text-sm">
            <option value="">Seleziona problema</option>
            {problems.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </div>

        {/* Causa */}
        <div className="flex flex-col space-y-1.5">
          <label className="text-sm font-medium text-slate-200">Causa <span className="text-rose-500 ml-1">*</span></label>
          <select
            value={causeId}
            onChange={(e) => setCauseId(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-slate-700 border border-slate-600 text-white focus:outline-none focus:border-cyan-500 text-sm"
          >
            <option value="">Seleziona causa</option>
            {causes.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
          {causeId && filteredSolutions.length === 0 && !loadingSolutions && (
            <p className="text-xs text-amber-400 mt-0.5">
              Nessuna soluzione associata a questa causa. Aggiungile dall'Admin Panel.
            </p>
          )}
        </div>

        {/* Soluzioni Provate — filtrate per causa */}
        <div className="col-span-1 md:col-span-2 flex flex-col space-y-1.5">
          <MultiSelect
            label="Soluzioni Provate"
            options={filteredSolutions}
            selectedValues={soluzioniProvate}
            onChange={setSoluzioniProvate}
            placeholder={loadingSolutions ? 'Caricamento soluzioni...' : causeId ? 'Seleziona soluzioni provate...' : 'Seleziona prima una causa'}
            helperText="Soluzioni tentate ma che NON hanno risolto il problema"
            required={false}
            emptyMessage={causeId ? 'Nessuna soluzione associata a questa causa' : 'Seleziona prima una causa'}
          />
        </div>

        {/* Soluzione Applicata — filtrata per causa */}
        <div className="col-span-1 md:col-span-2 flex flex-col space-y-1.5">
          <MultiSelect
            label="Soluzione Applicata"
            options={filteredSolutions}
            selectedValues={soluzioniApplicate}
            onChange={setSoluzioniApplicate}
            placeholder={loadingSolutions ? 'Caricamento soluzioni...' : causeId ? 'Seleziona soluzione/i applicata/e...' : 'Seleziona prima una causa'}
            helperText="Soluzione/i che ha/hanno effettivamente risolto il problema"
            required={true}
            emptyMessage={causeId ? 'Nessuna soluzione associata a questa causa' : 'Seleziona prima una causa'}
          />
        </div>

        {/* Tempo Impiego */}
        <div className="col-span-1 md:col-span-2 flex flex-col space-y-1.5">
          <label className="text-sm font-medium text-slate-200">Tempo Impiego <span className="text-rose-500 ml-1">*</span></label>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setTempoImpiego((t) => Math.max(0.5, t - 0.5))} className="flex h-10 w-12 items-center justify-center rounded-md border border-slate-600 bg-slate-700 text-lg font-bold text-slate-300 hover:bg-slate-600 transition active:scale-95">-</button>
            <div className="flex-1 h-10 rounded-md border border-slate-600 bg-slate-700 px-4 flex items-center justify-center text-slate-100 font-semibold text-sm">
              {tempoImpiego}h ({Math.floor(tempoImpiego)}h {Math.round((tempoImpiego % 1) * 60)}m)
            </div>
            <button type="button" onClick={() => setTempoImpiego((t) => Math.min(999, t + 0.5))} className="flex h-10 w-12 items-center justify-center rounded-md border border-slate-600 bg-slate-700 text-lg font-bold text-slate-300 hover:bg-slate-600 transition active:scale-95">+</button>
          </div>
          <p className="text-xs text-slate-500">Durata totale dell'intervento manutentivo in ore.</p>
        </div>

        {/* Note aggiuntive */}
        <div className="col-span-1 md:col-span-2 flex flex-col space-y-1.5">
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-slate-200">Note aggiuntive</label>
            <span className="text-xs text-slate-400">{notes.length}/1000 caratteri</span>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
            placeholder="Aggiungi dettagli sull'intervento, anomalie riscontrate o altre osservazioni..."
            className="w-full h-28 px-3 py-2 rounded-md bg-slate-700 border border-slate-600 text-white focus:outline-none focus:border-cyan-500 resize-none text-sm"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" className="inline-flex items-center justify-center rounded-2xl bg-sky-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60" onClick={handleCreate} disabled={!token || loading}>
          {loading ? 'Salvataggio...' : 'Crea caso'}
        </button>
        <button type="button" className="rounded-2xl border border-slate-700 bg-slate-900/90 px-6 py-3 text-sm text-slate-100 transition hover:bg-slate-800" onClick={() => navigate(user?.role === 'admin' ? '/dashboard' : '/')}>
          Torna indietro
        </button>
      </div>
    </div>
  );
}
