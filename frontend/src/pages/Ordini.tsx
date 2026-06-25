import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Link } from 'react-router-dom';

const API_URL = '/api';

type ReorderItem = {
  id: string;
  spare_part_id: string;
  spare_part_name: string;
  spare_part_description?: string;
  codice?: string;
  tipologie: string[];
  quantita_ordinata: number;
  quantita_ricevuta: number;
  status: 'pending' | 'partial' | 'completed';
};

type Reorder = {
  id: string;
  numero_ordine: number;
  status: 'pending' | 'partial' | 'completed' | 'cancelled';
  note?: string;
  created_at: string;
  created_by_username?: string;
  total_items: number;
  total_qty_ordinata: number;
  total_qty_ricevuta: number;
};

type ReorderDetail = Reorder & { items: ReorderItem[] };

const STATUS_LABEL: Record<string, string> = {
  pending: 'In sospeso',
  partial: 'Parziale',
  completed: 'Completato',
  cancelled: 'Annullato',
};
const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-400',
  partial: 'bg-sky-500/15 text-sky-400',
  completed: 'bg-emerald-500/15 text-emerald-400',
  cancelled: 'bg-slate-700 text-slate-400',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_COLOR[status] ?? 'bg-slate-700 text-slate-400'}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-800">
      <div
        className="h-1.5 rounded-full bg-emerald-500 transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function Ordini() {
  const { token } = useAuth();
  const headers = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);

  const [reorders, setReorders] = useState<Reorder[]>([]);
  const [detail, setDetail] = useState<ReorderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [ricezioneForm, setRicezioneForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/reorders`, {
        ...headers,
        params: filterStatus ? { status: filterStatus } : {},
      });
      setReorders(r.data.items ?? []);
    } catch { setMessage('Errore caricamento ordini.'); }
    finally { setLoading(false); }
  }, [headers, filterStatus]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (id: string) => {
    setLoadingDetail(true);
    setDetail(null);
    try {
      const r = await axios.get(`${API_URL}/reorders/${id}`, headers);
      setDetail({ ...r.data.item, items: r.data.items });
      const initForm: Record<string, string> = {};
      for (const it of r.data.items) {
        initForm[it.id] = String(it.quantita_ricevuta);
      }
      setRicezioneForm(initForm);
    } catch { setMessage('Errore caricamento dettaglio.'); }
    finally { setLoadingDetail(false); }
  };

  const closeDetail = () => { setDetail(null); setRicezioneForm({}); };

  const saveRicezione = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      for (const item of detail.items) {
        const newVal = parseInt(ricezioneForm[item.id] ?? String(item.quantita_ricevuta));
        if (newVal !== item.quantita_ricevuta) {
          await axios.patch(
            `${API_URL}/reorders/${detail.id}/items/${item.id}`,
            { quantita_ricevuta: newVal },
            headers
          );
        }
      }
      setMessage(`Ordine N°${detail.numero_ordine} aggiornato.`);
      closeDetail();
      load();
    } catch (err: any) { setMessage(err?.response?.data?.error ?? 'Errore salvataggio.'); }
    finally { setSaving(false); }
  };

  const cancelOrder = async (id: string, numero: number) => {
    if (!window.confirm(`Annullare l'ordine N°${numero}?`)) return;
    try {
      await axios.patch(`${API_URL}/reorders/${id}/cancel`, {}, headers);
      setMessage(`Ordine N°${numero} annullato.`);
      closeDetail();
      load();
    } catch (err: any) { setMessage(err?.response?.data?.error ?? 'Errore annullamento.'); }
  };

  const printPdf = (id: string) => {
    window.open(`${API_URL}/reorders/${id}/pdf?token=${token}`, '_blank');
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Ordini di Riordino</h1>
          <p className="text-sm text-slate-400">Gestisci gli ordini di riapprovvigionamento ricambi.</p>
        </div>
        <Link
          to="/magazzino"
          className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800 transition"
        >
          ← Magazzino
        </Link>
      </div>

      {message && (
        <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100 flex items-center justify-between gap-3">
          <span>{message}</span>
          <button type="button" onClick={() => setMessage(null)} className="text-sky-400 hover:text-sky-200 font-bold">×</button>
        </div>
      )}

      {/* Filtro status */}
      <div className="flex flex-wrap gap-2">
        {['', 'pending', 'partial', 'completed', 'cancelled'].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilterStatus(s)}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
              filterStatus === s ? 'bg-sky-500 text-slate-950' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {s === '' ? 'Tutti' : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {/* Lista ordini */}
      {loading ? (
        <p className="text-sm text-slate-500">Caricamento...</p>
      ) : reorders.length === 0 ? (
        <p className="text-sm text-slate-500 italic text-center py-8">Nessun ordine trovato.</p>
      ) : (
        <div className="space-y-3">
          {reorders.map((r) => (
            <div key={r.id} className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-100">Ordine N°{r.numero_ordine}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {new Date(r.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    {r.created_by_username && ` · ${r.created_by_username}`}
                    {r.note && ` · ${r.note}`}
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="text-xs text-slate-400">
                      {r.total_qty_ricevuta} / {r.total_qty_ordinata} pz ricevuti ({r.total_items} righe)
                    </div>
                    <ProgressBar done={r.total_qty_ricevuta} total={r.total_qty_ordinata} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  {r.status !== 'cancelled' && r.status !== 'completed' && (
                    <button
                      type="button"
                      onClick={() => openDetail(r.id)}
                      className="rounded-2xl bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400 transition"
                    >
                      Ricevi merce
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openDetail(r.id)}
                    className="rounded-2xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 transition"
                  >
                    Dettaglio
                  </button>
                  <button
                    type="button"
                    onClick={() => printPdf(r.id)}
                    className="rounded-2xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 transition"
                    title="Stampa PDF (funzionale dopo aver configurato l'endpoint PDF)"
                  >
                    PDF
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── MODAL DETTAGLIO / RICEVI MERCE ── */}
      {(loadingDetail || detail) && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl max-h-[90vh] overflow-y-auto">
            {loadingDetail ? (
              <div className="p-8 text-center text-sm text-slate-500">Caricamento...</div>
            ) : detail ? (
              <div className="p-5 sm:p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-100">Ordine N°{detail.numero_ordine}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <StatusBadge status={detail.status} />
                      {detail.note && <span className="text-xs text-slate-500">{detail.note}</span>}
                    </div>
                  </div>
                  <button type="button" onClick={closeDetail} className="text-slate-500 hover:text-slate-200 text-2xl leading-none">×</button>
                </div>

                {/* Righe ordine */}
                <div className="space-y-3">
                  {detail.items.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-slate-100">{item.spare_part_name}</span>
                            {item.codice && <span className="text-xs text-slate-500 font-mono">{item.codice}</span>}
                            <StatusBadge status={item.status} />
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            Ordinato: {item.quantita_ordinata} pz · Ricevuto: {item.quantita_ricevuta} pz
                          </div>
                          <ProgressBar done={item.quantita_ricevuta} total={item.quantita_ordinata} />
                        </div>
                        {detail.status !== 'cancelled' && detail.status !== 'completed' && (
                          <div className="shrink-0">
                            <label className="text-xs text-slate-400 block mb-1">Qtà ricevuta</label>
                            <input
                              type="number"
                              min={0}
                              max={item.quantita_ordinata}
                              value={ricezioneForm[item.id] ?? String(item.quantita_ricevuta)}
                              onChange={(e) =>
                                setRicezioneForm((c) => ({ ...c, [item.id]: e.target.value }))
                              }
                              className="w-24 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Azioni modal */}
                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800">
                  {detail.status !== 'cancelled' && detail.status !== 'completed' && (
                    <button
                      type="button"
                      onClick={saveRicezione}
                      disabled={saving}
                      className="rounded-2xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition"
                    >
                      {saving ? 'Salvataggio...' : 'Registra ricezione'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => printPdf(detail.id)}
                    className="rounded-2xl bg-slate-800 px-5 py-2.5 text-sm font-semibold text-slate-100 hover:bg-slate-700 transition"
                  >
                    Stampa PDF
                  </button>
                  {detail.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => cancelOrder(detail.id, detail.numero_ordine)}
                      className="rounded-2xl bg-rose-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-rose-400 transition"
                    >
                      Annulla ordine
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={closeDetail}
                    className="rounded-2xl border border-slate-700 bg-slate-900 px-5 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800 transition"
                  >
                    Chiudi
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
