import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API_URL = '/api';

type CategoryItem = { id: string; type: string; name: string };
type MachineItem = { id: string; code: string; name: string; tipologia?: string; type?: string; reparto?: string };
type SparePartItem = { id: string; name: string; tipologie?: string[]; types?: string[] };


type SolutionItem = { id: string; name: string; description?: string };

type CaseDetailResponse = {
  item?: {
    id?: string;
    ai_solution?: string | null;
  };
};

type CreateCaseResponse = {
  item?: {
    id?: string;
    ai_solution?: string | null;
  };
};


export default function CreateCase() {
  const { token, user } = useAuth();
  const navigate = useNavigate();

  const [machines, setMachines] = useState<MachineItem[]>([]);
  const [problems, setProblems] = useState<CategoryItem[]>([]);
  const [causes, setCauses] = useState<CategoryItem[]>([]);
  const [spareParts, setSpareParts] = useState<SparePartItem[]>([]);
  const [solutions, setSolutions] = useState<SolutionItem[]>([]);

  const [machineId, setMachineId] = useState('');
  const [problemId, setProblemId] = useState('');
  const [causeId, setCauseId] = useState('');
  const [sparePartId, setSparePartId] = useState('');
  const [realTimeAi, setRealTimeAi] = useState<string | null>(null);
  const [realTimeAiStatus, setRealTimeAiStatus] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');

  const [solutionAppliedId, setSolutionAppliedId] = useState('');


  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadingParts, setLoadingParts] = useState(false);

  const [createdCaseId, setCreatedCaseId] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<'idle' | 'generating' | 'ready' | 'failed'>('idle');
  const [aiSolution, setAiSolution] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!token) return;

    const loadLookups = async () => {
      try {
        const [machinesResp, categoriesResp, solutionsResp] = await Promise.all([
          axios.get(`${API_URL}/machines`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${API_URL}/categories`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${API_URL}/solutions-applied`, { headers: { Authorization: `Bearer ${token}` } })
        ]);

        setMachines(machinesResp.data.items || []);
        const items: CategoryItem[] = categoriesResp.data.items || [];
        setProblems(items.filter((item) => item.type === 'problem'));
        setCauses(items.filter((item) => item.type === 'cause'));
        setSolutions(solutionsResp.data.items || []);
      } catch {
        setMachines([]);
        setProblems([]);
        setCauses([]);
        setSolutions([]);
      }
    };

    loadLookups();
  }, [token]);

  useEffect(() => {
    if (!token || !machineId) {
      setSpareParts([]);
      setSparePartId('');
      return;
    }

    const machine = machines.find((m) => m.id === machineId);
    const tipologia = (machine?.tipologia ?? machine?.type ?? machine?.reparto) as string | undefined;

    if (!tipologia) {
      setSpareParts([]);
      setSparePartId('');
      return;
    }


    const loadSpareParts = async () => {
      setLoadingParts(true);
      try {
        const resp = await axios.get(`${API_URL}/spare-parts/by-type/${encodeURIComponent(tipologia)}` , {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSpareParts(resp.data.items || []);
        setSparePartId('');

      } catch {
        setSpareParts([]);
      } finally {
        setLoadingParts(false);
      }
    };

    loadSpareParts();
  }, [token, machineId, machines]);


  // Real-time AI suggestions with debounce
  useEffect(() => {
    if (!token || !machineId || !problemId) {
      setRealTimeAi(null);
      setRealTimeAiStatus('idle');
      return;
    }

    setRealTimeAiStatus('loading');
    const timer = setTimeout(async () => {
      try {
        const selectedSolution = solutions.find((s) => s.id === solutionAppliedId);
        const resp = await axios.post(
          `${API_URL}/ai/suggest-solution`,
          {
            machine_id: machineId,
            problem_id: problemId || null,
            cause_id: causeId || null,
            spare_part_id: sparePartId || null,
            description: selectedSolution ? `${selectedSolution.name}: ${selectedSolution.description || ''}`.trim() : 'N/D',
            notes: notes.trim() || null
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setRealTimeAi(resp.data.suggestion);
        setRealTimeAiStatus('ready');
      } catch (err) {
        console.error(err);
        setRealTimeAiStatus('failed');
      }
    }, 1000); // 1-second debounce

    return () => clearTimeout(timer);
  }, [token, machineId, problemId, causeId, sparePartId, solutionAppliedId, solutions, notes]);


  useEffect(() => {
    if (!token || !createdCaseId) return;

    let cancelled = false;
    let interval: number | undefined;

    const poll = async () => {
      try {
        const resp = await axios.get(`${API_URL}/cases/${createdCaseId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        const data = resp.data as CaseDetailResponse;
        const ai = data?.item?.ai_solution ?? null;

        if (cancelled) return;

        if (ai) {
          setAiSolution(ai);
          setAiStatus('ready');
          if (interval) window.clearInterval(interval);
        }
      } catch {
        // keep polling until timeout in server side; for UI mark failed only on hard errors
      }
    };

    interval = window.setInterval(poll, 2000);
    // immediate try
    poll();

    return () => {
      cancelled = true;
      if (interval) window.clearInterval(interval);
    };
  }, [token, createdCaseId]);

  const handleCreate = async () => {
    if (!token) return;

    if (!machineId || !problemId || !causeId || !sparePartId || !solutionAppliedId) {
      setError('Compila tutti i campi obbligatori: macchina, problema, causa, pezzo di ricambio e soluzione applicata.');
      return;
    }

    setError(null);
    setSuccess(null);
    setLoading(true);

    setAiStatus('generating');
    setAiSolution(null);
    setCreatedCaseId(null);

    try {
      const resp = await axios.post(
        `${API_URL}/cases`,
        {
          machine_id: machineId,
          problem_id: problemId,
          cause_id: causeId,
          spare_part_id: sparePartId,
          solution_applied_id: solutionAppliedId,
          notes: notes.trim() || null
        },
        { headers: { Authorization: `Bearer ${token}` } }
      ) as { data: CreateCaseResponse };

      const id = resp.data?.item?.id;
      setCreatedCaseId(id ?? null);
      setSuccess('Caso creato! La soluzione IA è in generazione...');

      // reset selezioni form
      setMachineId('');
      setProblemId('');
      setCauseId('');
      setSparePartId('');
      setSolutionAppliedId('');
      setNotes('');

      // non navigare subito: lasciamo vedere lo stato
    } catch (err: any) {
      setAiStatus('failed');
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

      {aiStatus === 'generating' && createdCaseId && (
        <div className="rounded-2xl border border-sky-500/40 bg-sky-500/10 p-4 text-sky-100">
          ⏳ Generando soluzione IA (può impiegare fino a 30 secondi)...
        </div>
      )}

      {aiStatus === 'ready' && aiSolution && (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-emerald-100">
          ✅ Soluzione IA pronta!
          <div className="mt-2 whitespace-pre-wrap text-sm text-emerald-50">{aiSolution}</div>
        </div>
      )}

      {aiStatus === 'failed' && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-rose-200">
          ❌ Generazione IA fallita.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-3xl bg-slate-950/80 p-5 shadow-xl shadow-slate-950/10 sm:p-6">
          <label className="text-sm font-medium text-slate-200">Macchina <span className="text-red-400">*</span></label>
          <select value={machineId} onChange={(e) => setMachineId(e.target.value)} className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none">
            <option value="">Seleziona una macchina</option>
            {machines.map((machine) => (
              <option key={machine.id} value={machine.id}>{machine.code} - {machine.name}</option>
            ))}
          </select>
        </div>

        <div className="rounded-3xl bg-slate-950/80 p-5 shadow-xl shadow-slate-950/10 sm:p-6">
          <label className="text-sm font-medium text-slate-200">Pezzo di ricambio <span className="text-red-400">*</span></label>
          <select
            value={sparePartId}
            onChange={(e) => setSparePartId(e.target.value)}
            disabled={!machineId || loadingParts}
            className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none disabled:opacity-60"
          >
            <option value="">
              {!machineId ? 'Seleziona prima una macchina' : loadingParts ? 'Caricamento ricambi...' : spareParts.length ? 'Seleziona ricambio' : 'Nessun ricambio per questo tipo'}
            </option>
            {spareParts.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
          {(selectedMachine?.reparto ?? selectedMachine?.type) && (
            <p className="mt-2 text-xs text-slate-500">Tipo/Reparto macchina: {selectedMachine?.reparto ?? selectedMachine?.type}</p>
          )}

        </div>

        <div className="rounded-3xl bg-slate-950/80 p-5 shadow-xl shadow-slate-950/10 sm:p-6">
          <label className="text-sm font-medium text-slate-200">Problema <span className="text-red-400">*</span></label>
          <select value={problemId} onChange={(e) => setProblemId(e.target.value)} className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none">
            <option value="">Seleziona problema</option>
            {problems.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </div>

        <div className="rounded-3xl bg-slate-950/80 p-5 shadow-xl shadow-slate-950/10 sm:p-6">
          <label className="text-sm font-medium text-slate-200">Causa <span className="text-red-400">*</span></label>
          <select value={causeId} onChange={(e) => setCauseId(e.target.value)} className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none">
            <option value="">Seleziona causa</option>
            {causes.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </div>

        <div className="rounded-3xl bg-slate-950/80 p-5 shadow-xl shadow-slate-950/10 sm:p-6 md:col-span-2">
          <label className="text-sm font-medium text-slate-200">Descrizione / soluzione applicata <span className="text-red-400">*</span></label>
          <select value={solutionAppliedId} onChange={(e) => setSolutionAppliedId(e.target.value)} className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none">
            <option value="">Seleziona soluzione applicata</option>
            {solutions.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </div>

        <div className="rounded-3xl bg-slate-950/80 p-5 shadow-xl shadow-slate-950/10 sm:p-6 md:col-span-2">
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-slate-200">Note aggiuntive</label>
            <span className="text-xs text-slate-400">{notes.length}/1000 caratteri</span>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
            placeholder="Aggiungi dettagli aggiuntivi sull'intervento, anomalie riscontrate o altre osservazioni..."
            className="mt-3 w-full h-28 rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none resize-none focus:border-sky-500/50 transition-colors"
          />
        </div>
      </div>
      
      {machineId && problemId && (
        <div className="rounded-3xl border border-sky-500/20 bg-slate-950/80 p-5 shadow-xl shadow-sky-500/5 sm:p-6 transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-sky-400 animate-pulse" />
              <h3 className="text-md font-semibold uppercase tracking-wider text-sky-400">Analisi IA in tempo reale</h3>
            </div>
            {realTimeAiStatus === 'loading' && (
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <span className="animate-spin h-3.5 w-3.5 border-2 border-slate-600 border-t-sky-400 rounded-full" />
                Elaborazione...
              </span>
            )}
            {realTimeAiStatus === 'ready' && <span className="text-xs text-emerald-400 font-medium">Aggiornato</span>}
            {realTimeAiStatus === 'failed' && <span className="text-xs text-rose-400 font-medium">Errore di connessione</span>}
          </div>

          <div className="rounded-2xl bg-slate-900/50 p-4 border border-slate-800/80">
            {realTimeAiStatus === 'loading' && !realTimeAi && (
              <p className="text-sm text-slate-500 italic">L'intelligenza artificiale sta analizzando i parametri inseriti...</p>
            )}
            {realTimeAiStatus === 'idle' && (
              <p className="text-sm text-slate-500 italic">Inserisci la macchina e il problema per ottenere suggerimenti immediati.</p>
            )}
            {realTimeAiStatus === 'failed' && (
              <p className="text-sm text-rose-300/80">Impossibile generare suggerimenti in tempo reale. Riprova più tardi.</p>
            )}
            {realTimeAi && (
              <div className="prose prose-invert max-w-none text-slate-200 text-sm whitespace-pre-wrap leading-relaxed">
                {realTimeAi}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" className="inline-flex items-center justify-center rounded-2xl bg-sky-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60" onClick={handleCreate} disabled={!token || loading}>
          {loading ? 'Salvataggio...' : 'Crea caso'}
        </button>
        <button type="button" className="rounded-2xl border border-slate-700 bg-slate-900/90 px-6 py-3 text-sm text-slate-100 transition hover:bg-slate-800" onClick={() => navigate(user?.role === 'admin' ? '/dashboard' : '/')}>
          Torna indietro
        </button>
      </div>
    </div>
  );
}

