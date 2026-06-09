import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API_URL = '/api';

type CategoryItem = { id: string; type: string; name: string };
type MachineItem = { id: string; code: string; name: string; type?: string };
type SparePartItem = { id: string; name: string; type: string };
type SolutionItem = { id: string; name: string; description?: string };

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
  const [solutionAppliedId, setSolutionAppliedId] = useState('');
  const [solution, setSolution] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingParts, setLoadingParts] = useState(false);

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
        const items = categoriesResp.data.items || [];
        setProblems(items.filter((item: CategoryItem) => item.type === 'problem'));
        setCauses(items.filter((item: CategoryItem) => item.type === 'cause'));
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
    if (!machine?.type) {
      setSpareParts([]);
      setSparePartId('');
      return;
    }

    const loadSpareParts = async () => {
      setLoadingParts(true);
      try {
        const resp = await axios.get(`${API_URL}/spare-parts/by-type/${encodeURIComponent(machine.type!)}`, {
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

  const handleCreate = async () => {
    if (!token) return;
    if (!machineId) {
      setError('La macchina è obbligatoria.');
      return;
    }

    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      await axios.post(
        `${API_URL}/cases`,
        {
          machine_id: machineId,
          problem_id: problemId || null,
          cause_id: causeId || null,
          spare_part_id: sparePartId || null,
          solution_applied_id: solutionAppliedId || null,
          solution: solution || null
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setSuccess('Caso registrato correttamente.');
      setMachineId('');
      setProblemId('');
      setCauseId('');
      setSparePartId('');
      setSolutionAppliedId('');
      setSolution('');

      setTimeout(() => navigate(user?.role === 'admin' ? '/dashboard' : '/'), 1200);
    } catch (err: any) {
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
          <label className="text-sm font-medium text-slate-200">Pezzo di ricambio</label>
          <select
            value={sparePartId}
            onChange={(e) => setSparePartId(e.target.value)}
            disabled={!machineId || loadingParts}
            className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none disabled:opacity-60"
          >
            <option value="">
              {!machineId ? 'Seleziona prima una macchina' : loadingParts ? 'Caricamento ricambi...' : spareParts.length ? 'Seleziona ricambio (opzionale)' : 'Nessun ricambio per questo tipo'}
            </option>
            {spareParts.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
          {selectedMachine?.type && (
            <p className="mt-2 text-xs text-slate-500">Tipo macchina: {selectedMachine.type}</p>
          )}
        </div>

        <div className="rounded-3xl bg-slate-950/80 p-5 shadow-xl shadow-slate-950/10 sm:p-6">
          <label className="text-sm font-medium text-slate-200">Problema</label>
          <select value={problemId} onChange={(e) => setProblemId(e.target.value)} className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none">
            <option value="">Seleziona problema (opzionale)</option>
            {problems.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </div>

        <div className="rounded-3xl bg-slate-950/80 p-5 shadow-xl shadow-slate-950/10 sm:p-6">
          <label className="text-sm font-medium text-slate-200">Causa</label>
          <select value={causeId} onChange={(e) => setCauseId(e.target.value)} className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none">
            <option value="">Seleziona causa (opzionale)</option>
            {causes.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </div>

        <div className="rounded-3xl bg-slate-950/80 p-5 shadow-xl shadow-slate-950/10 sm:p-6 md:col-span-2">
          <label className="text-sm font-medium text-slate-200">Descrizione / soluzione applicata</label>
          <select value={solutionAppliedId} onChange={(e) => setSolutionAppliedId(e.target.value)} className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none">
            <option value="">Seleziona soluzione applicata (opzionale)</option>
            {solutions.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </div>

        <div className="rounded-3xl bg-slate-950/80 p-5 shadow-xl shadow-slate-950/10 sm:p-6 md:col-span-2">
          <label className="block text-sm font-medium text-slate-200">Soluzione</label>
          <textarea value={solution} onChange={(e) => setSolution(e.target.value)} rows={5} placeholder="Note aggiuntive sulla risoluzione (opzionale)." className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
        </div>
      </div>

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
