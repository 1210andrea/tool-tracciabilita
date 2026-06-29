import { useEffect, useState } from 'react';
import axios from 'axios';

const API_URL = '/api';

type CategoryItem = { id: string; type: string; name: string };
type MachineItem = { id: string; code: string; name: string; type?: string; reparto?: string };
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
  operator_name?: string;
  ai_solution?: string | null;
};

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
  // modalità: 'view' = sola lettura, 'edit' = modifica
  const [mode, setMode] = useState<'view' | 'edit'>('view');

  const [machineId, setMachineId] = useState('');
  const [problemId, setProblemId] = useState('');
  const [causeId, setCauseId] = useState('');
  const [sparePartId, setSparePartId] = useState('');
  const [solutionAppliedId, setSolutionAppliedId] = useState('');
  const [spareParts, setSpareParts] = useState<SparePartItem[]>([]);
  const [solutions, setSolutions] = useState<SolutionItem[]>([]);
  const [fullCase, setFullCase] = useState<CaseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingCase, setLoadingCase] = useState(false);
  const [loadingParts, setLoadingParts] = useState(false);

  // Carica soluzioni disponibili
  useEffect(() => {
    if (!token) return;
    axios.get(`${API_URL}/solutions-applied`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setSolutions(r.data.items || []))
      .catch(() => setSolutions([]));
  }, [token]);

  // Quando si apre il modal, resetta la modalità a 'view' e carica il caso completo
  useEffect(() => {
    if (!open || !caseItem || !token) return;
    setMode('view');
    setError(null);
    setLoadingCase(true);
    setFullCase(null);
    axios.get(`${API_URL}/cases/${caseItem.id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        const full = r.data?.item ?? r.data;
        setFullCase(full);
        setMachineId(full.machine_id ?? caseItem.machine_id ?? '');
        setProblemId(full.problem_id ?? caseItem.problem_id ?? '');
        setCauseId(full.cause_id ?? caseItem.cause_id ?? '');
        setSparePartId(full.spare_part_id ?? caseItem.spare_part_id ?? '');
        setSolutionAppliedId(full.solution_applied_id ?? caseItem.solution_applied_id ?? '');
      })
      .catch(() => {
        // fallback
        setMachineId(caseItem.machine_id ?? '');
        setProblemId(caseItem.problem_id ?? '');
        setCauseId(caseItem.cause_id ?? '');
        setSparePartId(caseItem.spare_part_id ?? '');
        setSolutionAppliedId(caseItem.solution_applied_id ?? '');
      })
      .finally(() => setLoadingCase(false));
  }, [open, caseItem, token]);

  // Carica ricambi compatibili quando cambia la macchina
  useEffect(() => {
    if (!token || !machineId) {
      setSpareParts([]);
      return;
    }
    const machine = machines.find((m) => m.id === machineId);
    const repartoOrType = machine?.reparto ?? machine?.type;
    if (!repartoOrType) return;

    setLoadingParts(true);
    axios.get(`${API_URL}/spare-parts/by-type/${encodeURIComponent(repartoOrType)}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((r) => setSpareParts(r.data.items || []))
      .catch(() => setSpareParts([]))
      .finally(() => setLoadingParts(false));
  }, [token, machineId, machines]);

  if (!open || !caseItem) return null;

  const problems = categories.filter((c) => c.type === 'problem');
  const causes = categories.filter((c) => c.type === 'cause');
  const isReadOnly = mode === 'view';

  // Helpers per mostrare il nome invece dell'id in modalità sola lettura
  const machineName = (() => {
    const m = machines.find((x) => x.id === machineId);
    return m ? `${m.code} - ${m.name}` : (fullCase?.machine_code ?? caseItem.machine_code ?? machineId);
  })();
  const problemName = problems.find((x) => x.id === problemId)?.name ?? fullCase?.problem_name ?? caseItem.problem_name ?? '—';
  const causeName = causes.find((x) => x.id === causeId)?.name ?? fullCase?.cause_name ?? caseItem.cause_name ?? '—';
  const sparePartName = spareParts.find((x) => x.id === sparePartId)?.name ?? fullCase?.spare_part_name ?? caseItem.spare_part_name ?? '—';
  const solutionName = solutions.find((x) => x.id === solutionAppliedId)?.name ?? fullCase?.solution_applied_name ?? caseItem.solution_applied_name ?? '—';

  const handleSave = async () => {
    if (!machineId || !problemId || !causeId || !sparePartId || !solutionAppliedId) {
      setError('Compila tutti i campi obbligatori.');
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
          spare_part_id: sparePartId,
          solution_applied_id: solutionAppliedId,
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

  const formFieldClass = 'mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none disabled:opacity-70';
  const labelClass = 'text-xs text-slate-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 p-5 shadow-xl sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-100">
              {mode === 'edit' ? 'Modifica caso' : 'Dettaglio caso'}
            </h2>
            <p className="text-sm text-slate-400">
              {caseItem.machine_code} · {caseItem.problem_name ?? '—'}
              {caseItem.created_at && (
                <span className="ml-2">· {new Date(caseItem.created_at).toLocaleDateString('it-IT')}</span>
              )}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200">✕</button>
        </div>

        {loadingCase && (
          <div className="mb-4 text-sm text-slate-400">Caricamento dati caso...</div>
        )}

        {error && <div className="mb-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

        {/* ── MODALITÀ SOLA LETTURA ── */}
        {isReadOnly && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Operatore */}
            {(fullCase?.operator_name ?? caseItem.operator_name) && (
              <div className="sm:col-span-2">
                <p className={labelClass}>Operatore</p>
                <p className="mt-1 rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2.5 text-sm text-slate-100">
                  {fullCase?.operator_name ?? caseItem.operator_name}
                </p>
              </div>
            )}

            {/* Macchina */}
            <div className="sm:col-span-2">
              <p className={labelClass}>Macchina</p>
              <p className="mt-1 rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2.5 text-sm text-slate-100">{machineName}</p>
            </div>

            {/* Problema */}
            <div>
              <p className={labelClass}>Problema</p>
              <p className="mt-1 rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2.5 text-sm text-slate-100">{problemName}</p>
            </div>

            {/* Causa */}
            <div>
              <p className={labelClass}>Causa</p>
              <p className="mt-1 rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2.5 text-sm text-slate-100">{causeName}</p>
            </div>

            {/* Pezzo di ricambio */}
            <div>
              <p className={labelClass}>Pezzo di ricambio</p>
              <p className="mt-1 rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2.5 text-sm text-slate-100">{sparePartName}</p>
            </div>

            {/* Soluzione applicata */}
            <div>
              <p className={labelClass}>Soluzione applicata</p>
              <p className="mt-1 rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2.5 text-sm text-slate-100">{solutionName}</p>
            </div>

            {/* Soluzione IA */}
            {(fullCase?.ai_solution ?? caseItem.ai_solution) && (
              <div className="sm:col-span-2">
                <p className={labelClass}>Soluzione IA</p>
                <p className="mt-1 rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2.5 text-sm text-slate-100 whitespace-pre-wrap">
                  {fullCase?.ai_solution ?? caseItem.ai_solution}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── MODALITÀ MODIFICA ── */}
        {!isReadOnly && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Macchina */}
            <div className="sm:col-span-2">
              <label className={labelClass}>Macchina <span className="text-red-400">*</span></label>
              <select
                value={machineId}
                onChange={(e) => { setMachineId(e.target.value); setSparePartId(''); }}
                className={formFieldClass}
              >
                <option value="">Seleziona macchina</option>
                {machines.map((m) => <option key={m.id} value={m.id}>{m.code} - {m.name}</option>)}
              </select>
            </div>

            {/* Problema */}
            <div>
              <label className={labelClass}>Problema <span className="text-red-400">*</span></label>
              <select value={problemId} onChange={(e) => setProblemId(e.target.value)} className={formFieldClass}>
                <option value="">Seleziona problema</option>
                {problems.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {/* Causa */}
            <div>
              <label className={labelClass}>Causa <span className="text-red-400">*</span></label>
              <select value={causeId} onChange={(e) => setCauseId(e.target.value)} className={formFieldClass}>
                <option value="">Seleziona causa</option>
                {causes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Pezzo di ricambio */}
            <div>
              <label className={labelClass}>Pezzo di ricambio <span className="text-red-400">*</span></label>
              <select
                value={sparePartId}
                onChange={(e) => setSparePartId(e.target.value)}
                disabled={!machineId || loadingParts}
                className={formFieldClass}
              >
                <option value="">
                  {!machineId ? 'Seleziona prima una macchina' : loadingParts ? 'Caricamento...' : 'Seleziona ricambio'}
                </option>
                {spareParts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {/* Soluzione applicata */}
            <div>
              <label className={labelClass}>Soluzione applicata <span className="text-red-400">*</span></label>
              <select value={solutionAppliedId} onChange={(e) => setSolutionAppliedId(e.target.value)} className={formFieldClass}>
                <option value="">Seleziona soluzione</option>
                {solutions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-2xl border border-slate-700 px-4 py-2 text-sm text-slate-100 hover:bg-slate-800">
            Chiudi
          </button>

          {/* In sola lettura: mostra "Modifica" solo se canEdit */}
          {isReadOnly && canEdit && (
            <button
              type="button"
              onClick={() => setMode('edit')}
              className="rounded-2xl bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400"
            >
              Modifica
            </button>
          )}

          {/* In modalità modifica: Annulla + Salva */}
          {!isReadOnly && (
            <>
              <button
                type="button"
                onClick={() => { setMode('view'); setError(null); }}
                className="rounded-2xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Annulla modifica
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={loading || loadingCase}
                className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
              >
                {loading ? 'Salvataggio...' : 'Salva modifiche'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
