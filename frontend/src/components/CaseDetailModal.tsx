import { useEffect, useState } from 'react';
import axios from 'axios';

const API_URL = '/api';

type CategoryItem = { id: string; type: string; name: string };
type MachineItem = { id: string; code: string; name: string; type?: string };
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
  const [machineId, setMachineId] = useState('');
  const [problemId, setProblemId] = useState('');
  const [causeId, setCauseId] = useState('');
  const [sparePartId, setSparePartId] = useState('');
  const [solutionAppliedId, setSolutionAppliedId] = useState('');
  const [solution, setSolution] = useState('');
  const [spareParts, setSpareParts] = useState<SparePartItem[]>([]);
  const [solutions, setSolutions] = useState<SolutionItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    axios.get(`${API_URL}/solutions-applied`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setSolutions(r.data.items || []))
      .catch(() => setSolutions([]));
  }, [token]);

  useEffect(() => {
    if (!caseItem) return;
    setMachineId(caseItem.machine_id);
    setProblemId(caseItem.problem_id ?? '');
    setCauseId(caseItem.cause_id ?? '');
    setSparePartId(caseItem.spare_part_id ?? '');
    setSolutionAppliedId(caseItem.solution_applied_id ?? '');
    setSolution(caseItem.solution ?? '');
    setError(null);
  }, [caseItem]);

  useEffect(() => {
    if (!token || !machineId) {
      setSpareParts([]);
      return;
    }
    const machine = machines.find((m) => m.id === machineId);
    if (!machine?.type) return;

    axios.get(`${API_URL}/spare-parts/by-type/${encodeURIComponent(machine.type)}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((r) => setSpareParts(r.data.items || []))
      .catch(() => setSpareParts([]));
  }, [token, machineId, machines]);

  if (!open || !caseItem) return null;

  const problems = categories.filter((c) => c.type === 'problem');
  const causes = categories.filter((c) => c.type === 'cause');

  const handleSave = async () => {
    if (!canEdit) return;
    if (!machineId) {
      setError('La macchina è obbligatoria.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await axios.put(
        `${API_URL}/cases/${caseItem.id}`,
        {
          machine_id: machineId,
          problem_id: problemId || null,
          cause_id: causeId || null,
          spare_part_id: sparePartId || null,
          solution_applied_id: solutionAppliedId || null,
          solution: solution || null,
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
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 p-5 shadow-xl sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-100">{canEdit ? 'Modifica caso' : 'Dettaglio caso'}</h2>
            <p className="text-sm text-slate-400">{caseItem.machine_code} · {caseItem.problem_name ?? 'N.D.'}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200">✕</button>
        </div>

        {error && <div className="mb-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-xs text-slate-400">Macchina</label>
            <select value={machineId} disabled={!canEdit} onChange={(e) => setMachineId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none disabled:opacity-60">
              <option value="">Seleziona</option>
              {machines.map((m) => <option key={m.id} value={m.id}>{m.code} - {m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400">Pezzo di ricambio</label>
            <select value={sparePartId} disabled={!canEdit} onChange={(e) => setSparePartId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none disabled:opacity-60">
              <option value="">Nessuno</option>
              {spareParts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400">Soluzione applicata</label>
            <select value={solutionAppliedId} disabled={!canEdit} onChange={(e) => setSolutionAppliedId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none disabled:opacity-60">
              <option value="">Nessuna</option>
              {solutions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400">Problema</label>
            <select value={problemId} disabled={!canEdit} onChange={(e) => setProblemId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none disabled:opacity-60">
              <option value="">Nessuno</option>
              {problems.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400">Causa</label>
            <select value={causeId} disabled={!canEdit} onChange={(e) => setCauseId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none disabled:opacity-60">
              <option value="">Nessuna</option>
              {causes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-slate-400">Soluzione</label>
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
