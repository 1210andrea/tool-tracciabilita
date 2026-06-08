import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { useSocket } from '../hooks/useSocket';

const API_URL = '/api';

type CaseItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  machine_code: string;
  machine_name: string;
  created_at: string;
  created_by_username: string;
  operator_name: string;
  problem_name: string;
  cause_name: string;
  solution?: string;
  ai_solution?: string;
};

type MachineItem = { id: string; code: string; name: string };
type BreakdownItem = { status: string; count: number };
type TopMachine = { machine: string; problem_count: number };

export default function Dashboard() {
  const { token, user } = useAuth();
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [machines, setMachines] = useState<MachineItem[]>([]);
  const [breakdown, setBreakdown] = useState<BreakdownItem[]>([]);
  const [topMachines, setTopMachines] = useState<TopMachine[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [machineFilter, setMachineFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(10);
  const [loading, setLoading] = useState(true);
  const [eventMessage, setEventMessage] = useState('');

  const params = useMemo(
    () => ({ status: statusFilter || undefined, machine_id: machineFilter || undefined, page, limit }),
    [statusFilter, machineFilter, page, limit]
  );

  const loadData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [casesResp, dashboardResp, topResp] = await Promise.all([
        axios.get(`${API_URL}/cases`, {
          headers: { Authorization: `Bearer ${token}` },
          params
        }),
        axios.get(`${API_URL}/dashboard`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/stats/top-machines`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      setCases(casesResp.data.items || []);
      setTotal(casesResp.data.total || 0);
      setBreakdown(dashboardResp.data.breakdown || []);
      setTopMachines(topResp.data.items || []);
    } catch {
      setCases([]);
      setBreakdown([]);
      setTopMachines([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const loadMachines = async () => {
    if (!token) return;
    try {
      const resp = await axios.get(`${API_URL}/machines`, { headers: { Authorization: `Bearer ${token}` } });
      setMachines(resp.data.items || []);
    } catch {
      setMachines([]);
    }
  };

  useEffect(() => {
    loadMachines();
  }, [token]);

  useEffect(() => {
    loadData();
  }, [token, params]);

  useSocket((_event, payload) => {
    setEventMessage(`Nuovo aggiornamento caso: ${payload && (payload as any).caseId ? (payload as any).caseId : 'aggiornamento disponibile'}`);
    loadData();
  });

  const totalCases = useMemo(() => breakdown.reduce((sum, item) => sum + item.count, 0), [breakdown]);
  const pageCount = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-sm text-slate-400">Gestione centrale dei casi e monitoraggio realtime.</p>
        </div>
        <Link className="inline-flex rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400" to="/cases/new">
          Nuovo caso
        </Link>
      </div>

      {eventMessage && (
        <div className="rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm text-slate-200">{eventMessage}</div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl bg-slate-900/80 p-6 shadow-lg shadow-slate-950/20 text-white">
          <div className="text-sm uppercase tracking-[0.22em] text-slate-400">Totale casi</div>
          <div className="mt-4 text-4xl font-semibold">{totalCases}</div>
          <div className="mt-3 text-sm text-slate-500">Dati aggiornati in tempo reale.</div>
        </div>
        <div className="rounded-3xl bg-slate-900/80 p-6 shadow-lg shadow-slate-950/20 text-white">
          <div className="text-sm uppercase tracking-[0.22em] text-slate-400">Pagina</div>
          <div className="mt-4 text-4xl font-semibold">{page} / {pageCount}</div>
          <div className="mt-3 text-sm text-slate-500">Filtri attivi: {statusFilter || 'tutti'} / {machineFilter ? 'macchina selezionata' : 'tutte'}</div>
        </div>
        <div className="rounded-3xl bg-slate-900/80 p-6 shadow-lg shadow-slate-950/20 text-white">
          <div className="text-sm uppercase tracking-[0.22em] text-slate-400">Ruolo utente</div>
          <div className="mt-4 text-4xl font-semibold">{user?.role ?? 'n/d'}</div>
          <div className="mt-3 text-sm text-slate-500">{user?.role === 'admin' ? 'Accesso amministratore' : 'Accesso standard'}.</div>
        </div>
      </div>

      <div className="rounded-3xl bg-slate-900/80 p-6 shadow-lg shadow-slate-950/20 text-white">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Filtri visualizzazione</h2>
            <p className="text-sm text-slate-400">Cerca casi per stato o macchina.</p>
          </div>
          <div className="grid w-full gap-3 sm:grid-cols-2 md:w-auto md:grid-cols-3">
            <select
              value={statusFilter}
              onChange={(e) => {
                setPage(1);
                setStatusFilter(e.target.value);
              }}
              className="rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none"
            >
              <option value="">Tutti gli status</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="closed">Closed</option>
            </select>
            <select
              value={machineFilter}
              onChange={(e) => {
                setPage(1);
                setMachineFilter(e.target.value);
              }}
              className="rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none"
            >
              <option value="">Tutte le macchine</option>
              {machines.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.code} - {machine.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl bg-slate-950/80 p-4">
            <h3 className="mb-4 text-lg font-semibold text-slate-100">Trend casi</h3>
            <div className="h-64">
              <ResponsiveContainer>
                <LineChart data={breakdown.map((item) => ({ name: item.status, value: item.count }))}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="4 4" />
                  <XAxis dataKey="name" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip wrapperStyle={{ backgroundColor: '#0f172a', borderRadius: 12, border: '1px solid #334155' }} />
                  <Line type="monotone" dataKey="value" stroke="#38bdf8" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-3xl bg-slate-950/80 p-4">
            <h3 className="mb-4 text-lg font-semibold text-slate-100">Top macchine aperte</h3>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={topMachines} margin={{ left: -20, right: 10, top: 10, bottom: 0 }}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="4 4" />
                  <XAxis dataKey="code" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip wrapperStyle={{ backgroundColor: '#0f172a', borderRadius: 12, border: '1px solid #334155' }} />
                  <Bar dataKey="open_cases" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl bg-slate-900/80 p-6 shadow-lg shadow-slate-950/20 text-slate-100">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Lista casi</h2>
            <p className="text-sm text-slate-400">Controlla gli ultimi casi aperti e in corso.</p>
          </div>
          <div className="text-sm text-slate-400">{loading ? 'Aggiornamento...' : `${cases.length} casi visualizzati`}</div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-700 bg-slate-950/90">
          <table className="min-w-full divide-y divide-slate-800 text-left text-sm text-slate-200">
            <thead className="bg-slate-950/90 text-slate-400">
              <tr>
                <th className="px-4 py-4">Titolo</th>
                <th className="px-4 py-4">Macchina</th>
                <th className="px-4 py-4">Operatore</th>
                <th className="px-4 py-4">Problema</th>
                <th className="px-4 py-4">Stato</th>
                <th className="px-4 py-4">Priorità</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-950/70">
              {cases.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    {loading ? 'Caricamento casi...' : 'Nessun caso corrispondente ai filtri.'}
                  </td>
                </tr>
              ) : (
                cases.map((item) => (
                  <tr key={item.id} className="cursor-pointer transition hover:bg-slate-900/80" onClick={() => { }}>
                    <td className="px-4 py-4 font-medium text-slate-100">{item.title}</td>
                    <td className="px-4 py-4 text-slate-300">{item.machine_code}</td>
                    <td className="px-4 py-4 text-slate-300">{item.operator_name || 'N.D.'}</td>
                    <td className="px-4 py-4 text-slate-300">{item.problem_name || 'N.D.'}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                        item.status === 'open' ? 'bg-emerald-500/15 text-emerald-300' : item.status === 'in_progress' ? 'bg-sky-500/15 text-sky-300' : 'bg-slate-500/15 text-slate-200'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-300">{item.priority}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-400">Pagina {page} di {pageCount}</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-2xl bg-slate-800 px-4 py-2 text-sm text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(current - 1, 1))}
            >
              Precedente
            </button>
            <button
              type="button"
              className="rounded-2xl bg-slate-800 px-4 py-2 text-sm text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={page >= pageCount}
              onClick={() => setPage((current) => Math.min(current + 1, pageCount))}
            >
              Successiva
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
