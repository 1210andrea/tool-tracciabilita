import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API_URL = '/api';

type OperatoreItem = { id: string; nome: string; attivo: boolean };
type CategoryItem = { id: string; type: string; name: string };
type MachineItem = { id: string; code: string; name: string; tipologia?: string; type?: string; reparto?: string };
type SparePartItem = { id: string; name: string; tipologie?: string[]; types?: string[] };
type SolutionItem = { id: string; name: string; description?: string; problem_ids?: string[] };

type AlertPart = {
  id: string;
  name: string;
  codice?: string;
  quantita: number;
  scorta_minima: number;
  giacenza_negativa: boolean;
  sotto_scorta: boolean;
};

function MultiSelect({
  label, options, selectedValues, onChange, placeholder = 'Seleziona...', helperText, required = false, emptyMessage, disabled = false,
}: {
  label: string; options: { id: string; name: string }[]; selectedValues: string[];
  onChange: (vals: string[]) => void; placeholder?: string; helperText?: string;
  required?: boolean; emptyMessage?: string; disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const toggleValue = (id: string) => {
    onChange(selectedValues.includes(id) ? selectedValues.filter((v) => v !== id) : [...selectedValues, id]);
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
        <button type="button" onClick={() => { if (!disabled) setIsOpen(!isOpen); }}
          className={`w-full text-left px-3 py-2 rounded-md bg-slate-700 border border-slate-600 text-white focus:outline-none focus:border-cyan-500 text-sm flex justify-between items-center transition duration-150 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
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
                <div className="px-4 py-3 text-sm text-slate-400 italic text-center">{emptyMessage ?? 'Nessuna opzione disponibile'}</div>
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

function HourStepper({ value, onChange, min = 0.5, step = 0.5 }: { value: number; onChange: (v: number) => void; min?: number; step?: number; }) {
  const fmt = (v: number) => { if (v % 1 === 0) return `${v}h`; const h = Math.floor(v); return h > 0 ? `${h}h 30m` : '30m'; };
  const decrement = () => onChange(Math.max(min, parseFloat((value - step).toFixed(1))));
  const increment = () => onChange(parseFloat((value + step).toFixed(1)));
  return (
    <div className="flex items-center gap-0 rounded-md overflow-hidden border border-slate-600 bg-slate-700 h-11 w-full">
      <button type="button" onClick={decrement} disabled={value <= min} aria-label="Diminuisci"
        className="flex items-center justify-center w-14 h-full text-2xl font-bold text-slate-200 hover:bg-slate-600 active:bg-slate-500 disabled:opacity-30 disabled:cursor-not-allowed transition select-none touch-manipulation">−</button>
      <div className="flex-1 text-center text-base font-semibold text-white select-none">{fmt(value)}</div>
      <button type="button" onClick={increment} aria-label="Aumenta"
        className="flex items-center justify-center w-14 h-full text-2xl font-bold text-slate-200 hover:bg-slate-600 active:bg-slate-500 transition select-none touch-manipulation">+</button>
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

  // Banner alert post-chiusura
  const [alertParts, setAlertParts] = useState<AlertPart[]>([]);

  const filteredMachines = machineSearch.trim() === ''
    ? [...machines].sort((a, b) => `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`))
    : machines.filter((m) => `${m.code} - ${m.name}`.toLowerCase().includes(machineSearch.toLowerCase()))
        .sort((a, b) => `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`));

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
        setMachines(machinesResp.data.items ?? machinesResp.data ?? []);
        setOperatori((operatoriResp.data.items ?? operatoriResp.data ?? []).sort((a: OperatoreItem, b: OperatoreItem) => a.nome.localeCompare(b.nome)));
        const items: CategoryItem[] = categoriesResp.data.items ?? categoriesResp.data ?? [];
        setProblems(items.filter((i) => i.type === 'problem').sort((a, b) => a.name.localeCompare(b.name)));
        setAllCauses(items.filter((i) => i.type === 'cause').sort((a, b) => a.name.localeCompare(b.name)));
        setAllSolutions((solutionsResp.data.items ?? solutionsResp.data ?? []).sort((a: SolutionItem, b: SolutionItem) => a.name.localeCompare(b.name)));
      } catch {
        setMachines([]); setOperatori([]); setProblems([]); setAllCauses([]); setAllSolutions([]);
      }
    };
    loadLookups();
  }, [token]);

  useEffect(() => { setCauseIds([]); setSoluzioniProvate([]); setSoluzioniApplicate([]); }, [problemId]);
  useEffect(() => { setSoluzioniProvate([]); setSoluzioniApplicate([]); }, [causeIds]);

  const filteredCauses = problemId
    ? allCauses.filter((c: any) => c.problem_id === problemId || (c.problem_ids as string[] | undefined)?.includes(problemId))
    : [];

  const filteredSolutions = problemId
    ? allSolutions.filter((s) => s.problem_ids && s.problem_ids.includes(problemId))
    : [];

  useEffect(() => {
    if (!token || !machineId) { setSpareParts([]); setPezziRicambio([]); return; }
    const machine = machines.find((m) => m.id === machineId);
    const tipologia = (machine?.tipologia ?? machine?.type ?? machine?.reparto) as string | undefined;
    if (!tipologia) { setSpareParts([]); setPezziRicambio([]); return; }
    const loadSpareParts = async () => {
      setLoadingParts(true);
      try {
        const resp = await axios.get(`${API_URL}/spare-parts/by-type/${encodeURIComponent(tipologia)}`, { headers: { Authorization: `Bearer ${token}` } });
        setSpareParts((resp.data.items ?? resp.data ?? []).sort((a: SparePartItem, b: SparePartItem) => a.name.localeCompare(b.name)));
        setPezziRicambio([]);
      } catch { setSpareParts([]); } finally { setLoadingParts(false); }
    };
    loadSpareParts();
  }, [token, machineId, machines]);

  const sparePartOptions = spareParts.map((sp) => {
    const tList = sp.tipologie?.length ? sp.tipologie : sp.types ?? [];
    return { id: sp.id, name: tList.length > 0 ? `${sp.name} (${tList.join(', ')})` : sp.name };
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setSuccess(null);
    if (!machineId) { setError('Seleziona una macchina.'); return; }
    if (!problemId) { setError('Seleziona un problema.'); return; }
    setLoading(true);
    try {
      const resp = await axios.post(
        `${API_URL}/cases`,
        {
          machine_id: machineId,
          operatore_ids: operatoreIds,
          problem_id: problemId,
          cause_ids: causeIds,
          solutions_tried_ids: soluzioniProvate,
          solutions_applied_ids: soluzioniApplicate,
          spare_parts_ids: pezziRicambio,
          tempo_impiego: tempoImpiego,
          notes,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const caseId = resp.data?.id ?? resp.data?.case?.id;
      if (!caseId) throw new Error('ID caso mancante');

      // Carica eventuali ricambi in esaurimento
      if (pezziRicambio.length > 0) {
        try {
          const alertResp = await axios.get(`${API_URL}/spare-parts/alerts`, { headers: { Authorization: `Bearer ${token}` } });
          const parts: AlertPart[] = alertResp.data.items ?? alertResp.data ?? [];
          const usedIds = new Set(pezziRicambio);
          const critical = parts.filter((p) => usedIds.has(p.id) && (p.giacenza_negativa || p.sotto_scorta));
          if (critical.length > 0) setAlertParts(critical);
        } catch { /* non bloccare */ }
      }

      setSuccess(`Caso #${caseId} creato con successo.`);
      setMachineId(''); setMachineSearch(''); setOperatoreIds([]); setProblemId('');
      setCauseIds([]); setSoluzioniProvate([]); setSoluzioniApplicate([]); setPezziRicambio([]); setTempoImpiego(0.5); setNotes('');
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Errore durante la creazione del caso.');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-slate-900 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-8">
          <Link to="/" className="mb-4 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-white">Nuovo Caso</h1>
          <p className="mt-1 text-sm text-slate-400">Compila il form per registrare un nuovo intervento tecnico.</p>
        </div>

        {/* Alert ricambi in esaurimento */}
        {alertParts.length > 0 && (
          <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
            <p className="text-sm font-semibold text-amber-400 mb-2">⚠️ Attenzione: ricambi in esaurimento</p>
            <ul className="space-y-1">
              {alertParts.map((p) => (
                <li key={p.id} className="text-xs text-amber-300">
                  <span className="font-medium">{p.name}</span>{p.codice ? ` (${p.codice})` : ''} — giacenza: <span className={p.giacenza_negativa ? 'text-rose-400 font-bold' : 'text-amber-400'}>{p.quantita}</span>{p.giacenza_negativa ? ' (NEGATIVA)' : ' (sotto scorta)'}
                </li>
              ))}
            </ul>
            <button onClick={() => setAlertParts([])} className="mt-3 text-xs text-amber-400/70 hover:text-amber-300 underline">Chiudi</button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Macchina */}
          <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-6">
            <h2 className="mb-4 text-base font-semibold text-slate-100">Macchina</h2>
            <div className="relative">
              <input
                type="text"
                placeholder="Cerca macchina..."
                value={machineSearch}
                onChange={(e) => { setMachineSearch(e.target.value); setMachineId(''); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                className="w-full rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 text-sm text-slate-100 placeholder-slate-400 focus:border-cyan-500 focus:outline-none"
              />
              {showSuggestions && filteredMachines.length > 0 && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowSuggestions(false)} />
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-600 bg-slate-800 shadow-2xl">
                    {filteredMachines.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => { setMachineId(m.id); setMachineSearch(`${m.code} - ${m.name}`); setShowSuggestions(false); }}
                        className={`w-full px-4 py-3 text-left text-sm hover:bg-slate-700 transition ${
                          m.id === machineId ? 'bg-slate-700 text-cyan-400' : 'text-slate-200'
                        }`}
                      >
                        <span className="font-medium">{m.code}</span> — {m.name}
                        {m.tipologia && <span className="ml-2 text-xs text-slate-400">({m.tipologia})</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            {machineId && (
              <p className="mt-2 text-xs text-slate-400">
                Macchina selezionata: <span className="font-semibold text-cyan-400">{machineSearch}</span>
              </p>
            )}
          </div>

          {/* Operatori */}
          <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-6">
            <h2 className="mb-4 text-base font-semibold text-slate-100">Operatori</h2>
            <MultiSelect
              label="Operatori coinvolti"
              options={operatori.map((o) => ({ id: o.id, name: o.nome }))}
              selectedValues={operatoreIds}
              onChange={setOperatoreIds}
              placeholder="Seleziona operatori..."
              emptyMessage="Nessun operatore disponibile"
            />
          </div>

          {/* Problema */}
          <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-6">
            <h2 className="mb-4 text-base font-semibold text-slate-100">Problema</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-200">
                  Tipo di problema <span className="text-rose-500">*</span>
                </label>
                <select
                  value={problemId}
                  onChange={(e) => setProblemId(e.target.value)}
                  className="w-full rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                >
                  <option value="">Seleziona un problema...</option>
                  {problems.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <MultiSelect
                label="Cause"
                options={filteredCauses.map((c) => ({ id: c.id, name: c.name }))}
                selectedValues={causeIds}
                onChange={setCauseIds}
                placeholder={problemId ? 'Seleziona cause...' : 'Seleziona prima un problema'}
                disabled={!problemId}
                emptyMessage="Nessuna causa per questo problema"
              />

              <MultiSelect
                label="Soluzioni provate"
                options={filteredSolutions.map((s) => ({ id: s.id, name: s.name }))}
                selectedValues={soluzioniProvate}
                onChange={setSoluzioniProvate}
                placeholder={problemId ? 'Seleziona soluzioni provate...' : 'Seleziona prima un problema'}
                disabled={!problemId}
                emptyMessage="Nessuna soluzione per questo problema"
              />

              <MultiSelect
                label="Soluzioni applicate"
                options={filteredSolutions.map((s) => ({ id: s.id, name: s.name }))}
                selectedValues={soluzioniApplicate}
                onChange={setSoluzioniApplicate}
                placeholder={problemId ? 'Seleziona soluzioni applicate...' : 'Seleziona prima un problema'}
                disabled={!problemId}
                emptyMessage="Nessuna soluzione per questo problema"
              />
            </div>
          </div>

          {/* Pezzi di ricambio */}
          <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-6">
            <h2 className="mb-1 text-base font-semibold text-slate-100">Pezzi di ricambio</h2>
            {!machineId ? (
              <p className="text-sm text-slate-400 italic mt-2">Seleziona prima una macchina per vedere i ricambi compatibili.</p>
            ) : loadingParts ? (
              <p className="text-sm text-slate-400 italic mt-2">Caricamento ricambi...</p>
            ) : (
              <MultiSelect
                label=""
                options={sparePartOptions}
                selectedValues={pezziRicambio}
                onChange={setPezziRicambio}
                placeholder="Seleziona pezzi di ricambio utilizzati..."
                emptyMessage="Nessun ricambio compatibile per questa macchina"
              />
            )}
          </div>

          {/* Tempo impiego */}
          <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-6">
            <h2 className="mb-4 text-base font-semibold text-slate-100">Tempo impiego</h2>
            <HourStepper value={tempoImpiego} onChange={setTempoImpiego} />
          </div>

          {/* Note */}
          <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-6">
            <h2 className="mb-4 text-base font-semibold text-slate-100">Note</h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Note aggiuntive (opzionale)..."
              className="w-full rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 text-sm text-slate-100 placeholder-slate-400 focus:border-cyan-500 focus:outline-none resize-none"
            />
          </div>

          {/* Errore / Successo */}
          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-400">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-400">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-cyan-500 py-3.5 text-sm font-semibold text-slate-900 transition hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creazione in corso...' : 'Crea caso'}
          </button>
        </form>
      </div>
    </div>
  );
}
