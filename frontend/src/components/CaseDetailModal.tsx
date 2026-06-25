import { useEffect, useState } from 'react';
import axios from 'axios';
import { MachineSearchSelect } from './MachineSearchSelect';

const API_URL = '/api';

type CategoryItem = { id: string; type: string; name: string };
type MachineItem = { id: string; code: string; name: string; type?: string; tipologia?: string };
type SparePartItem = { id: string; name: string };
// cause_id qui è il problem_id restituito dalla join solution_problems
// (usato per filtrare le soluzioni per causa nel MultiSelect)
type SolutionItem = { id: string; name: string; cause_id?: string };

export type CaseDetail = {
  id: string;
  created_by?: string;
  machine_id: string;
  problem_id?: string | null;
  cause_id?: string | null;
  spare_part_id?: string | null;
  solution_applied_id?: string | null;
  solution?: string | null;
  description?: string | null;
  machine_code?: string;
  machine_name?: string;
  problem_name?: string;
  cause_name?: string;
  spare_part_name?: string;
  solution_applied_name?: string;
  created_at?: string;
  notes?: string | null;
  tempo_impiego?: number;
  soluzioni_provate?: { id: string; name: string }[];
  soluzioni_applicate?: { id: string; name: string }[];
  pezzi_ricambio?: { id: string; name: string }[];
};

