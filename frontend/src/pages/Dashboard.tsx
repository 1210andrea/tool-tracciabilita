import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

const API_URL = '/api';

export default function Dashboard() {
  const { token, user } = useAuth();
  const [breakdown, setBreakdown] = useState<{ status: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    axios
      .get(`${API_URL}/dashboard`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setBreakdown(r.data.breakdown ?? []))
      .catch(() => setBreakdown([]))
      .finally(() => setLoading(false));
  }, [token]);

  const data = breakdown.map((b) => ({ name: b.status, value: b.count }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-sm text-slate-400">Benvenuto {user?.role === 'admin' ? 'Admin' : 'Utente'}.</p>
        </div>
        <Link
          to="/cases/new"
          className="inline-flex rounded bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600"
        >
          Crea nuovo caso
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl bg-slate-800 p-5 text-white shadow-sm">
          <div className="text-sm uppercase text-slate-400">Casi totali</div>
          <div className="mt-3 text-3xl font-semibold">{breakdown.reduce((sum, item) => sum + item.count, 0)}</div>
        </div>
        <div className="rounded-xl bg-slate-800 p-5 text-white shadow-sm">
          <div className="text-sm uppercase text-slate-400">Status diversi</div>
          <div className="mt-3 text-3xl font-semibold">{breakdown.length}</div>
        </div>
        <div className="rounded-xl bg-slate-800 p-5 text-white shadow-sm">
          <div className="text-sm uppercase text-slate-400">Ruolo</div>
          <div className="mt-3 text-3xl font-semibold">{user?.role ?? 'n.d.'}</div>
        </div>
      </div>

      <div className="rounded-xl bg-white p-6 shadow">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Casi per stato</h2>
            <p className="text-sm text-slate-500">Visualizza la ripartizione dei casi aperti.</p>
          </div>
          <div className="text-sm text-slate-500">{loading ? 'Caricamento...' : breakdown.length === 0 ? 'Nessun caso disponibile' : ''}</div>
        </div>

        {breakdown.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-slate-500">
            {loading ? 'Sto caricando i dati...' : 'Non ci sono casi registrati al momento.'}
          </div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer>
              <LineChart data={data}>
                <XAxis dataKey="name" stroke="#475569" />
                <YAxis stroke="#475569" />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

