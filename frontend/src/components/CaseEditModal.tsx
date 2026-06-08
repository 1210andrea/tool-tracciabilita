import { useEffect, useState } from 'react';
import axios from 'axios';

const API_URL = '/api';

type CategoryItem = { id: string; type: string; name: string };
type MachineItem = { id: string; code: string; name: string };

export type EditableCase = {
  id: string;
  machine_id: string;
  operator_id?: string | null;
  problem_id?: string | null;
  cause_id?: string | null;
  title: string;
  solution?: string | null;
  description?: string | null;
  status: string;
};

export function CaseEditModal({
  open,
  token,
  caseItem,
  machines,
  categories,
  onClose,
  onSaved,
}: {
  open: boolean;
  token: string;
  caseItem: EditableCase | null;
  machines: MachineItem[];
  categories: CategoryItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [machineId, setMachineId] = useState('');
  const [operatorId, setOperatorId] = useState('');
  const [problemId, setProblemId] = useState('');
  const [causeId, setCauseId] = useState('');
  const [title, setTitle] = useState('');
  const [solution, setSolution] = useState('');
  const [status, setStatus] = useState('open');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!caseItem) return;
    setMachineId(caseItem.machine_id);
    setOperatorId(caseItem.operator_id ?? '');
    setProblemId(caseItem.problem_id ?? '');
    setCauseId(caseItem.cause_id ?? '');
    setTitle(caseItem.title);
    setSolution(caseItem.solution ?? caseItem.description ?? '');
    setStatus(caseItem.status);
    setError(null);
  }, [caseItem]);

  if (!open || !caseItem) return null;

  const operators = categories.filter((c) => c.type === 'operator');
  const problems = categories.filter((c) => c.type === 'problem');
  const causes = categories.filter((c) => c.type === 'cause');

  const handleSave = async () => {
    if (!machineId || !operatorId || !problemId || !causeId || !title || !solution.trim()) {
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
          operator_id: operatorId,
          problem_id: problemId,
          cause_id: causeId,
          title,
          solution,
          status,
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
            <h2 className="text-xl font-semibold text-slate-100">Modifica caso</h2>
            <p className="text-sm text-slate-400">Aggiorna i dettagli del ticket selezionato.</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200">✕</button>
        </div>

        {error && <div className="mb-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-xs text-slate-400">Macchina</label>
            <select value={machineId} onChange={(e) => setMachineId(e.target.value)} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none">
              <option value="">Seleziona</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>{m.code} - {m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400">Operatore</label>
            <select value={operatorId} onChange={(e) => setOperatorId(e.target.value)} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none">
              <option value="">Seleziona</option>
              {operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400">Problema</label>
            <select value={problemId} onChange={(e) => setProblemId(e.target.value)} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none">
              <option value="">Seleziona</option>
              {problems.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400">Causa</label>
            <select value={causeId} onChange={(e) => setCauseId(e.target.value)} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none">
              <option value="">Seleziona</option>
              {causes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400">Stato</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none">
              <option value="open">Aperto</option>
              <option value="in_progress">In corso</option>
              <option value="closed">Chiuso</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-slate-400">Titolo</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-slate-400">Descrizione / soluzione</label>
            <textarea value={solution} onChange={(e) => setSolution(e.target.value)} rows={5} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none" />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-2xl border border-slate-700 px-4 py-2 text-sm text-slate-100 hover:bg-slate-800">Annulla</button>
          <button type="button" onClick={handleSave} disabled={loading} className="rounded-2xl bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-60">
            {loading ? 'Salvataggio...' : 'Salva modifiche'}
          </button>
        </div>
      </div>
    </div>
  );
}