function MultiSelect({
  label, options, selectedValues, onChange, placeholder = 'Seleziona...', helperText, disabled = false, required = false
}: {
  label: string; options: { id: string; name: string }[]; selectedValues: string[];
  onChange: (vals: string[]) => void; placeholder?: string; helperText?: string; disabled?: boolean; required?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const toggleValue = (id: string) => {
    onChange(selectedValues.includes(id) ? selectedValues.filter((v) => v !== id) : [...selectedValues, id]);
  };
  return (
    <div className="relative space-y-1">
      <label className="text-xs text-slate-400 flex justify-between">
        <span>{label} {required && <span className="text-red-400">*</span>}</span>
        {selectedValues.length > 0 && <span className="text-xs text-sky-400 font-semibold">{selectedValues.length} selezionat{selectedValues.length === 1 ? 'o' : 'i'}</span>}
      </label>
      <div className="relative">
        <button type="button" disabled={disabled} onClick={() => setIsOpen(!isOpen)}
          className="w-full text-left rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-xs text-slate-100 outline-none flex justify-between items-center focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/10 disabled:opacity-60 transition duration-150">
          <span className="truncate">
            {selectedValues.length > 0 ? options.filter((o) => selectedValues.includes(o.id)).map((o) => o.name).join(', ') : placeholder}
          </span>
          {!disabled && (
            <svg className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </button>
        {isOpen && !disabled && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setIsOpen(false)} />
            <div className="absolute left-0 right-0 z-[9999] mt-2 max-h-48 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-2 shadow-2xl backdrop-blur-md transition-all duration-200">
              {options.length === 0 ? (
                <div className="px-4 py-3 text-xs text-slate-500 italic text-center">Nessuna opzione disponibile</div>
              ) : (
                options.map((opt) => (
                  <label key={opt.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-sky-500/20 hover:text-sky-300 text-slate-200 text-xs cursor-pointer transition select-none">
                    <input type="checkbox" checked={selectedValues.includes(opt.id)} onChange={() => toggleValue(opt.id)} className="accent-sky-500 h-4 w-4 cursor-pointer rounded" />
                    <span className="truncate">{opt.name}</span>
                  </label>
                ))
              )}
            </div>
          </>
        )}
      </div>
      {helperText && <p className="text-[10px] text-slate-500 mt-1">{helperText}</p>}
    </div>
  );
}

export function CaseDetailModal({
  open, token, caseItem, machines, categories, canEdit, onClose, onSaved,
}: {
  open: boolean; token: string; caseItem: CaseDetail | null; machines: MachineItem[];
  categories: CategoryItem[]; canEdit: boolean; isAdmin?: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [machineId, setMachineId] = useState('');
  const [problemId, setProblemId] = useState('');
  const [causeId, setCauseId] = useState('');
  const [soluzioniProvate, setSoluzioniProvate] = useState<string[]>([]);
  const [soluzioniApplicate, setSoluzioniApplicate] = useState<string[]>([]);
  const [pezziRicambio, setPezziRicambio] = useState<string[]>([]);
  const [tempoImpiego, setTempoImpiego] = useState(0.5);
  const [spareParts, setSpareParts] = useState<SparePartItem[]>([]);
  const [filteredCauses, setFilteredCauses] = useState<CategoryItem[]>([]);
  const [filteredSolutions, setFilteredSolutions] = useState<SolutionItem[]>([]);
  const [loadingCauses, setLoadingCauses] = useState(false);
  const [loadingSolutions, setLoadingSolutions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState('');

  const problems = categories.filter((c) => c.type === 'problem');

  useEffect(() => {
    if (!caseItem) return;
    setIsEditing(false);
    setMachineId(caseItem.machine_id);
    setProblemId(caseItem.problem_id ?? '');
    setCauseId(caseItem.cause_id ?? '');
    setSoluzioniProvate((caseItem.soluzioni_provate || []).map((s) => s.id));
    setSoluzioniApplicate((caseItem.soluzioni_applicate || []).map((s) => s.id));
    setPezziRicambio((caseItem.pezzi_ricambio || []).map((p) => p.id));
    setTempoImpiego(Number(caseItem.tempo_impiego) || 0.5);
    setNotes(caseItem.notes ?? '');
    setError(null);
  }, [caseItem]);

  // Carica cause e soluzioni filtrate per problema
  // La route solutions-by-problem esiste ora in categories.ts (sopra /:type)
  useEffect(() => {
    setFilteredCauses([]);
    setFilteredSolutions([]);
    if (!problemId || !token) return;

    setLoadingCauses(true);
    setLoadingSolutions(true);

    axios
      .get(`${API_URL}/categories/causes-by-problem/${problemId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setFilteredCauses(r.data.items || []))
      .catch(() => setFilteredCauses([]))
      .finally(() => setLoadingCauses(false));

    axios
      .get(`${API_URL}/categories/solutions-by-problem/${problemId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setFilteredSolutions(r.data.items || []))
      .catch(() => setFilteredSolutions([]))
      .finally(() => setLoadingSolutions(false));
  }, [problemId, token]);

  // Reset causa e soluzioni quando cambia il problema in edit
  const handleProblemChange = (newProblemId: string) => {
    setProblemId(newProblemId);
    setCauseId('');
    setSoluzioniProvate([]);
    setSoluzioniApplicate([]);
  };

  // Reset soluzioni quando cambia la causa
  const handleCauseChange = (newCauseId: string) => {
    setCauseId(newCauseId);
    setSoluzioniProvate([]);
    setSoluzioniApplicate([]);
  };

  // Le soluzioni sono già filtrate per problema dalla BE.
  // Se è selezionata una causa, filtra ulteriormente per cause_id.
  // Le soluzioni senza cause_id (non associate a nessun problema) vengono
  // sempre mostrate per non escluderle per errore.
  const solutionsByCurrentCause = causeId
    ? filteredSolutions.filter((s) => !s.cause_id || s.cause_id === causeId)
    : filteredSolutions;

  useEffect(() => {
    if (!token || !machineId) { setSpareParts([]); return; }
    const machine = machines.find((m) => m.id === machineId);
    const tipologia = (machine?.type || machine?.tipologia) as string | undefined;
    if (!tipologia) return;
    axios.get(`${API_URL}/spare-parts/by-type/${encodeURIComponent(tipologia)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setSpareParts(r.data.items || []))
      .catch(() => setSpareParts([]));
  }, [token, machineId, machines]);

  if (!open || !caseItem) return null;

  const handleSave = async () => {
    if (!canEdit) return;
    if (!machineId || !problemId || !causeId || !soluzioniApplicate.length) {
      setError('Compila tutti i campi obbligatori: macchina, problema, causa e almeno una soluzione applicata.');
      return;
    }
    setLoading(true); setError(null);
    try {
      await axios.put(
        `${API_URL}/cases/${caseItem.id}`,
        { machine_id: machineId, problem_id: problemId, cause_id: causeId, soluzioni_provate: soluzioniProvate, soluzioni_applicate: soluzioniApplicate, pezzi_ricambio: pezziRicambio, tempo_impiego: tempoImpiego, notes: notes.trim() || null },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      onSaved(); onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Errore durante il salvataggio.');
    } finally {
      setLoading(false);
    }
  };

  const selectedMachine = machines.find((m) => m.id === machineId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 p-5 shadow-xl sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-100">{isEditing ? 'Modifica caso' : 'Dettaglio caso'}</h2>
            <p className="text-sm text-slate-400">{caseItem.machine_code} · {caseItem.problem_name ?? 'N.D.'}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200">✕</button>
        </div>

        {error && <div className="mb-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {isEditing ? (
            <>
              <div className="sm:col-span-2">
                <label className="text-xs text-slate-400">Macchina</label>
                <div className="mt-1"><MachineSearchSelect machines={machines} value={machineId} onChange={setMachineId} /></div>
              </div>

              <div>
                <label className="text-xs text-slate-400">Problema</label>
                <select value={problemId} onChange={(e) => handleProblemChange(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-xs text-slate-100 outline-none">
                  <option value="">Nessuno</option>
                  {problems.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400">Causa {loadingCauses && <span className="text-slate-500">(caricamento...)</span>}</label>
                <select value={causeId} onChange={(e) => handleCauseChange(e.target.value)} disabled={!problemId || loadingCauses} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-xs text-slate-100 outline-none disabled:opacity-50">
                  <option value="">{!problemId ? 'Seleziona prima un problema' : 'Seleziona causa'}</option>
                  {filteredCauses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="sm:col-span-2">
                <MultiSelect
                  label="Pezzi di Ricambio"
                  options={spareParts}
                  selectedValues={pezziRicambio}
                  onChange={setPezziRicambio}
                  placeholder={!machineId ? 'Seleziona prima una macchina' : 'Seleziona ricambi...'}
                  helperText={selectedMachine ? `Tipo macchina: ${selectedMachine.type || selectedMachine.tipologia || ''}` : ''}
                />
              </div>

              <div className="sm:col-span-2">
                <MultiSelect
                  label="Soluzioni Provate"
                  options={solutionsByCurrentCause}
                  selectedValues={soluzioniProvate}
                  onChange={setSoluzioniProvate}
                  placeholder={loadingSolutions ? 'Caricamento...' : !problemId ? 'Seleziona prima un problema' : !causeId ? 'Seleziona una causa per filtrare' : 'Seleziona soluzioni provate...'}
                  disabled={!problemId}
                />
              </div>

              <div className="sm:col-span-2">
                <MultiSelect
                  label="Soluzioni Applicate"
                  options={solutionsByCurrentCause}
                  selectedValues={soluzioniApplicate}
                  onChange={setSoluzioniApplicate}
                  placeholder={loadingSolutions ? 'Caricamento...' : !problemId ? 'Seleziona prima un problema' : !causeId ? 'Seleziona una causa per filtrare' : 'Seleziona soluzioni applicate...'}
                  required={true}
                  disabled={!problemId}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs text-slate-400">Tempo Impiego (Ore)</label>
                <div className="mt-2 flex items-center gap-3">
                  <button type="button" onClick={() => setTempoImpiego((t) => Math.max(0.5, t - 0.5))} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-md font-bold text-slate-300 hover:bg-slate-800 transition">-</button>
                  <div className="flex-1 h-10 rounded-xl border border-slate-700 bg-slate-950/80 px-4 flex items-center justify-center text-slate-100 font-semibold text-xs">{tempoImpiego}h ({Math.floor(tempoImpiego)}h {Math.round((tempoImpiego % 1) * 60)}m)</div>
                  <button type="button" onClick={() => setTempoImpiego((t) => Math.min(999, t + 0.5))} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-md font-bold text-slate-300 hover:bg-slate-800 transition">+</button>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs text-slate-400">Note</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-xs text-slate-100 outline-none resize-none focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/10 transition"
                  placeholder="Aggiungi note..."
                />
              </div>
            </>
          ) : (
            <>
              <div className="sm:col-span-2">
                <span className="text-xs text-slate-500">Macchina</span>
                <div className="text-sm font-medium text-slate-200 mt-1">{caseItem.machine_code} - {caseItem.machine_name}</div>
              </div>
              <div>
                <span className="text-xs text-slate-500">Problema</span>
                <div className="text-sm font-medium text-slate-200 mt-1">{caseItem.problem_name || 'N.D.'}</div>
              </div>
              <div>
                <span className="text-xs text-slate-500">Causa</span>
                <div className="text-sm font-medium text-slate-200 mt-1">{caseItem.cause_name || 'N.D.'}</div>
              </div>
              <div className="sm:col-span-2">
                <span className="text-xs text-slate-500">Pezzi di Ricambio</span>
                <div className="text-sm font-medium text-slate-200 mt-1">{(caseItem.pezzi_ricambio || []).map((p) => p.name).join(', ') || caseItem.spare_part_name || 'Nessuno'}</div>
              </div>
              <div className="sm:col-span-2">
                <span className="text-xs text-slate-500">Soluzioni Provate</span>
                <div className="text-sm font-medium text-slate-200 mt-1">{(caseItem.soluzioni_provate || []).map((s) => s.name).join(', ') || 'Nessuna'}</div>
              </div>
              <div className="sm:col-span-2">
                <span className="text-xs text-slate-500">Soluzioni Applicate</span>
                <div className="text-sm font-medium text-slate-200 mt-1">{(caseItem.soluzioni_applicate || []).map((s) => s.name).join(', ') || caseItem.solution_applied_name || 'Nessuna'}</div>
              </div>
              <div>
                <span className="text-xs text-slate-500">Tempo Impiego</span>
                <div className="text-sm font-medium text-slate-200 mt-1">
                  {caseItem.tempo_impiego
                    ? `${caseItem.tempo_impiego}h (${Math.floor(Number(caseItem.tempo_impiego))}h ${Math.round((Number(caseItem.tempo_impiego) % 1) * 60)}m)`
                    : 'N.D.'}
                </div>
              </div>
              <div>
                <span className="text-xs text-slate-500">Data apertura</span>
                <div className="text-sm font-medium text-slate-200 mt-1">
                  {caseItem.created_at ? new Date(caseItem.created_at).toLocaleString('it-IT') : 'N.D.'}
                </div>
              </div>
              {caseItem.notes && (
                <div className="sm:col-span-2">
                  <span className="text-xs text-slate-500">Note</span>
                  <div className="text-sm font-medium text-slate-200 mt-1 whitespace-pre-wrap">{caseItem.notes}</div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          {canEdit && !isEditing && (
            <button type="button" onClick={() => setIsEditing(true)}
              className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 transition">
              Modifica
            </button>
          )}
          {isEditing && (
            <>
              <button type="button" onClick={() => setIsEditing(false)} disabled={loading}
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800 transition">
                Annulla
              </button>
              <button type="button" onClick={handleSave} disabled={loading}
                className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50 transition">
                {loading ? 'Salvataggio...' : 'Salva'}
              </button>
            </>
          )}
          {!isEditing && (
            <button type="button" onClick={onClose}
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800 transition">
              Chiudi
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
