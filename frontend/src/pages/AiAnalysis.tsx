import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API_URL = '/api';

type MachineItem = { id: string; code: string; name: string; line?: string };
type CategoryItem = { id: string; type: string; name: string };

type AiResult = {
  insufficient: boolean;
  message?: string;
  analysis?: string;
  stats?: {
    same_machine_problem: number;
    same_problem_line: number;
    total_similar: number;
  };
};

export default function AiAnalysis() {
  const { token } = useAuth();
  const [machines, setMachines] = useState<MachineItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [machineId, setMachineId] = useState('');
  const [problemId, setProblemId] = useState('');
  const [causeId, setCauseId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiResult | null>(null);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      axios.get(`${API_URL}/machines`, { headers: { Authorization: `Bearer ${token}` } }),
      axios.get(`${API_URL}/categories`, { headers: { Authorization: `Bearer ${token}` } })
    ]).then(([m, c]) => {
      setMachines(m.data.items || []);
      setCategories(c.data.items || []);
    }).catch(() => {
      setMachines([]);
      setCategories([]);
    });
  }, [token]);

  const problems = categories.filter((c) => c.type === 'problem');
  const causes = categories.filter((c) => c.type === 'cause');
  const selectedMachine = machines.find((m) => m.id === machineId);

  const runAnalysis = async () => {
    if (!token) return;
    if (!machineId) {
      setError('Seleziona una macchina.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const resp = await axios.post(
        `${API_URL}/ai/analyze`,
        {
          machine_id: machineId,
          problem_id: problemId || undefined,
          cause_id: causeId || undefined
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setResult(resp.data);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Errore durante l\'analisi IA.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Analisi IA</h1>
        <p className="mt-1 text-sm text-slate-400">
          Cerca nel database quante volte si è verificato un problema simile e come è stato risolto.
        </p>
      </div>

      <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-xs text-slate-400">Macchina <span className="text-red-400">*</span></label>
            <select value={machineId} onChange={(e) => setMachineId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none">
              <option value="">Seleziona macchina</option>
              {machines.map((m) => <option key={m.id} value={m.id}>{m.code} - {m.name}{m.line ? ` (${m.line})` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400">Problema</label>
            <select value={problemId} onChange={(e) => setProblemId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none">
              <option value="">Opzionale</option>
              {problems.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-slate-400">Causa</label>
            <select value={causeId} onChange={(e) => setCauseId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none">
              <option value="">Opzionale</option>
              {causes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        {selectedMachine?.line && (
          <p className="mt-3 text-sm text-slate-500">Linea selezionata: <span className="text-slate-300">{selectedMachine.line}</span></p>
        )}

        {error && <div className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

        <button
          type="button"
          onClick={runAnalysis}
          disabled={loading}
          className="mt-5 rounded-2xl bg-violet-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-60"
        >
          {loading ? 'Analisi in corso...' : 'Avvia analisi IA'}
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-3 rounded-3xl border border-slate-700 bg-slate-900/80 px-5 py-6 text-sm text-slate-300">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
          Ollama sta analizzando i casi storici nel database...
        </div>
      )}

      {result?.insufficient && !loading && (
        <div className="rounded-3xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-100">
          {result.message}
        </div>
      )}

      {result && !result.insufficient && !loading && (
        <div className="space-y-4">
          {result.stats && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-900/80 p-4 text-center">
                <div className="text-2xl font-semibold text-violet-300">{result.stats.same_machine_problem}</div>
                <div className="mt-1 text-xs text-slate-400">Stessa macchina + problema</div>
              </div>
              <div className="rounded-2xl bg-slate-900/80 p-4 text-center">
                <div className="text-2xl font-semibold text-violet-300">{result.stats.same_problem_line}</div>
                <div className="mt-1 text-xs text-slate-400">Stesso problema in linea</div>
              </div>
              <div className="rounded-2xl bg-slate-900/80 p-4 text-center">
                <div className="text-2xl font-semibold text-violet-300">{result.stats.total_similar}</div>
                <div className="mt-1 text-xs text-slate-400">Casi simili totali</div>
              </div>
            </div>
          )}
          <div className="rounded-3xl border border-violet-500/20 bg-slate-900/80 p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-violet-300">Risultato analisi</h2>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{result.analysis}</div>
          </div>
        </div>
      )}
    </div>
  );
}
