import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API_URL = '/api';

type OperatoreItem = { id: string; nome: string; attivo: boolean };
type CategoryItem = { id: string; type: string; name: string };
type MachineItem = { id: string; code: string; name: string; tipologia?: string; type?: string; reparto?: string };
type SparePartItem = { id: string; name: string; tipologie?: string[]; types?: string[] };
type SolutionItem = { id: string; name: string; description?: string; problem_ids?: string[] };

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
  emptyMessage,
  disabled = false,
}: {
  label: string;
  options: { id: string; name: string }[];
  selectedValues: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
  helperText?: string;
  required?: boolean;
  emptyMessage?: string;
  disabled?: boolean;
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
          onClick={() => { if (!disabled) setIsOpen(!isOpen); }}
          className={`w-full text-left px-3 py-2 rounded-md bg-slate-700 border border-slate-600 text-white focus:outline-none focus:border-cyan-500 text-sm flex justify-between items-center transition duration-150 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
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

        {isOpen && !disabled && (
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
  const [allCauses, setAllCauses] = useState<CategoryItem[]>([]);
  const [allSolutions, setAllSolutions] = useState<SolutionItem[]>([]);
  const [spareParts, setSpareParts] = useState<SparePartItem[]>([]);

  const [machineId, setMachineId] = useState('');
  const [operatoreIds, setOperatoreIds] = useState<string[]>([]);
  const [machineSearch, setMachineSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [problemId, setProblemId] = useState('');
  const [causeIds, setCauseIds] = useState<string[]>([]);

  const [soluzioniProvate, setSoluzioniProvate] = useState<string[]>([]);
  const [soluzioniApplicate, setSoluzioniApplicate] = useState<string[]>([]);
  const [pezziRicambio, setPezziRicambio] = useState<string[]>([]);
  const [tempoImpiego, setTempoImpiego] = useState(0.5);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingParts, setLoadingParts] = useState(false);
  const [notes, setNotes] = useState('');

  const filteredMachines = machineSearch.trim() === ''
    ? [...machines].sort((a, b) => `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`))
    : machines
        .filter((m) => `${m.code} - ${m.name}`.toLowerCase().includes(machineSearch.toLowerCase()))
        .sort((a, b) => `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`));

  // Caricamento dati iniziali
  useEffect(() => {
    if (!token) return;
    const loadLookups = async () => {
      try {
        const [machinesResp, operatoriResp, categoriesResp, solutionsResp] = await Promise.all([
          axios.get(`${API_URL}/machines`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${API_URL}/operatori`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${API_URL}/categories`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${API_URL}/solutions-applied`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        setMachines(machinesResp.data.items || []);
        setOperatori((operatoriResp.data.items || []).sort((a: OperatoreItem, b: OperatoreItem) => a.nome.localeCompare(b.nome)));
        const items: CategoryItem[] = categoriesResp.data.items || [];
        setProblems(items.filter((i) => i.type === 'problem').sort((a, b) => a.name.localeCompare(b.name)));
        setAllCauses(items.filter((i) => i.type === 'cause').sort((a, b) => a.name.localeCompare(b.name)));
        setAllSolutions((solutionsResp.data.items || []).sort((a: SolutionItem, b: SolutionItem) => a.name.localeCompare(b.name)));
      } catch {
        setMachines([]);
        setOperatori([]);
        setProblems([]);
        setAllCauses([]);
        setAllSolutions([]);
      }
    };
    loadLookups();
  }, [token]);

  // Quando cambia il problema: reset cause e soluzioni selezionate
  useEffect(() => {
    setCauseIds([]);
    setSoluzioniProvate([]);
    setSoluzioniApplicate([]);
  }, [problemId]);

  // Quando cambiano le cause: reset soluzioni selezionate
  useEffect(() => {
    setSoluzioniProvate([]);
    setSoluzioniApplicate([]);
  }, [causeIds]);

  // Cause filtrate per il problema selezionato
  const filteredCauses = problemId
    ? allCauses.filter((c: any) => {
        if (c.problem_id === problemId) return true;
        if (c.problem_ids && (c.problem_ids as string[]).includes(problemId)) return true;
        return false;
      })
    : [];

  // Soluzioni filtrate per il problema selezionato
  const filteredSolutions = problemId
    ? allSolutions.filter((s) => s.problem_ids && s.problem_ids.includes(problemId))
    : [];

  // Ricambi filtrati per tipologia macchina
  useEffect(() => {
    if (!token || !machineId) {
      setSpareParts([]);
      setPezziRicambio([]);
      return;
    }
    const machine = machines.find((m) => m.id === machineId);
    const tipologia = (machine?.tipologia ?? machine?.type ?? machine?.reparto) as string | undefined;
    if (!tipologia) { setSpareParts([]); setPezziRicambio([]); return; }

    const loadSpareParts = async () => {
      setLoadingParts(true);
      try {
        const resp = await axios.get(`${API_URL}/spare-parts/by-type/${encodeURIComponent(tipologia)}`, { headers: { Authorization: `Bearer ${token}` } });
        setSpareParts((resp.data.items || []).sort((a: SparePartItem, b: SparePartItem) => a.name.localeCompare(b.name)));
        setPezziRicambio([]);
      } catch {
        setSpareParts([]);
      } finally {
        setLoadingParts(false);
      }
    };
    loadSpareParts();
  }, [token, machineId, machines]);

  const sparePartOptions = spareParts.map((sp) => {
    const tList = sp.tipologie?.length ? sp.tipologie : (sp.types?.length ? sp.types : []);
    const label = tList.length ? `${sp.name} (${tList[0]})` : sp.name;
    return { id: sp.id, name: label };
  });

  const handleCreate = async () => {
    if (!token) return;
    if (!machineId || operatoreIds.length === 0 || !problemId || causeIds.length === 0 || !soluzioniApplicate.length) {
      setError('Compila tutti i campi obbligatori: almeno un operatore, macchina, problema, almeno una causa e almeno una soluzione applicata.');
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
          operatore_id: operatoreIds[0],
          operatore_ids: operatoreIds,
          problem_id: problemId,
          cause_id: causeIds[0],
          cause_ids: causeIds,
          soluzioni_provate: soluzioniProvate,
          soluzioni_applicate: soluzioniApplicate,
          pezzi_ricambio: pezziRicambio,
          tempo_impiego: tempoImpiego,
          notes: notes.trim() || null
        },
        { headers: { Authorization: `Bearer ${token}` } }
      ) as { data: CreateCaseResponse };

      setSuccess('Caso creato con successo! Reindirizzamento...');
      setMachineId(''); setMachineSearch(''); setProblemId(''); setCauseIds([]);
      setOperatoreIds([]);
      setSoluzioniProvate([]); setSoluzioniApplicate([]); setPezziRicambio([]);
      setTempoImpiego(0.5); setNotes('');

      setTimeout(() => { navigate(user?.role === 'admin' ? '/dashboard' : '/'); }, 1500);
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
                  <button key={m.id} type="button"
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

        {/* Operatore — multi-select */}
        <div className="flex flex-col space-y-1.5">
          <MultiSelect
            label="Operatore"
            required
            options={operatori.map((op) => ({ id: op.id, name: op.nome }))}
            selectedValues={operatoreIds}
            onChange={setOperatoreIds}
            placeholder="Seleziona operatore/i..."
            helperText="Puoi selezionare più operatori"
          />
        </div>

        {/* Pezzi di Ricambio */}
        <div className="flex flex-col space-y-1.5">
          <MultiSelect
            label="Pezzi di Ricambio"
            options={sparePartOptions}
            selectedValues={pezziRicambio}
            onChange={setPezziRicambio}
            placeholder={!machineId ? 'Seleziona prima una macchina' : (loadingParts ? 'Caricamento...' : 'Seleziona ricambi...')}
            helperText="Seleziona i pezzi di ricambio utilizzati"
            emptyMessage={!machineId ? 'Seleziona prima una macchina' : 'Nessun ricambio disponibile per questa tipologia'}
          />
        </div>

        {/* Problema */}
        <div className="flex flex-col space-y-1.5">
          <label className="text-sm font-medium text-slate-200">Problema <span className="text-rose-500 ml-1">*</span></label>
          <select value={problemId} onChange={(e) => setProblemId(e.target.value)} className="w-full px-3 py-2 rounded-md bg-slate-700 border border-slate-600 text-white focus:outline-none focus:border-cyan-500 text-sm">
            <option value="">Seleziona problema</option>
            {problems.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
          </select>
        </div>

        {/* Causa — multi-select */}
        <div className="flex flex-col space-y-1.5 md:col-span-1">
          <MultiSelect
            label="Causa"
            required
            options={filteredCauses.map((c) => ({ id: c.id, name: c.name }))}
            selectedValues={causeIds}
            onChange={setCauseIds}
            placeholder={!problemId ? 'Seleziona prima un problema' : (filteredCauses.length === 0 ? 'Nessuna causa per questo problema' : 'Seleziona causa/e...')}
            helperText="Puoi selezionare più cause"
            disabled={!problemId}
            emptyMessage="Nessuna causa associata a questo problema. Aggiungila dall'Admin Panel."
          />
          {problemId && filteredCauses.length === 0 && (
            <p className="text-xs text-amber-400">Nessuna causa associata a questo problema. Aggiungila dall'Admin Panel.</p>
          )}
        </div>

        {/* Soluzioni Provate */}
        <div className="flex flex-col space-y-1.5">
          <MultiSelect
            label="Soluzioni Provate"
            options={filteredSolutions.map((s) => ({ id: s.id, name: s.name }))}
            selectedValues={soluzioniProvate}
            onChange={setSoluzioniProvate}
            placeholder={!problemId ? 'Seleziona prima un problema' : (filteredSolutions.length === 0 ? 'Nessuna soluzione per questo problema' : 'Seleziona soluzioni provate...')}
            helperText="Soluzioni tentate ma che NON hanno risolto il problema"
            emptyMessage={!problemId ? 'Seleziona prima un problema' : 'Nessuna soluzione collegata a questo problema'}
          />
        </div>

        {/* Soluzione Applicata */}
        <div className="flex flex-col space-y-1.5">
          <MultiSelect
            label="Soluzione Applicata"
            required
            options={filteredSolutions.map((s) => ({ id: s.id, name: s.name }))}
            selectedValues={soluzioniApplicate}
            onChange={setSoluzioniApplicate}
            placeholder={!problemId ? 'Seleziona prima un problema' : (filteredSolutions.length === 0 ? 'Nessuna soluzione per questo problema' : 'Seleziona soluzione applicata...')}
            helperText="Soluzione/i che ha/hanno effettivamente risolto il problema"
            emptyMessage={!problemId ? 'Seleziona prima un problema' : 'Nessuna soluzione collegata a questo problema'}
          />
        </div>

        {/* Tempo impiego */}
        <div className="flex flex-col space-y-1.5">
          <label className="text-sm font-medium text-slate-200">Tempo impiego (ore) <span className="text-rose-500 ml-1">*</span></label>
          <input
            type="number" min="0.5" step="0.5" value={tempoImpiego}
            onChange={(e) => setTempoImpiego(parseFloat(e.target.value) || 0.5)}
            className="w-full px-3 py-2 rounded-md bg-slate-700 border border-slate-600 text-white focus:outline-none focus:border-cyan-500 text-sm"
          />
        </div>

        {/* Note */}
        <div className="flex flex-col space-y-1.5 md:col-span-2">
          <label className="text-sm font-medium text-slate-200">Note</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Note aggiuntive (opzionale)"
            className="w-full px-3 py-2 rounded-md bg-slate-700 border border-slate-600 text-white focus:outline-none focus:border-cyan-500 text-sm resize-none"
          />
        </div>

      </div>

      {selectedMachine && (
        <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-3 text-xs text-slate-400">
          <span className="font-semibold text-slate-300">Macchina selezionata:</span> {selectedMachine.code} - {selectedMachine.name}
          {(selectedMachine.tipologia || selectedMachine.type) && (
            <span className="ml-2 text-slate-500">· Tipologia: {selectedMachine.tipologia || selectedMachine.type}</span>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={handleCreate}
        disabled={loading}
        className="w-full rounded-2xl bg-cyan-600 px-6 py-3 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50 transition sm:w-auto"
      >
        {loading ? 'Creazione in corso...' : 'Crea caso'}
      </button>
    </div>
  );
}
