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
  machine_id: string;
  machine_code: string;
  machine_name: string;
  created_at: string;
  created_by: string;
  created_by_username: string;
  problem_id?: string | null;
  cause_id?: string | null;
  problem_name: string;
  cause_name: string;
  spare_part_name?: string;
  solution_applied_name?: string;
  solution?: string;
  description?: string;
  ai_solution?: string;
};

type MachineItem = { id: string; code: string; name: string; line?: string };
type Category = { id: string; type: 'operator' | 'problem' | 'cause'; name: string };
type TrendItem = { date: string; count: number };
const TOP_OPTIONS = [5, 10, 15] as const;

function TopSelector({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-1 text-xs text-slate-200 outline-none"
    >
      {TOP_OPTIONS.map((n) => (
        <option key={n} value={n}>Top {n}</option>
      ))}
    </select>
  );
}

export default function Dashboard() {
  const { token, user } = useAuth();
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [machines, setMachines] = useState<MachineItem[]>([]);
  const [trend, setTrend] = useState<TrendItem[]>([]);
  const [problemsByLine, setProblemsByLine] = useState<{ line: string; problem_count: number }[]>([]);
  const [topProblems, setTopProblems] = useState<{ problem: string; count: number }[]>([]);
  const [topCauses, setTopCauses] = useState<{ cause: string; count: number }[]>([]);
  const [topMachines, setTopMachines] = useState<{ machine: string; count: number }[]>([]);
  const [topSpareParts, setTopSpareParts] = useState<{ spare_part: string; usage_count: number }[]>([]);
  const [summary, setSummary] = useState({ total: 0, this_month: 0 });

  const [monthFilter, setMonthFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [machineIdFilter, setMachineIdFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');
  const [lineFilter, setLineFilter] = useState('');
  const [problemIdFilter, setProblemIdFilter] = useState('');
  const [causeIdFilter, setCauseIdFilter] = useState('');

  const [topProblemsLimit, setTopProblemsLimit] = useState(5);
  const [topProblemsByLineLimit, setTopProblemsByLineLimit] = useState(5);

  const [topCausesLimit, setTopCausesLimit] = useState(5);

  const [topMachinesLimit, setTopMachinesLimit] = useState(5);
  const [topSparePartsLimit, setTopSparePartsLimit] = useState(5);


  const [categories, setCategories] = useState<Category[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(10);
  const [loading, setLoading] = useState(true);
  const [eventMessage, setEventMessage] = useState('');
  const [editingCase, setEditingCase] = useState<CaseDetail | null>(null);
  const [deletingCase, setDeletingCase] = useState<CaseItem | null>(null);

  const filterParams = useMemo(
    () => ({
      month: monthFilter || undefined,
      year: yearFilter || undefined,
      machine_id: machineIdFilter || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      time_from: timeFrom || undefined,
      time_to: timeTo || undefined,
      line: lineFilter || undefined,
      problem_id: problemIdFilter || undefined,
      cause_id: causeIdFilter || undefined
    }),
    [monthFilter, yearFilter, machineIdFilter, dateFrom, dateTo, timeFrom, timeTo, lineFilter, problemIdFilter, causeIdFilter]
  );

  const caseParams = useMemo(() => ({ ...filterParams, page, limit }), [filterParams, page, limit]);

  const loadData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [casesResp, dashboardResp, trendResp, lineResp, probResp, causeResp, machResp, spareResp] = await Promise.all([
        axios.get(`${API_URL}/cases`, { headers, params: caseParams }),
        axios.get(`${API_URL}/dashboard`, { headers }),
        axios.get(`${API_URL}/stats/trend-cases`, { headers, params: { ...filterParams, days: 30 } }),
        axios.get(`${API_URL}/stats/problems-by-line`, { headers, params: { ...filterParams, limit: topProblemsByLineLimit } }),


        axios.get(`${API_URL}/stats/top-problems`, { headers, params: { ...filterParams, limit: topProblemsLimit } }),
        axios.get(`${API_URL}/stats/top-causes`, { headers, params: { ...filterParams, limit: topCausesLimit } }),
        axios.get(`${API_URL}/stats/top-machines`, { headers, params: { ...filterParams, limit: topMachinesLimit } }),
        axios.get(`${API_URL}/stats/top-spare-parts`, { headers, params: { ...filterParams, limit: topSparePartsLimit } })
      ]);

      setCases(casesResp.data.items || []);
      setTotal(casesResp.data.total || 0);
      setSummary({ total: dashboardResp.data.total ?? 0, this_month: dashboardResp.data.this_month ?? 0 });
      setTrend(trendResp.data.items || []);
      setProblemsByLine(lineResp.data.items || []);
      setTopProblems(probResp.data.items || []);
      setTopCauses(causeResp.data.items || []);
      setTopMachines(machResp.data.items || []);
      setTopSpareParts(spareResp.data.items || []);
    } catch {
      setCases([]);
      setTrend([]);
      setProblemsByLine([]);
      setTopProblems([]);
      setTopCauses([]);
      setTopMachines([]);
      setTopSpareParts([]);
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
  }, [token, caseParams, filterParams, topProblemsLimit, topProblemsByLineLimit, topCausesLimit, topMachinesLimit, topSparePartsLimit]);


  useEffect(() => {
    setPage(1);
  }, [monthFilter, yearFilter, machineIdFilter, dateFrom, dateTo, timeFrom, timeTo, lineFilter, problemIdFilter, causeIdFilter]);

  useSocket((_event, payload) => {
    setEventMessage(`Nuovo aggiornamento caso: ${payload && (payload as any).caseId ? (payload as any).caseId : 'aggiornamento disponibile'}`);
    loadData();
  });

  const resetFilters = () => {
    setPage(1);
    setMonthFilter('');
    setYearFilter('');
    setMachineIdFilter('');
    setDateFrom('');
    setDateTo('');
    setTimeFrom('');
    setTimeTo('');
    setLineFilter('');
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

  const pageCount = Math.max(1, Math.ceil(total / limit));

  const trendChart = useMemo(
    () => trend.map((item) => ({ date: item.date.slice(5), count: Number(item.count) })),
    [trend]
  );

  const activeFilters = [
    monthFilter ? 'mese' : null,
    yearFilter ? 'anno' : null,
    machineIdFilter ? 'macchina' : null,
    dateFrom ? 'data da' : null,
    dateTo ? 'data a' : null,
    timeFrom ? 'ora da' : null,
    timeTo ? 'ora a' : null,
    lineFilter ? 'linea' : null,
    problemIdFilter ? 'problema' : null,
    causeIdFilter ? 'causa' : null
  ].filter(Boolean);

  const caseLabel = (item: CaseItem) =>
    [item.machine_code, item.problem_name !== 'N.D.' ? item.problem_name : null].filter(Boolean).join(' · ') || item.machine_code;

  const chartTooltipStyle = { backgroundColor: '#0f172a', borderRadius: 12, border: '1px solid #334155' };

  const sparePartsChart = useMemo(
    () => topSpareParts.map((item) => ({ name: item.spare_part, count: Number(item.usage_count) })),
    [topSpareParts]
  );

  return (
    <div className="space-y-6 p-4 sm:p-6">
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-3xl bg-slate-900/80 p-5 shadow-lg shadow-slate-950/20 sm:p-6">
          <div className="text-xs uppercase tracking-[0.22em] text-slate-400 sm:text-sm">Totale casi</div>
          <div className="mt-3 text-3xl font-semibold sm:text-4xl">{summary.total}</div>
        </div>
        <div className="rounded-3xl bg-slate-900/80 p-5 shadow-lg shadow-slate-950/20 sm:p-6">
          <div className="text-xs uppercase tracking-[0.22em] text-slate-400 sm:text-sm">Pagina</div>
          <div className="mt-3 text-3xl font-semibold sm:text-4xl">{page} / {pageCount}</div>
          <div className="mt-2 text-sm text-slate-500">Filtri: {activeFilters.length ? activeFilters.join(', ') : 'nessuno'}</div>
        </div>
        <div className="rounded-3xl bg-slate-900/80 p-5 shadow-lg shadow-slate-950/20 sm:col-span-2 sm:p-6 lg:col-span-1">
          <div className="text-xs uppercase tracking-[0.22em] text-slate-400 sm:text-sm">Questo mese</div>
          <div className="mt-3 text-3xl font-semibold sm:text-4xl">{summary.this_month}</div>
        </div>
      </div>

      <div className="rounded-3xl bg-slate-900/80 p-4 shadow-lg shadow-slate-950/20 sm:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold sm:text-xl">Filtri visualizzazione</h2>
            <p className="text-sm text-slate-400">I grafici e la lista si aggiornano automaticamente.</p>
          </div>
          <button type="button" onClick={resetFilters} className="w-full rounded-2xl border border-slate-700 bg-slate-900/90 px-5 py-2.5 text-sm text-slate-100 transition hover:bg-slate-800 sm:w-auto">
            Reset filtri
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Periodo</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
              <div>
                <label className="block text-xs text-slate-400">Mese</label>
                <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none">
                  <option value="">Tutti</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400">Anno</label>
                <input type="number" min="2020" max="2100" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} placeholder="Es. 2026" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none" />
              </div>
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="block text-xs text-slate-400">Macchina</label>
                <select value={machineIdFilter} onChange={(e) => setMachineIdFilter(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none">
                  <option value="">Tutte</option>
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>{m.code} - {m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400">Linea</label>
                <select value={lineFilter} onChange={(e) => setLineFilter(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none">
                  <option value="">Tutte</option>
                  {[...new Set(machines.map((m) => m.line).filter(Boolean))].map((ln) => (
                    <option key={ln as string} value={ln as string}>{ln as string}</option>
                  ))}
                </select>
              </div>
              <CategoriesSelect label="Problema" value={problemIdFilter} onChange={setProblemIdFilter} categories={categories} type="problem" placeholder="Tutti" disabled={categories.length === 0} />
              <CategoriesSelect label="Causa" value={causeIdFilter} onChange={setCauseIdFilter} categories={categories} type="cause" placeholder="Tutti" disabled={categories.length === 0} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-3xl bg-slate-900/80 p-4 shadow-lg shadow-slate-950/20 sm:p-6">
          <h3 className="mb-4 text-lg font-semibold text-slate-100">Trend casi</h3>
          <div className="w-full" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trendChart} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="4 4" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} interval="preserveStartEnd" />
                <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} width={32} />
                <Tooltip wrapperStyle={chartTooltipStyle} />
                <Line type="monotone" dataKey="count" stroke="#38bdf8" strokeWidth={3} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-3xl bg-slate-900/80 p-4 shadow-lg shadow-slate-950/20 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-slate-100">Problemi per linea</h3>
            <TopSelector value={topProblemsByLineLimit} onChange={setTopProblemsByLineLimit} />
          </div>
          <div className="w-full" style={{ height: 280 }}>

            {problemsByLine.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Nessun dato.</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={problemsByLine} margin={{ top: 8, right: 12, left: 0, bottom: 24 }}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="4 4" />
                  <XAxis dataKey="line" stroke="#94a3b8" fontSize={11} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} width={32} />
                  <Tooltip wrapperStyle={chartTooltipStyle} />
                  <Bar dataKey="problem_count" fill="#38bdf8" radius={[6, 6, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-3xl bg-slate-900/80 p-4 shadow-lg shadow-slate-950/20 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-slate-100">Top problemi</h3>
            <TopSelector value={topProblemsLimit} onChange={setTopProblemsLimit} />
          </div>
          <div className="w-full" style={{ height: 280 }}>
            {topProblems.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Nessun dato.</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={topProblems} margin={{ top: 8, right: 12, left: 0, bottom: 40 }}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="4 4" />
                  <XAxis dataKey="problem" stroke="#94a3b8" fontSize={10} interval={0} angle={-25} textAnchor="end" height={55} />
                  <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} width={32} />
                  <Tooltip wrapperStyle={chartTooltipStyle} />
                  <Bar dataKey="count" fill="#a78bfa" radius={[6, 6, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-3xl bg-slate-900/80 p-4 shadow-lg shadow-slate-950/20 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-slate-100">Top cause</h3>
            <TopSelector value={topCausesLimit} onChange={setTopCausesLimit} />
          </div>
          <div className="w-full" style={{ height: 280 }}>
            {topCauses.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Nessun dato.</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={topCauses} margin={{ top: 8, right: 12, left: 0, bottom: 40 }}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="4 4" />
                  <XAxis dataKey="cause" stroke="#94a3b8" fontSize={10} interval={0} angle={-25} textAnchor="end" height={55} />
                  <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} width={32} />
                  <Tooltip wrapperStyle={chartTooltipStyle} />
                  <Bar dataKey="count" fill="#34d399" radius={[6, 6, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-3xl bg-slate-900/80 p-4 shadow-lg shadow-slate-950/20 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-slate-100">Top macchine</h3>
            <TopSelector value={topMachinesLimit} onChange={setTopMachinesLimit} />
          </div>
          <div className="w-full" style={{ height: 280 }}>
            {topMachines.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Nessun dato.</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={topMachines} margin={{ top: 8, right: 12, left: 0, bottom: 24 }}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="4 4" />
                  <XAxis dataKey="machine" stroke="#94a3b8" fontSize={11} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} width={32} />
                  <Tooltip wrapperStyle={chartTooltipStyle} />
                  <Bar dataKey="count" fill="#fbbf24" radius={[6, 6, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-3xl bg-slate-900/80 p-4 shadow-lg shadow-slate-950/20 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-slate-100">Top ricambi usati</h3>
            <TopSelector value={topSparePartsLimit} onChange={setTopSparePartsLimit} />
          </div>
          <div className="w-full" style={{ height: 280 }}>
            {sparePartsChart.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Nessun ricambio registrato.</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={sparePartsChart} margin={{ top: 8, right: 12, left: 0, bottom: 40 }}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="4 4" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} interval={0} angle={-25} textAnchor="end" height={55} />
                  <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} width={32} />
                  <Tooltip wrapperStyle={chartTooltipStyle} />
                  <Bar dataKey="count" fill="#f472b6" radius={[6, 6, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-3xl bg-slate-900/80 p-4 shadow-lg shadow-slate-950/20 sm:p-6 md:col-span-2">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold sm:text-2xl">Lista casi</h2>
              <p className="text-sm text-slate-400">Ultimi casi registrati.</p>
            </div>
            <div className="text-sm text-slate-400">{loading ? 'Aggiornamento...' : `${cases.length} casi visualizzati`}</div>
          </div>

          <div className="overflow-x-auto rounded-3xl border border-slate-700 bg-slate-950/90">
            <table className="min-w-[720px] w-full divide-y divide-slate-800 text-left text-sm text-slate-200">
              <thead className="bg-slate-950/90 text-slate-400">
                <tr>
                  <th className="px-3 py-3 sm:px-4">Macchina</th>
                  <th className="hidden px-3 py-3 sm:table-cell sm:px-4">Problema</th>
                  <th className="hidden px-3 py-3 md:table-cell md:px-4">Causa</th>
                  <th className="hidden px-3 py-3 lg:table-cell lg:px-4">Ricambio</th>
                  <th className="hidden px-3 py-3 md:table-cell md:px-4">Data</th>
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
                      <td className="px-3 py-3 font-medium text-slate-100 sm:px-4 sm:py-4">{item.machine_code}</td>
                      <td className="hidden px-3 py-3 text-slate-300 sm:table-cell sm:px-4 sm:py-4">{item.problem_name || 'N.D.'}</td>
                      <td className="hidden px-3 py-3 text-slate-300 md:table-cell md:px-4 md:py-4">{item.cause_name || 'N.D.'}</td>
                      <td className="hidden px-3 py-3 text-slate-300 lg:table-cell lg:px-4 lg:py-4">{item.spare_part_name || 'N.D.'}</td>
                      <td className="hidden px-3 py-3 text-slate-400 md:table-cell md:px-4 md:py-4">
                        {item.created_at ? new Date(item.created_at).toLocaleDateString('it-IT') : '—'}
                      </td>
                      <td className="px-3 py-3 sm:px-4 sm:py-4">
                        <div className="flex flex-wrap gap-2">
                          {canEditCase(item) && (
                            <button type="button" className="rounded-xl border border-slate-600 px-2.5 py-1 text-xs text-slate-100 hover:bg-slate-800" onClick={() => setEditingCase(item)}>
                              Apri
                            </button>
                          )}
                          {canDeleteCase && (
                            <button type="button" className="rounded-xl border border-rose-500/40 px-2.5 py-1 text-xs text-rose-300 hover:bg-rose-500/10" onClick={() => setDeletingCase(item)}>
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
      </div>

      {token && (
        <CaseDetailModal
          open={!!editingCase}
          token={token}
          caseItem={editingCase}
          machines={machines}
          categories={categories}
          canEdit={!!editingCase && canEditCase(editingCase as CaseItem)}
          isAdmin={user?.role === 'admin'}
          onClose={() => setEditingCase(null)}
          onSaved={loadData}
        />
      )}

      <ConfirmModal
        open={!!deletingCase}
        title="Elimina caso"
        message={<>Sei sicuro di voler eliminare il caso <strong>{deletingCase ? caseLabel(deletingCase) : ''}</strong>? L&apos;operazione è irreversibile.</>}
        confirmText="Elimina"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeletingCase(null)}
      />
    </div>
  );
}
