import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API_URL = '/api';

type CategoryItem = { id: string; type: string; name: string };

type MachineItem = { id: string; code: string; name: string };

type UserItem = { id: string; username: string };

export default function CreateCase() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [machines, setMachines] = useState<MachineItem[]>([]);
  const [operators, setOperators] = useState<CategoryItem[]>([]);
  const [problems, setProblems] = useState<CategoryItem[]>([]);
  const [causes, setCauses] = useState<CategoryItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);

  const [machineId, setMachineId] = useState('');
  const [operatorId, setOperatorId] = useState('');
  const [problemId, setProblemId] = useState('');
  const [causeId, setCauseId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;

    const loadLookups = async () => {
      try {
        const [machinesResp, categoriesResp, usersResp] = await Promise.all([
          axios.get(`${API_URL}/machines`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${API_URL}/categories`, { headers: { Authorization: `Bearer ${token}` } }),
          user?.role === 'admin'
            ? axios.get(`${API_URL}/users`, { headers: { Authorization: `Bearer ${token}` } })
            : Promise.resolve({ data: { items: [] } })
        ]);

        setMachines(machinesResp.data.items || []);
        const items = categoriesResp.data.items || [];
        setOperators(items.filter((item: CategoryItem) => item.type === 'operator'));

        setProblems(items.filter((item: CategoryItem) => item.type === 'problem'));
        setCauses(items.filter((item: CategoryItem) => item.type === 'cause'));
        setUsers(usersResp.data.items || []);
      } catch {
        setMachines([]);
        setOperators([]);
        setProblems([]);
        setCauses([]);
        setUsers([]);
      }
    };

    loadLookups();
  }, [token, user?.role]);

  const handleCreate = async () => {
    if (!token) return;
    if (!machineId || !operatorId || !problemId || !causeId || !title || !description) {
      setError('Compila tutti i campi obbligatori (macchina, operatore, problema, causa, titolo e descrizione).');
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
          operator_id: operatorId,
          problem_id: problemId,
          cause_id: causeId,
          title,
          // backend si aspetta `solution`
          solution: description

        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setSuccess('Caso creato correttamente. Redirigo alla dashboard...');
      setMachineId('');
      setOperatorId('');
      setProblemId('');
      setCauseId('');
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
        <p className="text-sm text-slate-400">Seleziona macchina, operatore, problema e causa per creare un caso preciso.</p>
      </div>

      {error && <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-red-200">{error}</div>}
      {success && <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-emerald-200">{success}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl bg-slate-950/80 p-6 shadow-xl shadow-slate-950/10">
          <label className="text-sm font-medium text-slate-200">Macchina</label>
          <select
            value={machineId}
            onChange={(e) => setMachineId(e.target.value)}
            className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none"
          >
            <option value="">Seleziona una macchina</option>
            {machines.map((machine) => (
              <option key={machine.id} value={machine.id}>
                {machine.code} - {machine.name}
              </option>
            ))}
          </select>
        </div>



        <div className="rounded-3xl bg-slate-950/80 p-6 shadow-xl shadow-slate-950/10">
          <label className="text-sm font-medium text-slate-200">Operatore</label>
          <select
            value={operatorId}
            onChange={(e) => setOperatorId(e.target.value)}
            className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none"
          >
            <option value="">Seleziona operatore</option>
            {operators.map((operatorItem) => (
              <option key={operatorItem.id} value={operatorItem.id}>
                {operatorItem.name}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-3xl bg-slate-950/80 p-6 shadow-xl shadow-slate-950/10">
          <label className="text-sm font-medium text-slate-200">Problema</label>
          <select
            value={problemId}
            onChange={(e) => setProblemId(e.target.value)}
            className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none"
          >
            <option value="">Seleziona problema</option>
            {problems.map((problemItem) => (
              <option key={problemItem.id} value={problemItem.id}>
                {problemItem.name}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-3xl bg-slate-950/80 p-6 shadow-xl shadow-slate-950/10">
          <label className="text-sm font-medium text-slate-200">Causa</label>
          <select
            value={causeId}
            onChange={(e) => setCauseId(e.target.value)}
            className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none"
          >
            <option value="">Seleziona causa</option>
            {causes.map((causeItem) => (
              <option key={causeItem.id} value={causeItem.id}>
                {causeItem.name}
              </option>
            ))}
          </select>
        </div>


      </div>

      <div className="rounded-3xl bg-slate-950/80 p-6 shadow-xl shadow-slate-950/10">
        <label className="block text-sm font-medium text-slate-200">Titolo</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Es. Arresto lineare per vibrazione"
          className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none"
        />
      </div>

      <div className="rounded-3xl bg-slate-950/80 p-6 shadow-xl shadow-slate-950/10">
        <label className="block text-sm font-medium text-slate-200">Descrizione</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={7}
          placeholder="Aggiungi dettagli aggiuntivi, stato attuale e comportamento osservato."
          className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-2xl bg-sky-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={handleCreate}
          disabled={!token || loading}
        >
          {loading ? 'Salvataggio...' : 'Crea caso'}
        </button>
        <button
          type="button"
          className="rounded-2xl border border-slate-700 bg-slate-900/90 px-6 py-3 text-sm text-slate-100 transition hover:bg-slate-800"
          onClick={() => navigate(user?.role === 'admin' ? '/dashboard' : '/')}
        >
          Torna alla dashboard
        </button>
      </div>
    </div>
  );
}

