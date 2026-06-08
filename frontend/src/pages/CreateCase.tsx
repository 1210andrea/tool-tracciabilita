import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API_URL = '/api';

type CategoryItem = { id: string; type: string; name: string };
type MachineItem = { id: string; code: string; name: string };

export default function CreateCase() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [machines, setMachines] = useState<MachineItem[]>([]);
  const [problems, setProblems] = useState<CategoryItem[]>([]);
  const [causes, setCauses] = useState<CategoryItem[]>([]);
  const [spareParts, setSpareParts] = useState<CategoryItem[]>([]);

  const [machineId, setMachineId] = useState('');
  const [problemId, setProblemId] = useState('');
  const [causeId, setCauseId] = useState('');
  const [sparePartId, setSparePartId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;

    const loadLookups = async () => {
      try {
        const [machinesResp, categoriesResp] = await Promise.all([
          axios.get(`${API_URL}/machines`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${API_URL}/categories`, { headers: { Authorization: `Bearer ${token}` } })
        ]);

        setMachines(machinesResp.data.items || []);
        const items = categoriesResp.data.items || [];
        setProblems(items.filter((item: CategoryItem) => item.type === 'problem'));
        setCauses(items.filter((item: CategoryItem) => item.type === 'cause'));
        setSpareParts(items.filter((item: CategoryItem) => item.type === 'spare_part'));
      } catch {
        setMachines([]);
        setProblems([]);
        setCauses([]);
        setSpareParts([]);
      }
    };

    loadLookups();
  }, [token]);

  const handleCreate = async () => {
    if (!token) return;
    if (!machineId || !problemId || !causeId || !sparePartId || !title || !description) {
      setError('Compila tutti i campi obbligatori (macchina, problema, causa, pezzo di ricambio, titolo e descrizione).');
      return;
    }

    if (!user?.operator_category_id && !user?.operator_name) {
      setError('Operatore non configurato per il tuo account. Contatta l\'admin per collegare il tuo utente a un operatore.');
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
          problem_id: problemId,
          cause_id: causeId,
          spare_part_id: sparePartId,
          title,
          solution: description
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setSuccess('Caso registrato correttamente.');
      setMachineId('');
      setProblemId('');
      setCauseId('');
      setSparePartId('');
      setTitle('');
      setDescription('');

      setTimeout(() => navigate(user?.role === 'admin' ? '/dashboard' : '/'), 1200);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Errore durante la creazione del caso.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Nuovo caso</h1>
        <p className="text-sm text-slate-400">Registra un intervento completato sulla macchina.</p>
      </div>

      {error && <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-red-200">{error}</div>}
      {success && <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-emerald-200">{success}</div>}

      <div className="rounded-3xl border border-slate-700 bg-slate-950/80 p-5">
        <div className="text-sm text-slate-400">Operatore</div>
        <div className="mt-1 text-lg font-semibold text-slate-100">
          {user?.operator_name ?? 'Non configurato'}
        </div>
        <p className="mt-1 text-xs text-slate-500">Compilato automaticamente in base al tuo account.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl bg-slate-950/80 p-6 shadow-xl shadow-slate-950/10">
          <label className="text-sm font-medium text-slate-200">Macchina</label>
          <select value={machineId} onChange={(e) => setMachineId(e.target.value)} className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none">
            <option value="">Seleziona una macchina</option>
            {machines.map((machine) => (
              <option key={machine.id} value={machine.id}>{machine.code} - {machine.name}</option>
            ))}
          </select>
        </div>

        <div className="rounded-3xl bg-slate-950/80 p-6 shadow-xl shadow-slate-950/10">
          <label className="text-sm font-medium text-slate-200">Pezzo di ricambio</label>
          <select value={sparePartId} onChange={(e) => setSparePartId(e.target.value)} className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none">
            <option value="">Seleziona ricambio</option>
            {spareParts.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </div>

        <div className="rounded-3xl bg-slate-950/80 p-6 shadow-xl shadow-slate-950/10">
          <label className="text-sm font-medium text-slate-200">Problema</label>
          <select value={problemId} onChange={(e) => setProblemId(e.target.value)} className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none">
            <option value="">Seleziona problema</option>
            {problems.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </div>

        <div className="rounded-3xl bg-slate-950/80 p-6 shadow-xl shadow-slate-950/10">
          <label className="text-sm font-medium text-slate-200">Causa</label>
          <select value={causeId} onChange={(e) => setCauseId(e.target.value)} className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none">
            <option value="">Seleziona causa</option>
            {causes.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-3xl bg-slate-950/80 p-6 shadow-xl shadow-slate-950/10">
        <label className="block text-sm font-medium text-slate-200">Titolo</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Es. Arresto lineare per vibrazione" className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
      </div>

      <div className="rounded-3xl bg-slate-950/80 p-6 shadow-xl shadow-slate-950/10">
        <label className="block text-sm font-medium text-slate-200">Descrizione / soluzione applicata</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={7} placeholder="Descrivi il problema e come è stato risolto." className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" className="inline-flex items-center justify-center rounded-2xl bg-sky-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60" onClick={handleCreate} disabled={!token || loading}>
          {loading ? 'Salvataggio...' : 'Registra caso'}
        </button>
        <button type="button" className="rounded-2xl border border-slate-700 bg-slate-900/90 px-6 py-3 text-sm text-slate-100 transition hover:bg-slate-800" onClick={() => navigate(user?.role === 'admin' ? '/dashboard' : '/')}>
          Torna indietro
        </button>
      </div>
    </div>
  );
}
