import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import { CaseDetailModal, type CaseDetail } from '../components/CaseDetailModal';

const API_URL = '/api';

type CaseItem = CaseDetail & {
  created_at: string;
  machine_code: string;
  problem_name: string;
  cause_name: string;
};

export default function UserHome() {
  const { token } = useAuth();
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [machines, setMachines] = useState<{ id: string; code: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; type: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCase, setSelectedCase] = useState<CaseItem | null>(null);

  const loadData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const resp = await axios.get(`${API_URL}/cases`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { statuses: 'open,in_progress', limit: 50 }
      });
      setCases(resp.data.items || []);
    } catch {
      setCases([]);
    } finally {
      setLoading(false);
    }
  };

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

  useEffect(() => { loadData(); }, [token]);

  useSocket(() => { loadData(); });

  const openCount = useMemo(() => cases.filter((c) => c.status === 'open').length, [cases]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">I miei casi</h1>
          <p className="text-sm text-slate-400">
            Hai {openCount} casi aperti su {cases.length} attivi.
          </p>
        </div>
        <Link
          to="/cases/new"
          className="inline-flex justify-center rounded-2xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
        >
          Apri nuovo caso
        </Link>
      </div>

      {loading ? (
        <div className="rounded-3xl bg-slate-900/80 p-10 text-center text-slate-400">Caricamento...</div>
      ) : cases.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-900/50 p-10 text-center">
          <p className="text-slate-300">Non hai casi aperti al momento.</p>
          <Link to="/cases/new" className="mt-4 inline-block text-sky-400 hover:text-sky-300">
            Crea il tuo primo caso →
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {cases.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedCase(item)}
              className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 text-left transition hover:border-sky-500/40 hover:bg-slate-900"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold text-slate-100">{item.title}</h2>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  item.status === 'open' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-sky-500/15 text-sky-300'
                }`}>
                  {item.status === 'open' ? 'Aperto' : 'In corso'}
                </span>
              </div>
              <div className="mt-3 space-y-1 text-sm text-slate-400">
                <div>Macchina: <span className="text-slate-200">{item.machine_code}</span></div>
                <div>Problema: <span className="text-slate-200">{item.problem_name || 'N.D.'}</span></div>
                <div>Causa: <span className="text-slate-200">{item.cause_name || 'N.D.'}</span></div>
              </div>
              <div className="mt-4 text-xs text-sky-400">Apri per dettagli e analisi IA →</div>
            </button>
          ))}
        </div>
      )}

      {token && selectedCase && (
        <CaseDetailModal
          open={!!selectedCase}
          token={token}
          caseItem={selectedCase}
          machines={machines}
          categories={categories}
          canEdit
          onClose={() => setSelectedCase(null)}
          onSaved={loadData}
        />
      )}
    </div>
  );
}
