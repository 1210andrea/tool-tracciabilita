import { useEffect, useState } from 'react';
import axios from 'axios';
import { MachineSearchSelect } from './MachineSearchSelect';

const API_URL = '/api';

type CategoryItem = { id: string; type: string; name: string };
type MachineItem = { id: string; code: string; name: string; type?: string; tipologia?: string };
type SparePartItem = { id: string; name: string };
type SolutionItem = { id: string; name: string };

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
  label,
  options,
  selectedValues,
  onChange,
  placeholder = 'Seleziona...',
  helperText,
  disabled = false,
  required = false
}: {
  label: string;
  options: { id: string; name: string }[];
  selectedValues: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleValue = (id: string) => {
    if (selectedValues.includes(id)) {
      onChange(selectedValues.filter((v) => v !== id));
    } else {
      onChange([...selectedValues, id]);
    }
  };

  return (
    <div className="relative space-y-1">
      <label className="text-xs text-slate-400 flex justify-between">
        <span>{label} {required && <span className="text-red-400">*</span>}</span>
        {selectedValues.length > 0 && (
          <span className="text-xs text-sky-400 font-semibold">
            {selectedValues.length} selezionat{selectedValues.length === 1 ? 'o' : 'i'}
          </span>
        )}
      </label>
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen(!isOpen)}
          className="w-full text-left rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-xs text-slate-100 outline-none flex justify-between items-center focus:border-sky-500/40 focus:ring-2 focus:ring-sky-500/10 disabled:opacity-60 transition duration-150"
        >
          <span className="truncate">
            {selectedValues.length > 0
              ? options
                  .filter((o) => selectedValues.includes(o.id))
                  .map((o) => o.name)
                  .join(', ')
              : placeholder}
          </span>
          {!disabled && (
            <svg
              className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
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
                options.map((opt) => {
                  const isChecked = selectedValues.includes(opt.id);
                  return (
                    <label
                      key={opt.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-sky-500/20 hover:text-sky-300 text-slate-200 text-xs cursor-pointer transition select-none"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleValue(opt.id)}
                        className="accent-sky-500 h-4 w-4 cursor-pointer rounded"
                      />
                      <span className="truncate">{opt.name}</span>
                    </label>
                  );
                })
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
  open,
  token,
  caseItem,
  machines,
  categories,
  canEdit,
  onClose,
  onSaved,
}: {
  open: boolean;
  token: string;
  caseItem: CaseDetail | null;
  machines: MachineItem[];
  categories: CategoryItem[];
  canEdit: boolean;
  isAdmin?: boolean;
  onClose: () => void;
  onSaved: () => void;
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
  const [solutions, setSolutions] = useState<SolutionItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!token) return;
    axios.get(`${API_URL}/solutions-applied`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setSolutions(r.data.items || []))
      .catch(() => setSolutions([]));
  }, [token]);

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

  useEffect(() => {
    if (!token || !machineId) {
      setSpareParts([]);
      return;
    }
    const machine = machines.find((m) => m.id === machineId);
    const tipologia = (machine?.type || machine?.tipologia) as string | undefined;
    if (!tipologia) return;

    axios.get(`${API_URL}/spare-parts/by-type/${encodeURIComponent(tipologia)}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((r) => setSpareParts(r.data.items || []))
      .catch(() => setSpareParts([]));
  }, [token, machineId, machines]);

  if (!open || !caseItem) return null;

  const problems = categories.filter((c) => c.type === 'problem');
  const causes = categories.filter((c) => c.type === 'cause');
  const isEditing = canEdit && editing;

  const handleSave = async () => {
    if (!canEdit) return;
    if (!machineId || !problemId || !causeId || !soluzioniApplicate.length) {
      setError('Compila tutti i campi obbligatori: macchina, problema, causa e almeno una soluzione applicata.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await axios.put(
        `${API_URL}/cases/${caseItem.id}`,
        {
          machine_id: machineId,
          problem_id: problemId,
          cause_id: causeId,
          soluzioni_provate: soluzioniProvate,
          soluzioni_applicate: soluzioniApplicate,
          pezzi_ricambio: pezziRicambio,
          tempo_impiego: tempoImpiego,
          notes: notes.trim() || null,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      onSaved();
      onClose();
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
                <div className="mt-1">
                  <MachineSearchSelect machines={machines} value={machineId} onChange={setMachineId} />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400">Problema</label>
                <select value={problemId} onChange={(e) => setProblemId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-xs text-slate-100 outline-none">
                  <option value="">Nessuno</option>
                  {problems.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400">Causa</label>
                <select value={causeId} onChange={(e) => setCauseId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-xs text-slate-100 outline-none">
                  <option value="">Nessuna</option>
                  {causes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="sm:col-span-2">
                <MultiSelect
                  label="Pezzi di Ricambio"
                  options={spareParts}
                  selectedValues={pezziRicambio}
                  onChange={setPezziRicambio}
                  placeholder={!machineId ? 'Seleziona prima una macchina' : 'Seleziona ricambi...'}
                  helperText={selectedMachine ? `Tipo macchina: ${selectedMachine.type || ''}` : ''}
                />
              </div>

              <div className="sm:col-span-2">
                <MultiSelect
                  label="Soluzioni Provate"
                  options={solutions}
                  selectedValues={soluzioniProvate}
                  onChange={setSoluzioniProvate}
                  placeholder="Seleziona soluzioni provate..."
                />
              </div>

              <div className="sm:col-span-2">
                <MultiSelect
                  label="Soluzioni Applicate"
                  options={solutions}
                  selectedValues={soluzioniApplicate}
                  onChange={setSoluzioniApplicate}
                  placeholder="Seleziona soluzioni applicate..."
                  required={true}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs text-slate-400">Tempo Impiego (Ore)</label>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setTempoImpiego((t) => Math.max(0.5, t - 0.5))}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-md font-bold text-slate-300 hover:bg-slate-800 transition"
                  >
                    -
                  </button>
                  <div className="flex-1 h-10 rounded-xl border border-slate-700 bg-slate-950/80 px-4 flex items-center justify-center text-slate-100 font-semibold text-xs">
                    {tempoImpiego}h ({Math.floor(tempoImpiego)}h {Math.round((tempoImpiego % 1) * 60)}m)
                  </div>
                  <button
                    type="button"
                    onClick={() => setTempoImpiego((t) => Math.min(999, t + 0.5))}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-md font-bold text-slate-300 hover:bg-slate-800 transition"
                  >
                    +
                  </button>
                </div>
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
                <div className="text-sm font-medium text-slate-200 mt-1">
                  {(caseItem.pezzi_ricambio || []).map((p) => p.name).join(', ') || caseItem.spare_part_name || 'Nessuno'}
                </div>
              </div>

              <div className="sm:col-span-2">
                <span className="text-xs text-slate-500">Soluzioni Provate</span>
                <div className="text-sm font-medium text-slate-200 mt-1">
                  {(caseItem.soluzioni_provate || []).map((s) => s.name).join(', ') || 'Nessuna'}
                </div>
              </div>

              <div className="sm:col-span-2">
                <span className="text-xs text-slate-500">Soluzioni Applicate</span>
                <div className="text-sm font-medium text-slate-200 mt-1">
                  {(caseItem.soluzioni_applicate || []).map((s) => s.name).join(', ') || caseItem.solution_applied_name || 'Nessuna'}
                </div>
              </div>

              <div className="sm:col-span-2">
                <span className="text-xs text-slate-500">Tempo Impiego</span>
                <div className="text-sm font-medium text-slate-200 mt-1">
                  {caseItem.tempo_impiego ? `${caseItem.tempo_impiego}h (${Math.floor(caseItem.tempo_impiego)}h ${Math.round((caseItem.tempo_impiego % 1) * 60)}m)` : '—'}
                </div>
              </div>
            </>
          )}

          <div className="sm:col-span-2">
            <div className="flex justify-between items-center">
              <label className="text-xs text-slate-400">Note aggiuntive</label>
              {canEdit && <span className="text-[10px] text-slate-500">{notes.length}/1000 caratteri</span>}
            </div>
            {isEditing ? (
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
                placeholder="Aggiungi dettagli aggiuntivi..."
                className="mt-1 w-full h-24 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs text-slate-100 outline-none resize-none focus:border-sky-500/50 transition-colors"
              />
            ) : (
              <div className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-xs text-slate-300 min-h-[4rem] whitespace-pre-wrap">
                {notes || <span className="text-slate-500 italic">Nessuna nota aggiuntiva</span>}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-2xl border border-slate-700 px-4 py-2 text-xs text-slate-100 hover:bg-slate-800">Chiudi</button>
          {canEdit && !isEditing && (
            <button type="button" onClick={() => setIsEditing(true)} className="rounded-2xl bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400">
              Modifica
            </button>
          )}
          {isEditing && (
            <>
              <button type="button" onClick={() => setIsEditing(false)} className="rounded-2xl border border-slate-700 px-4 py-2 text-xs text-slate-100 hover:bg-slate-800">Annulla</button>
              <button type="button" onClick={handleSave} disabled={loading} className="rounded-2xl bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-60">
                {loading ? 'Salvataggio...' : 'Salva modifiche'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
