import { useEffect, useState } from 'react';
import axios from 'axios';

const API_URL = '/api';

type CategoryItem = { id: string; type: string; name: string };
type MachineItem = { id: string; code: string; name: string };

export type CaseDetail = {
  id: string;
  created_by?: string;
  machine_id: string;
  operator_id?: string | null;
  problem_id?: string | null;
  cause_id?: string | null;
  spare_part_id?: string | null;
  title: string;
  solution?: string | null;
  description?: string | null;
  machine_code?: string;
  machine_name?: string;
  operator_name?: string;
  problem_name?: string;
  cause_name?: string;
  spare_part_name?: string;
  created_at?: string;
};

export function CaseDetailModal({
  open,
  token,
  caseItem,
  machines,
  categories,
  canEdit,
  isAdmin,
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
  const [machineId, setMachineId] = useState('');
  const [operatorId, setOperatorId] = useState('');
  const [problemId, setProblemId] = useState('');
  const [causeId, setCauseId] = useState('');
  const [sparePartId, setSparePartId] = useState('');
  const [title, setTitle] = useState('');
  const [solution, setSolution] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!caseItem) return;
    setMachineId(caseItem.machine_id);
    setOperatorId(caseItem.operator_id ?? '');
    setProblemId(caseItem.problem_id ?? '');
    setCauseId(caseItem.cause_id ?? '');
    setSparePartId(caseItem.spare_part_id ?? '');
    setTitle(caseItem.title);
    setSolution(caseItem.solution ?? caseItem.description ?? '');
    setError(null);
  }, [caseItem]);

  if (!open || !caseItem) return null;

  const operators = categories.filter((c) => c.type === 'operator');
  const problems = categories.filter((c) => c.type === 'problem');
  const causes = categories.filter((c) => c.type === 'cause');
  const spareParts = categories.filter((c) => c.type === 'spare_part');

  const handleSave = async () => {
    if (!canEdit) return;
    if (!machineId || !problemId || !causeId || !sparePartId || !title || !solution.trim()) {
      setError('Compila tutti i campi obbligatori.');
      return;
    }
    if (solution.trim().length < 10) {
      setError('La descrizione deve contenere almeno 10 caratteri.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await axios.put(
        `${API_URL}/cases/${caseItem.id}`,
        {
          machine_id: machineId,
          ...(isAdmin ? { operator_id: operatorId } : {}),
          problem_id: problemId,
          cause_id: causeId,
          spare_part_id: sparePartId,
          title,
          solution,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-100">{canEdit ? 'Modifica caso' : 'Dettaglio caso'}</h2>
            <p className="text-sm text-slate-400">{caseItem.machine_code} · {caseItem.problem_name ?? 'N.D.'}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200">✕</button>
        </div>

        {error && <div className="mb-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-xs text-slate-400">Macchina</label>
            <select value={machineId} disabled={!canEdit} onChange={(e) => setMachineId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none disabled:opacity-60">
              <option value="">Seleziona</option>
              {machines.map((m) => <option key={m.id} value={m.id}>{m.code} - {m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400">Operatore</label>
            {isAdmin && canEdit ? (
              <select value={operatorId} onChange={(e) => setOperatorId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none">
                <option value="">Seleziona</option>
                {operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            ) : (
              <div className="mt-1 rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2.5 text-sm text-slate-300">{caseItem.operator_name ?? 'N.D.'}</div>
            )}
          </div>
          <div>
            <label className="text-xs text-slate-400">Pezzo di ricambio</label>
            <select value={sparePartId} disabled={!canEdit} onChange={(e) => setSparePartId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none disabled:opacity-60">
              <option value="">Seleziona</option>
              {spareParts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400">Problema</label>
            <select value={problemId} disabled={!canEdit} onChange={(e) => setProblemId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none disabled:opacity-60">
              <option value="">Seleziona</option>
              {problems.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400">Causa</label>
            <select value={causeId} disabled={!canEdit} onChange={(e) => setCauseId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none disabled:opacity-60">
              <option value="">Seleziona</option>
              {causes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-slate-400">Titolo</label>
            <input value={title} disabled={!canEdit} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none disabled:opacity-60" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-slate-400">Descrizione / soluzione</label>
            <textarea value={solution} disabled={!canEdit} onChange={(e) => setSolution(e.target.value)} rows={5} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none disabled:opacity-60" />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-2xl border border-slate-700 px-4 py-2 text-sm text-slate-100 hover:bg-slate-800">Chiudi</button>
          {canEdit && (
            <button type="button" onClick={handleSave} disabled={loading} className="rounded-2xl bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-60">
              {loading ? 'Salvataggio...' : 'Salva modifiche'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
