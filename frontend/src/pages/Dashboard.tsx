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
import { CategoriesSelect } from '../components/CategoriesSelect';
import { CaseDetailModal, type CaseDetail } from '../components/CaseDetailModal';
import { ConfirmModal } from '../components/ConfirmModal';

const API_URL = '/api';

type CaseItem = {
  id: string;
  title: string;
  status: string;
  machine_id: string;
  machine_code: string;
  machine_name: string;
  created_at: string;
  created_by: string;
  created_by_username: string;
  operator_id?: string | null;
  problem_id?: string | null;
  cause_id?: string | null;
  operator_name: string;
  problem_name: string;
  cause_name: string;
  solution?: string;
  description?: string;
  ai_solution?: string;
};

type MachineItem = { id: string; code: string; name: string; line?: string };
type Category = { id: string; type: 'operator' | 'problem' | 'cause'; name: string };
type BreakdownItem = { status: string; count: number };
type TopMachine = { machine: string; problem_count: number };

export default function Dashboard() {
  const { token, user } = useAuth();
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [machines, setMachines] = useState<MachineItem[]>([]);
  const [breakdown, setBreakdown] = useState<BreakdownItem[]>([]);
  const [topMachines, setTopMachines] = useState<TopMachine[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');
  const [lineFilter, setLineFilter] = useState('');
  const [operatorIdFilter, setOperatorIdFilter] = useState('');
  const [problemIdFilter, setProblemIdFilter] = useState('');
  const [causeIdFilter, setCauseIdFilter] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(10);
  const [loading, setLoading] = useState(true);
  const [eventMessage, setEventMessage] = useState('');
  const [editingCase, setEditingCase] = useState<CaseDetail | null>(null);
  const [deletingCase, setDeletingCase] = useState<CaseItem | null>(null);

  const appliedParams = useMemo(
    () => ({
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      time_from: timeFrom || undefined,
      time_to: timeTo || undefined,
      line: lineFilter || undefined,
      operator_id: operatorIdFilter || undefined,
      problem_id: problemIdFilter || undefined,
      cause_id: causeIdFilter || undefined,
      page,
      limit
    }),
    [dateFrom, dateTo, timeFrom, timeTo, lineFilter, operatorIdFilter, problemIdFilter, causeIdFilter, page, limit]
  );

  const loadData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [casesResp, dashboardResp, topResp] = await Promise.all([
        axios.get(`${API_URL}/cases`, {
          headers: { Authorization: `Bearer ${token}` },
          params: appliedParams
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

  const loadCategories = async () => {
    if (!token) return;
    try {
      const resp = await axios.get(`${API_URL}/categories`, { headers: { Authorization: `Bearer ${token}` } });
      setCategories(resp.data.items || []);
    } catch {
      setCategories([]);
    }
  };

  useEffect(() => {
    loadMachines();
    loadCategories();
  }, [token]);

  useEffect(() => {
    loadData();
  }, [token, appliedParams]);

  useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, timeFrom, timeTo, lineFilter, operatorIdFilter, problemIdFilter, causeIdFilter]);

  useSocket((_event, payload) => {
    setEventMessage(`Nuovo aggiornamento caso: ${payload && (payload as any).caseId ? (payload as any).caseId : 'aggiornamento disponibile'}`);
    loadData();
  });

  const resetFilters = () => {
    setPage(1);
    setDateFrom('');
    setDateTo('');
    setTimeFrom('');
    setTimeTo('');
    setLineFilter('');
    setOperatorIdFilter('');
    setProblemIdFilter('');
    setCauseIdFilter('');
  };

  const canEditCase = (item: CaseItem) => user?.role === 'admin' || item.created_by === user?.id;
  const canDeleteCase = user?.role === 'admin';

  const handleDelete = async () => {
    if (!token || !deletingCase) return;
    try {
      await axios.delete(`${API_URL}/cases/${deletingCase.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDeletingCase(null);
      loadData();
    } catch (err: any) {
      setEventMessage(err?.response?.data?.error ?? 'Errore durante l\'eliminazione.');
      setDeletingCase(null);
    }
  };

  const totalCases = useMemo(() => breakdown.reduce((sum, item) => sum + item.count, 0), [breakdown]);
  const pageCount = Math.max(1, Math.ceil(total / limit));

  const topMachinesChart = useMemo(() => {
    const normalize = (items: Array<Record<string, unknown>>) =>
      items.map((item) => ({
        machine: String(item.machine ?? item.code ?? 'N/D'),
        problem_count: Number(item.problem_count ?? item.open_cases ?? 0)
      })).filter((item) => item.problem_count > 0);

    const fromApi = normalize(topMachines as unknown as Array<Record<string, unknown>>);
    if (fromApi.length) return fromApi;

    const counts = new Map<string, number>();
    cases
      .filter((c) => c.status === 'open' || c.status === 'in_progress')
      .forEach((c) => counts.set(c.machine_code, (counts.get(c.machine_code) ?? 0) + 1));

    return Array.from(counts.entries())
      .map(([machine, problem_count]) => ({ machine, problem_count }))
      .sort((a, b) => b.problem_count - a.problem_count);
  }, [topMachines, cases]);
  const activeFilters = [
    dateFrom ? 'data da' : null,
    dateTo ? 'data a' : null,
    timeFrom ? 'ora da' : null,
    timeTo ? 'ora a' : null,
    lineFilter ? 'linea' : null,
    operatorIdFilter ? 'operatore' : null,
    problemIdFilter ? 'problema' : null,
    causeIdFilter ? 'causa' : null
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Dashboard</h1>
          <p className="text-sm text-slate-400">Gestione centrale dei casi e monitoraggio realtime.</p>
        </div>
        <Link className="inline-flex justify-center rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400" to="/cases/new">
          Nuovo caso
        </Link>
      </div>

      {eventMessage && (
        <div className="rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm text-slate-200">{eventMessage}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-3xl bg-slate-900/80 p-5 shadow-lg shadow-slate-950/20 sm:p-6">
          <div className="text-xs uppercase tracking-[0.22em] text-slate-400 sm:text-sm">Totale casi</div>
          <div className="mt-3 text-3xl font-semibold sm:mt-4 sm:text-4xl">{totalCases}</div>
          <div className="mt-2 text-sm text-slate-500">Dati aggiornati in tempo reale.</div>
        </div>
        <div className="rounded-3xl bg-slate-900/80 p-5 shadow-lg shadow-slate-950/20 sm:p-6">
          <div className="text-xs uppercase tracking-[0.22em] text-slate-400 sm:text-sm">Pagina</div>
          <div className="mt-3 text-3xl font-semibold sm:mt-4 sm:text-4xl">{page} / {pageCount}</div>
          <div className="mt-2 text-sm text-slate-500">
            Filtri: {activeFilters.length ? activeFilters.join(', ') : 'nessuno'}
          </div>
        </div>
        <div className="rounded-3xl bg-slate-900/80 p-5 shadow-lg shadow-slate-950/20 sm:col-span-2 sm:p-6 xl:col-span-1">
          <div className="text-xs uppercase tracking-[0.22em] text-slate-400 sm:text-sm">Ruolo utente</div>
          <div className="mt-3 text-3xl font-semibold sm:mt-4 sm:text-4xl">{user?.role ?? 'n/d'}</div>
          <div className="mt-2 text-sm text-slate-500">{user?.role === 'admin' ? 'Vedi tutti i casi' : 'Vedi solo i tuoi casi'}.</div>
        </div>
      </div>

      <div className="rounded-3xl bg-slate-900/80 p-4 shadow-lg shadow-slate-950/20 sm:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold sm:text-xl">Filtri visualizzazione</h2>
            <p className="text-sm text-slate-400">I filtri si applicano automaticamente.</p>
          </div>
          <button type="button" onClick={resetFilters} className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-5 py-2.5 text-sm text-slate-100 transition hover:bg-slate-800 sm:w-auto">
            Reset filtri
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Periodo</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="block text-xs text-slate-400">Data da</label>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none" />
              </div>
              <div>
                <label className="block text-xs text-slate-400">Data a</label>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none" />
              </div>
              <div>
                <label className="block text-xs text-slate-400">Ora da</label>
                <input type="time" value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none" />
              </div>
              <div>
                <label className="block text-xs text-slate-400">Ora a</label>
                <input type="time" value={timeTo} onChange={(e) => setTimeTo(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none" />
              </div>
            </div>
          </div>

          <div>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Attributi caso</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="block text-xs text-slate-400">Linea</label>
                <select value={lineFilter} onChange={(e) => setLineFilter(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none">
                  <option value="">Tutte</option>
                  {[...new Set(machines.map((m) => m.line).filter(Boolean))].map((ln) => (
                    <option key={ln as string} value={ln as string}>{ln as string}</option>
                  ))}
                </select>
              </div>
              <CategoriesSelect label="Operatore" value={operatorIdFilter} onChange={setOperatorIdFilter} categories={categories} type="operator" placeholder="Tutti" disabled={categories.length === 0} />
              <CategoriesSelect label="Problema" value={problemIdFilter} onChange={setProblemIdFilter} categories={categories} type="problem" placeholder="Tutti" disabled={categories.length === 0} />
              <CategoriesSelect label="Causa" value={causeIdFilter} onChange={setCauseIdFilter} categories={categories} type="cause" placeholder="Tutti" disabled={categories.length === 0} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl bg-slate-900/80 p-4 shadow-lg shadow-slate-950/20 sm:p-6">
          <h3 className="mb-4 text-lg font-semibold text-slate-100">Trend casi</h3>
          <div className="w-full" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={breakdown.map((item) => ({ name: item.status, value: Number(item.count) }))} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="4 4" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} width={32} />
                <Tooltip wrapperStyle={{ backgroundColor: '#0f172a', borderRadius: 12, border: '1px solid #334155' }} />
                <Line type="monotone" dataKey="value" stroke="#38bdf8" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-3xl bg-slate-900/80 p-4 shadow-lg shadow-slate-950/20 sm:p-6">
          <h3 className="mb-4 text-lg font-semibold text-slate-100">Top macchine aperte</h3>
          <div className="w-full" style={{ height: 280 }}>
            {topMachinesChart.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Nessun caso aperto da visualizzare.</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={topMachinesChart} margin={{ top: 8, right: 12, left: 0, bottom: 24 }}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="4 4" />
                  <XAxis dataKey="machine" stroke="#94a3b8" fontSize={11} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} width={32} />
                  <Tooltip wrapperStyle={{ backgroundColor: '#0f172a', borderRadius: 12, border: '1px solid #334155' }} />
                  <Bar dataKey="problem_count" fill="#38bdf8" radius={[6, 6, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-3xl bg-slate-900/80 p-4 shadow-lg shadow-slate-950/20 sm:p-6">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold sm:text-2xl">Lista casi</h2>
            <p className="text-sm text-slate-400">Controlla gli ultimi casi aperti e in corso.</p>
          </div>
          <div className="text-sm text-slate-400">{loading ? 'Aggiornamento...' : `${cases.length} casi visualizzati`}</div>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-slate-700 bg-slate-950/90">
          <table className="min-w-[720px] w-full divide-y divide-slate-800 text-left text-sm text-slate-200">
            <thead className="bg-slate-950/90 text-slate-400">
              <tr>
                <th className="px-3 py-3 sm:px-4">Titolo</th>
                <th className="px-3 py-3 sm:px-4">Macchina</th>
                <th className="hidden px-3 py-3 sm:table-cell sm:px-4">Operatore</th>
                <th className="hidden px-3 py-3 md:table-cell md:px-4">Problema</th>
                <th className="px-3 py-3 sm:px-4">Stato</th>
                <th className="px-3 py-3 sm:px-4">Azioni</th>
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
                  <tr key={item.id} className="transition hover:bg-slate-900/80">
                    <td className="px-3 py-3 font-medium text-slate-100 sm:px-4 sm:py-4">{item.title}</td>
                    <td className="px-3 py-3 text-slate-300 sm:px-4 sm:py-4">{item.machine_code}</td>
                    <td className="hidden px-3 py-3 text-slate-300 sm:table-cell sm:px-4 sm:py-4">{item.operator_name || 'N.D.'}</td>
                    <td className="hidden px-3 py-3 text-slate-300 md:table-cell md:px-4 md:py-4">{item.problem_name || 'N.D.'}</td>
                    <td className="px-3 py-3 sm:px-4 sm:py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        item.status === 'open' ? 'bg-emerald-500/15 text-emerald-300' : item.status === 'in_progress' ? 'bg-sky-500/15 text-sky-300' : 'bg-slate-500/15 text-slate-200'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 sm:px-4 sm:py-4">
                      <div className="flex flex-wrap gap-2">
                        {canEditCase(item) && (
                          <button
                            type="button"
                            className="rounded-xl border border-slate-600 px-2.5 py-1 text-xs text-slate-100 hover:bg-slate-800"
                            onClick={() => setEditingCase(item)}
                          >
                            Apri
                          </button>
                        )}
                        {canDeleteCase && (
                          <button
                            type="button"
                            className="rounded-xl border border-rose-500/40 px-2.5 py-1 text-xs text-rose-300 hover:bg-rose-500/10"
                            onClick={() => setDeletingCase(item)}
                          >
                            Elimina
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-400">Pagina {page} di {pageCount}</div>
          <div className="flex items-center gap-2">
            <button type="button" className="rounded-2xl bg-slate-800 px-4 py-2 text-sm text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={page <= 1} onClick={() => setPage((c) => Math.max(c - 1, 1))}>
              Precedente
            </button>
            <button type="button" className="rounded-2xl bg-slate-800 px-4 py-2 text-sm text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={page >= pageCount} onClick={() => setPage((c) => Math.min(c + 1, pageCount))}>
              Successiva
            </button>
          </div>
        </div>
      </div>

      {token && (
        <CaseDetailModal
          open={!!editingCase}
          token={token}
          caseItem={editingCase}
          machines={machines}
          categories={categories}
          canEdit={!!editingCase && canEditCase(editingCase as CaseItem)}
          onClose={() => setEditingCase(null)}
          onSaved={loadData}
        />
      )}

      <ConfirmModal
        open={!!deletingCase}
        title="Elimina caso"
        message={<>Sei sicuro di voler eliminare il caso <strong>{deletingCase?.title}</strong>? L&apos;operazione è irreversibile.</>}
        confirmText="Elimina"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeletingCase(null)}
      />
    </div>
  );
}
