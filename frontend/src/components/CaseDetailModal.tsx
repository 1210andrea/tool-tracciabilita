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
  title: string;
  solution?: string | null;
  description?: string | null;
  status: string;
  machine_code?: string;
  machine_name?: string;
  operator_name?: string;
  problem_name?: string;
  cause_name?: string;
};

type AiInsights = {
  insufficient: boolean;
  message?: string;
  analysis?: string;
  stats?: {
    same_machine_problem: number;
    same_problem_line: number;
    total_similar: number;
  };
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
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<'details' | 'ai'>('details');
  const [machineId, setMachineId] = useState('');
  const [operatorId, setOperatorId] = useState('');
  const [problemId, setProblemId] = useState('');
  const [causeId, setCauseId] = useState('');
  const [title, setTitle] = useState('');
  const [solution, setSolution] = useState('');
  const [status, setStatus] = useState('open');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInsights, setAiInsights] = useState<AiInsights | null>(null);

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
    setTab('details');
    setAiInsights(null);
  }, [caseItem]);

  useEffect(() => {
    if (!open || !caseItem || tab !== 'ai') return;

    let cancelled = false;
    setAiLoading(true);
    setAiInsights(null);

    axios
      .get(`${API_URL}/cases/${caseItem.id}/ai-insights`, { headers: { Authorization: `Bearer ${token}` } })
      .then((resp) => {
        if (!cancelled) setAiInsights(resp.data);
      })
      .catch(() => {
        if (!cancelled) {
          setAiInsights({
            insufficient: true,
            message: 'Errore nel recupero dell\'analisi IA. Riprova più tardi.'
          });
        }
      })
      .finally(() => {
        if (!cancelled) setAiLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, caseItem, tab, token]);

  if (!open || !caseItem) return null;

  const operators = categories.filter((c) => c.type === 'operator');
  const problems = categories.filter((c) => c.type === 'problem');
  const causes = categories.filter((c) => c.type === 'cause');

  const handleSave = async () => {
    if (!canEdit) return;
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
        { machine_id: machineId, operator_id: operatorId, problem_id: problemId, cause_id: causeId, title, solution, status },
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
            <h2 className="text-xl font-semibold text-slate-100">{caseItem.title}</h2>
            <p className="text-sm text-slate-400">
              {caseItem.machine_code} · {caseItem.problem_name ?? 'N/D'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200">✕</button>
        </div>

        <div className="mb-5 flex gap-2 border-b border-slate-700 pb-3">
          <button
            type="button"
            onClick={() => setTab('details')}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${tab === 'details' ? 'bg-sky-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}
          >
            Dettagli
          </button>
          <button
            type="button"
            onClick={() => setTab('ai')}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${tab === 'ai' ? 'bg-violet-500 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
          >
            IA
          </button>
        </div>

        {tab === 'details' && (
          <>
            {error && <div className="mb-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}
            {!canEdit && (
              <div className="mb-4 rounded-xl bg-slate-800/80 px-4 py-3 text-sm text-slate-300">Sola lettura.</div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-xs text-slate-400">Macchina</label>
                <select value={machineId} disabled={!canEdit} onChange={(e) => setMachineId(e.target.value)} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none disabled:opacity-60">
                  <option value="">Seleziona</option>
                  {machines.map((m) => <option key={m.id} value={m.id}>{m.code} - {m.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400">Operatore</label>
                <select value={operatorId} disabled={!canEdit} onChange={(e) => setOperatorId(e.target.value)} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none disabled:opacity-60">
                  <option value="">Seleziona</option>
                  {operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400">Problema</label>
                <select value={problemId} disabled={!canEdit} onChange={(e) => setProblemId(e.target.value)} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none disabled:opacity-60">
                  <option value="">Seleziona</option>
                  {problems.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400">Causa</label>
                <select value={causeId} disabled={!canEdit} onChange={(e) => setCauseId(e.target.value)} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none disabled:opacity-60">
                  <option value="">Seleziona</option>
                  {causes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400">Stato</label>
                <select value={status} disabled={!canEdit} onChange={(e) => setStatus(e.target.value)} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none disabled:opacity-60">
                  <option value="open">Aperto</option>
                  <option value="in_progress">In corso</option>
                  <option value="closed">Chiuso</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-slate-400">Titolo</label>
                <input value={title} disabled={!canEdit} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none disabled:opacity-60" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-slate-400">Descrizione / soluzione</label>
                <textarea value={solution} disabled={!canEdit} onChange={(e) => setSolution(e.target.value)} rows={5} className="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none disabled:opacity-60" />
              </div>
            </div>
            {canEdit && (
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button type="button" onClick={onClose} className="rounded-2xl border border-slate-700 px-4 py-2 text-sm text-slate-100 hover:bg-slate-800">Chiudi</button>
                <button type="button" onClick={handleSave} disabled={loading} className="rounded-2xl bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-60">
                  {loading ? 'Salvataggio...' : 'Salva modifiche'}
                </button>
              </div>
            )}
          </>
        )}

        {tab === 'ai' && (
          <div className="space-y-4">
            {aiLoading && (
              <div className="flex items-center gap-3 rounded-2xl bg-slate-950/80 px-4 py-6 text-sm text-slate-300">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
                Analisi in corso con Ollama sui casi storici...
              </div>
            )}
            {!aiLoading && aiInsights?.insufficient && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
                {aiInsights.message}
              </div>
            )}
            {!aiLoading && aiInsights && !aiInsights.insufficient && (
              <>
                {aiInsights.stats && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-slate-950/80 p-4 text-center">
                      <div className="text-2xl font-semibold text-violet-300">{aiInsights.stats.same_machine_problem}</div>
                      <div className="mt-1 text-xs text-slate-400">Stessa macchina + problema</div>
                    </div>
                    <div className="rounded-2xl bg-slate-950/80 p-4 text-center">
                      <div className="text-2xl font-semibold text-violet-300">{aiInsights.stats.same_problem_line}</div>
                      <div className="mt-1 text-xs text-slate-400">Stesso problema in linea</div>
                    </div>
                    <div className="rounded-2xl bg-slate-950/80 p-4 text-center">
                      <div className="text-2xl font-semibold text-violet-300">{aiInsights.stats.total_similar}</div>
                      <div className="mt-1 text-xs text-slate-400">Casi simili totali</div>
                    </div>
                  </div>
                )}
                <div className="rounded-2xl border border-violet-500/20 bg-slate-950/80 p-4">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-violet-300">Analisi IA</h3>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{aiInsights.analysis}</div>
                </div>
              </>
            )}
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className="rounded-2xl border border-slate-700 px-4 py-2 text-sm text-slate-100 hover:bg-slate-800">Chiudi</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
