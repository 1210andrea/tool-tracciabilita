import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Link } from 'react-router-dom';

const API_URL = '/api';

type Reorder = {
  id: string;
  numero_ordine: number;
  status: 'in_lavorazione' | 'partial' | 'completed' | 'cancelled';
  note?: string;
  created_at: string;
  created_by_username?: string;
  spare_part_id: string;
  spare_part_name?: string;
  codice?: string;
  tipologia?: string;
  quantita_ordinata: number;
  quantita_ricevuta: number;
};

const STATUS_LABEL: Record<string, string> = {
  in_lavorazione: 'IN LAVORAZIONE',
  partial: 'PARZIALE',
  completed: 'COMPLETATO',
  cancelled: 'ANNULLATO',
};
const STATUS_COLOR: Record<string, string> = {
  in_lavorazione: 'bg-blue-500/15 text-blue-400',
  partial: 'bg-orange-500/15 text-orange-400',
  completed: 'bg-emerald-500/15 text-emerald-400',
  cancelled: 'bg-slate-700 text-slate-400',
};

function StatusChip({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${
      STATUS_COLOR[status] ?? 'bg-slate-700 text-slate-400'
    }`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-800">
      <div className="h-1.5 rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function Ordini() {
  const { token, user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const headers = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);

  const [reorders, setReorders] = useState<Reorder[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'info' | 'error' } | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('');

  const [versamentoId, setVersamentoId]     = useState<string | null>(null);
  const [versamentoQty, setVersamentoQty]   = useState('');
  const [versamentoSaving, setVersamentoSaving] = useState(false);
  const [deletingId, setDeletingId]         = useState<string | null>(null);

  const msg = (text: string, type: 'info' | 'error' = 'info') => setMessage({ text, type });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/reorders`, {
        ...headers,
        params: filterStatus ? { status: filterStatus } : {},
      });
      setReorders(r.data.items ?? []);
    } catch { msg('Errore caricamento ordini.', 'error'); }
    finally { setLoading(false); }
  }, [headers, filterStatus]);

  useEffect(() => { load(); }, [load]);

  const downloadPdf = async (id: string, numero: number) => {
    try {
      const response = await axios.get(`${API_URL}/reorders/${id}/pdf`, {
        ...headers, responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `ordine-${numero}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch { msg('Errore download PDF.', 'error'); }
  };

  const versamentoOrder = reorders.find((r) => r.id === versamentoId);
  const versamentoInput = parseInt(versamentoQty) || 0;
  const nuovaRicevuta   = versamentoOrder ? versamentoOrder.quantita_ricevuta + versamentoInput : 0;
  const siChiude        = versamentoOrder ? nuovaRicevuta >= versamentoOrder.quantita_ordinata : false;
  const eccedenza       = versamentoOrder ? nuovaRicevuta - versamentoOrder.quantita_ordinata : 0;

  const submitVersamento = async () => {
    if (!versamentoId || versamentoInput <= 0) { msg('Inserisci una quantità valida.', 'error'); return; }
    setVersamentoSaving(true);
    try {
      const r = await axios.patch(
        `${API_URL}/reorders/${versamentoId}/versamento`,
        { quantita_versata: versamentoInput },
        headers
      );
      msg(r.data?.item?.status === 'completed'
        ? 'Ordine completato e chiuso automaticamente ✓'
        : 'Versamento registrato.');
      setVersamentoId(null);
      setVersamentoQty('');
      load();
    } catch (err: any) { msg(err?.response?.data?.error ?? 'Errore versamento.', 'error'); }
    finally { setVersamentoSaving(false); }
  };

  const cancelOrder = async (id: string, numero: number) => {
    if (!window.confirm(`Annullare l'ordine N°${numero}?`)) return;
    try {
      await axios.patch(`${API_URL}/reorders/${id}/cancel`, {}, headers);
      msg(`Ordine N°${numero} annullato.`);
      load();
    } catch (err: any) { msg(err?.response?.data?.error ?? 'Errore annullamento.', 'error'); }
  };

  const deleteOrder = async (id: string, numero: number) => {
    if (!window.confirm(
      `Eliminare definitivamente l'ordine N°${numero}? L'operazione non è reversibile.`
    )) return;
    setDeletingId(id);
    try {
      await axios.delete(`${API_URL}/reorders/${id}`, headers);
      msg(`Ordine N°${numero} eliminato.`);
      load();
    } catch (err: any) { msg(err?.response?.data?.error ?? 'Errore eliminazione.', 'error'); }
    finally { setDeletingId(null); }
  };

  // Un ordine può essere eliminato se:
  // - admin: qualsiasi ordine
  // - magazziniere: solo cancelled
  const canDelete = (r: Reorder) =>
    isAdmin || r.status === 'cancelled';

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Ordini Interni</h1>
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
        <div className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${
          message.type === 'error'
            ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
            : 'border-sky-500/30 bg-sky-500/10 text-sky-100'
        }`}>
          <span>{message.text}</span>
          <button type="button" onClick={() => setMessage(null)} className="font-bold opacity-70 hover:opacity-100">×</button>
        </div>
      )}

      {/* Filtri status */}
      <div className="flex flex-wrap gap-2">
        {(['', 'in_lavorazione', 'partial', 'completed', 'cancelled'] as const).map((s) => (
          <button
            key={s} type="button" onClick={() => setFilterStatus(s)}
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
            <div
              key={r.id}
              className={`rounded-3xl border p-4 sm:p-5 transition ${
                r.status === 'cancelled'
                  ? 'border-slate-800/50 bg-slate-950/40 opacity-60'
                  : 'border-slate-800 bg-slate-950/80'
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-100">N°{r.numero_ordine}</span>
                    <StatusChip status={r.status} />
                    {r.spare_part_name && (
                      <span className="text-sm text-slate-300">{r.spare_part_name}</span>
                    )}
                    {r.codice && (
                      <span className="font-mono text-xs text-slate-500">{r.codice}</span>
                    )}
                    {r.tipologia && (
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                        {r.tipologia}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {new Date(r.created_at).toLocaleDateString('it-IT', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                    })}
                    {r.created_by_username && ` · ${r.created_by_username}`}
                    {r.note && ` · ${r.note}`}
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="text-xs text-slate-400">
                      {r.quantita_ricevuta} / {r.quantita_ordinata} pz ricevuti
                    </div>
                    <ProgressBar done={r.quantita_ricevuta} total={r.quantita_ordinata} />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 shrink-0">
                  {/* PDF — solo ordini non annullati */}
                  {r.status !== 'cancelled' && (
                    <button
                      type="button"
                      onClick={() => downloadPdf(r.id, r.numero_ordine)}
                      className="rounded-2xl bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700 transition"
                    >
                      📄 PDF
                    </button>
                  )}

                  {/* Versamento */}
                  {(r.status === 'in_lavorazione' || r.status === 'partial') && (
                    <button
                      type="button"
                      onClick={() => { setVersamentoId(r.id); setVersamentoQty(''); }}
                      className="rounded-2xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition"
                    >
                      Versamento
                    </button>
                  )}

                  {/* Annulla — solo in_lavorazione senza versamenti */}
                  {r.status === 'in_lavorazione' && r.quantita_ricevuta === 0 && (
                    <button
                      type="button"
                      onClick={() => cancelOrder(r.id, r.numero_ordine)}
                      className="rounded-2xl bg-rose-500/20 border border-rose-500/30 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/30 transition"
                    >
                      Annulla
                    </button>
                  )}

                  {/* Elimina — admin: qualsiasi; magazziniere: solo cancelled */}
                  {canDelete(r) && (
                    <button
                      type="button"
                      onClick={() => deleteOrder(r.id, r.numero_ordine)}
                      disabled={deletingId === r.id}
                      className="rounded-2xl bg-rose-900/40 border border-rose-800/50 px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-900/70 disabled:opacity-50 transition"
                    >
                      {deletingId === r.id ? 'Eliminazione...' : '🗑 Elimina'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL VERSAMENTO */}
      {versamentoId && versamentoOrder && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl">
            <div className="p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-100">Registra versamento</h2>
                <button type="button" onClick={() => setVersamentoId(null)} className="text-slate-500 hover:text-slate-200 text-2xl leading-none">×</button>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-100">{versamentoOrder.spare_part_name}</span>
                  {versamentoOrder.codice && (
                    <span className="font-mono text-xs text-slate-500">{versamentoOrder.codice}</span>
                  )}
                  {versamentoOrder.tipologia && (
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                      {versamentoOrder.tipologia}
                    </span>
                  )}
                  <StatusChip status={versamentoOrder.status} />
                </div>
                <div className="text-slate-400 text-xs">
                  Ordinato: <span className="text-slate-200 font-medium">{versamentoOrder.quantita_ordinata}</span> pz
                  · Già ricevuto: <span className="text-slate-200 font-medium">{versamentoOrder.quantita_ricevuta}</span> pz
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Quantità versata <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number" min={1}
                  value={versamentoQty}
                  onChange={(e) => setVersamentoQty(e.target.value)}
                  placeholder="es. 5"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none"
                />
              </div>

              {versamentoInput > 0 && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm space-y-1">
                  <div className="text-slate-400">
                    Dopo il versamento: <span className="font-semibold text-slate-100">{nuovaRicevuta} / {versamentoOrder.quantita_ordinata}</span>
                  </div>
                  {siChiude && (
                    <div className="text-emerald-400 text-xs font-medium">
                      ✓ Ordine si chiuderà
                      {eccedenza > 0 && <span className="ml-1">(eccedenza: +{eccedenza} pz in giacenza)</span>}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button" onClick={submitVersamento}
                  disabled={versamentoSaving || versamentoInput <= 0}
                  className="rounded-2xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition flex-1"
                >
                  {versamentoSaving ? 'Salvataggio...' : 'Registra versamento'}
                </button>
                <button
                  type="button" onClick={() => setVersamentoId(null)}
                  className="rounded-2xl border border-slate-700 bg-slate-900 px-5 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800 transition"
                >
                  Annulla
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
