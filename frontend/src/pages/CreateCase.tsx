import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API_URL = '/api';

export default function CreateCase() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [machineId, setMachineId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!token) return;
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await axios.post(
        `${API_URL}/cases`,
        {
          machine_id: machineId,
          category_id: categoryId || null,
          title,
          description,
          priority
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess('Caso creato correttamente.');
      setMachineId('');
      setCategoryId('');
      setTitle('');
      setDescription('');
      setPriority('medium');
      setTimeout(() => navigate('/'), 1200);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Errore durante la creazione.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Nuovo caso</h1>
        <p className="text-sm text-slate-400">Compila i dettagli e salva il nuovo caso.</p>
      </div>

      {error && <div className="rounded border border-red-500 bg-red-50 p-4 text-red-700">{error}</div>}
      {success && <div className="rounded border border-emerald-500 bg-emerald-50 p-4 text-emerald-700">{success}</div>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-white p-6 shadow">
          <label className="block text-sm font-medium text-slate-700">Machine ID</label>
          <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2" value={machineId} onChange={(e) => setMachineId(e.target.value)} />
        </div>
        <div className="rounded-xl bg-white p-6 shadow">
          <label className="block text-sm font-medium text-slate-700">Category ID (opzionale)</label>
          <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} />
        </div>
        <div className="md:col-span-2 rounded-xl bg-white p-6 shadow">
          <label className="block text-sm font-medium text-slate-700">Titolo</label>
          <input className="mt-2 w-full rounded border border-slate-300 px-3 py-2" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="md:col-span-2 rounded-xl bg-white p-6 shadow">
          <label className="block text-sm font-medium text-slate-700">Descrizione</label>
          <textarea className="mt-2 w-full rounded border border-slate-300 px-3 py-2" value={description} onChange={(e) => setDescription(e.target.value)} rows={6} />
        </div>
        <div className="rounded-xl bg-white p-6 shadow">
          <label className="block text-sm font-medium text-slate-700">Priorità</label>
          <select className="mt-2 w-full rounded border border-slate-300 px-3 py-2" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {['low', 'medium', 'high', 'critical'].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          className="rounded bg-slate-800 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
          onClick={handleCreate}
          disabled={!token || loading}
        >
          {loading ? 'Invio...' : 'Crea caso'}
        </button>
        <button
          type="button"
          className="rounded border border-slate-700 bg-slate-900 px-5 py-3 text-sm text-white hover:bg-slate-800"
          onClick={() => navigate('/')}
        >
          Torna alla dashboard
        </button>
      </div>
    </div>
  );
}

