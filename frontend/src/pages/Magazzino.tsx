import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Link } from 'react-router-dom';


const API_URL = '/api';


type SparePart = {
  id: string;
  name: string;
  codice?: string;
  description?: string;
  tipologia?: string;
  quantita: number;
  scorta_minima: number;
  quantita_riordino: number;
  sotto_scorta: boolean;
  giacenza_negativa: boolean;
  ordine_aperto: boolean;
  usage_count: number;
};


type Movimento = {
  id: string;
  tipo: 'scarico_manutenzione' | 'versamento_riordine' | 'rettifica_manuale';
  delta: number;
  quantita_dopo: number;
  riferimento_tipo?: string;
  riferimento_numero?: string;
  riferimento_id?: string;
  riferimento_label?: string;
  note?: string;
  actor_username?: string;
  created_at: string;
};


function BadgeGiacenza({ part }: { part: SparePart }) {
  if (part.giacenza_negativa)
    return <span className="rounded-full bg-rose-700/30 px-3 py-1 text-xs font-bold text-rose-300">⚠ Giacenza negativa</span>;
  if (part.quantita === 0)
    return <span className="rounded-full bg-rose-500/15 px-3 py-1 text-xs font-bold text-rose-400">Esaurito</span>;
  if (part.sotto_scorta)
    return <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-400">⚠ Sotto scorta</span>;
  return <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-400">✓ OK</span>;
}


const TIPO_LABEL: Record<string, string> = {
  scarico_manutenzione: 'Scarico utilizzo',
  versamento_riordine: 'Versamento riordine',
  rettifica_manuale: 'Rettifica manuale',
};
const TIPO_COLOR: Record<string, string> = {
  scarico_manutenzione: 'text-rose-400',
  versamento_riordine: 'text-emerald-400',
  rettifica_manuale: 'text-amber-400',
};


type RettificaForm = { delta: string; note: string; };
type OrdineForm = { quantita_ordinata: string; note: string; };


export default function Magazzino() {
  const { token, user } = useAuth();
  const isWarehouse = user?.role === 'admin' || user?.role === 'magazziniere';
  const headers = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);


  const [parts, setParts] = useState<SparePart[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'info' | 'error' } | null>(null);
  const [search, setSearch] = useState('');
  const [filterSottoScorta, setFilterSottoScorta] = useState(false);


  // Rettifica modal
  const [rettificaId, setRettificaId] = useState<string | null>(null);
  const [rettificaForm, setRettificaForm] = useState<RettificaForm>({ delta: '0', note: '' });
  const [rettificaSaving, setRettificaSaving] = useState(false);


  // Crea ordine modal
  const [ordinePartId, setOrdinePartId] = useState<string | null>(null);
  const [ordineForm, setOrdineForm] = useState<OrdineForm>({ quantita_ordinata: '', note: '' });
  const [ordineSaving, setOrdineSaving] = useState(false);


  // Storico drawer
  const [storicoPart, setStoricoPart] = useState<SparePart | null>(null);
  const [movimenti, setMovimenti] = useState<Movimento[]>([]);
  const [storicoLoading, setStoricoLoading] = useState(false);
  const [storicoPage, setStoricoPage] = useState(1);
  const [storicoTotal, setStoricoTotal] = useState(0);
  const [storicoFiltroTipo, setStoricoFiltroTipo] = useState('');
  const [storicoFiltroFrom, setStoricoFiltroFrom] = useState('');
  const [storicoFiltroTo, setStoricoFiltroTo] = useState('');


  const LIMIT = 20;


  const msg = (text: string, type: 'info' | 'error' = 'info') => setMessage({ text, type });


  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/spare-parts`, headers);
      setParts(r.data.items ?? []);
    } catch { msg('Errore caricamento ricambi.', 'error'); }
    finally { setLoading(false); }
  }, [headers]);


  useEffect(() => { load(); }, [load]);


  const filtered = useMemo(() => {
    let list = parts;
    if (filterSottoScorta) list = list.filter((p) => p.sotto_scorta || p.giacenza_negativa);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        (p.codice ?? '').toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [parts, search, filterSottoScorta]);


  const countSottoScorta = parts.filter((p) => p.sotto_scorta || p.giacenza_negativa).length;
  const countSenzaOrdine = parts.filter((p) => (p.sotto_scorta || p.giacenza_negativa) && !p.ordine_aperto).length;


  // ── RETTIFICA ────────────────────────────────────────────────────────────────
  const openRettifica = (part: SparePart) => {
    setRettificaId(part.id);
    setRettificaForm({ delta: '0', note: '' });
  };


  const rettificaPart = parts.find((p) => p.id === rettificaId);
  const rettificaDelta = parseInt(rettificaForm.delta) || 0;
  const rettificaNuovaGiacenza = rettificaPart ? rettificaPart.quantita + rettificaDelta : 0;


  const submitRettifica = async () => {
    if (!rettificaId || rettificaDelta === 0) { msg('Il delta deve essere diverso da 0.', 'error'); return; }
    if (!rettificaForm.note.trim()) { msg('La nota è obbligatoria.', 'error'); return; }
    setRettificaSaving(true);
    try {
      await axios.patch(`${API_URL}/spare-parts/${rettificaId}/rettifica`, {
        delta: rettificaDelta,
        note: rettificaForm.note.trim(),
      }, headers);
      msg('Rettifica registrata.');
      setRettificaId(null);
      load();
    } catch (err: any) { msg(err?.response?.data?.error ?? 'Errore rettifica.', 'error'); }
    finally { setRettificaSaving(false); }
  };


  // ── CREA ORDINE ──────────────────────────────────────────────────────────────
  const openCreaOrdine = (part: SparePart) => {
    setOrdinePartId(part.id);
    setOrdineForm({ quantita_ordinata: String(part.quantita_riordino), note: '' });
  };


  const ordinePart = parts.find((p) => p.id === ordinePartId);


  const submitCreaOrdine = async () => {
    if (!ordinePartId || !ordinePart) return;
    const qty = parseInt(ordineForm.quantita_ordinata);
    if (!qty || qty <= 0) { msg('Quantità non valida.', 'error'); return; }
    setOrdineSaving(true);
    try {
      const response = await axios.post(
        `${API_URL}/reorders`,
        { spare_part_id: ordinePartId, quantita_ordinata: qty, note: ordineForm.note.trim() || null },
        { ...headers, responseType: 'blob' }
      );
      // Scarica il PDF automaticamente
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      const disposition = response.headers['content-disposition'] ?? '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      a.download = match ? match[1] : `ordine.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      msg(`Ordine creato e PDF scaricato.`);
      setOrdinePartId(null);
      load();
    } catch (err: any) {
      // Se la response è blob e c'è un errore, proviamo a leggere il json
      if (err?.response?.data instanceof Blob) {
        const text = await err.response.data.text();
        try { const json = JSON.parse(text); msg(json.error ?? 'Errore creazione ordine.', 'error'); return; } catch {}
      }
      msg(err?.response?.data?.error ?? 'Errore creazione ordine.', 'error');
    } finally { setOrdineSaving(false); }
  };


  // ── STORICO MOVIMENTI ────────────────────────────────────────────────────────
  const loadMovimenti = useCallback(async (partId: string, page: number, tipo: string, from: string, to: string) => {
    setStoricoLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: LIMIT };
      if (tipo) params.tipo = tipo;
      if (from) params.from = from;
      if (to) params.to = to;
      const r = await axios.get(`${API_URL}/spare-parts/${partId}/movimenti`, { ...headers, params });
      setMovimenti(page === 1 ? r.data.items : (prev) => [...prev, ...r.data.items]);
      setStoricoTotal(r.data.total);
    } catch { msg('Errore caricamento storico.', 'error'); }
    finally { setStoricoLoading(false); }
  }, [headers]);


  const openStorico = (part: SparePart) => {
    setStoricoPart(part);
    setMovimenti([]);
    setStoricoPage(1);
    setStoricoFiltroTipo('');
    setStoricoFiltroFrom('');
    setStoricoFiltroTo('');
    loadMovimenti(part.id, 1, '', '', '');
  };


  useEffect(() => {
    if (storicoPart) {
      setMovimenti([]);
      setStoricoPage(1);
      loadMovimenti(storicoPart.id, 1, storicoFiltroTipo, storicoFiltroFrom, storicoFiltroTo);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storicoFiltroTipo, storicoFiltroFrom, storicoFiltroTo]);


  const caricaAltri = () => {
    if (!storicoPart) return;
    const nextPage = storicoPage + 1;
    setStoricoPage(nextPage);
    loadMovimenti(storicoPart.id, nextPage, storicoFiltroTipo, storicoFiltroFrom, storicoFiltroTo);
  };


  const haAltri = movimenti.length < storicoTotal;


  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Magazzino Ricambi</h1>
          <p className="text-sm text-slate-400">Giacenze, scorte minime e riordini.</p>
        </div>
        <Link
          to="/ordini"
          className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800 transition"
        >
          Ordini interni
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


      {/* Sommario */}
      {countSottoScorta > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
            <span className="font-semibold text-amber-400">{countSottoScorta}</span>
            <span className="text-amber-200/70 ml-1">sotto scorta / giacenza negativa</span>
          </div>
          {countSenzaOrdine > 0 && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm">
              <span className="font-semibold text-rose-400">{countSenzaOrdine}</span>
              <span className="text-rose-200/70 ml-1">senza ordine aperto</span>
            </div>
          )}
        </div>
      )}


      {/* Filtri */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca per nome, codice..."
          className="rounded-2xl border border-slate-700 bg-slate-900/90 px-4 py-2.5 text-sm text-slate-100 outline-none w-64"
        />
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filterSottoScorta}
            onChange={(e) => setFilterSottoScorta(e.target.checked)}
            className="accent-amber-500 h-4 w-4 cursor-pointer"
          />
          <span className="text-sm text-slate-300">Solo sotto scorta ({countSottoScorta})</span>
        </label>
      </div>


      {/* Lista */}
      {loading ? (
        <p className="text-sm text-slate-500">Caricamento...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-slate-500 italic text-center py-8">Nessun ricambio trovato.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((part) => (
            <div
              key={part.id}
              className={`rounded-3xl border ${
                part.giacenza_negativa
                  ? 'border-rose-700/40 bg-rose-900/10'
                  : part.sotto_scorta
                  ? 'border-amber-500/40 bg-amber-500/5'
                  : 'border-slate-800 bg-slate-950/80'
              } p-4 sm:p-5`}
            >
              {/* ── VIEW MODE ── */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-100">{part.name}</span>
                    {part.codice && <span className="text-xs text-slate-500 font-mono">{part.codice}</span>}
                    <BadgeGiacenza part={part} />
                    {part.ordine_aperto && (
                      <Link to={`/ordini`}
                        className="rounded-full bg-sky-500/15 px-3 py-1 text-xs font-bold text-sky-400 hover:bg-sky-500/30 transition">
                        Ordine aperto
                      </Link>
                    )}
                  </div>
                  {part.description && <p className="text-xs text-slate-500 mt-0.5">{part.description}</p>}
                  <div className="mt-2 flex flex-wrap gap-4 text-sm">
                    <span className="text-slate-300">
                      Giacenza: <strong className={
                        part.giacenza_negativa ? 'text-rose-400'
                        : part.sotto_scorta ? 'text-amber-400'
                        : 'text-emerald-400'
                      }>{part.quantita}</strong>
                    </span>
                    <span className="text-slate-500">Scorta min: {part.scorta_minima}</span>
                    <span className="text-slate-500">Qty riordino: {part.quantita_riordino}</span>
                    {part.usage_count > 0 && <span className="text-slate-600">Usato in {part.usage_count} casi</span>}
                  </div>
                  {part.tipologia && (
                    <div className="mt-1.5">
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">{part.tipologia}</span>
                    </div>
                  )}
                </div>


                {/* Azioni */}
                <div className="flex flex-wrap gap-2 shrink-0">
                  {isWarehouse && (
                    <>
                      <button type="button" onClick={() => openRettifica(part)}
                        className="rounded-2xl bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700 transition">
                        Rettifica ±
                      </button>
                      {(part.sotto_scorta || part.giacenza_negativa) && !part.ordine_aperto && (
                        <button type="button" onClick={() => openCreaOrdine(part)}
                          className="rounded-2xl bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition">
                          Crea ordine
                        </button>
                      )}
                    </>
                  )}
                  <button type="button" onClick={() => openStorico(part)}
                    className="rounded-2xl bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700 transition">
                    Storico
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}


      {/* ──────────────────────────────────────────────────────────────────────────
          MODAL RETTIFICA ±
      ────────────────────────────────────────────────────────────────────────── */}
      {rettificaId && rettificaPart && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl">
            <div className="p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-100">Rettifica giacenza</h2>
                <button type="button" onClick={() => setRettificaId(null)} className="text-slate-500 hover:text-slate-200 text-2xl leading-none">×</button>
              </div>
              <p className="text-sm text-slate-400">
                <span className="font-medium text-slate-200">{rettificaPart.name}</span>
                {rettificaPart.codice && <span className="ml-2 font-mono text-xs text-slate-500">{rettificaPart.codice}</span>}
              </p>


              {/* Delta stepper */}
              <div>
                <label className="text-xs text-slate-400 block mb-2">Variazione quantità</label>
                <div className="flex items-center gap-3">
                  <button type="button"
                    onClick={() => setRettificaForm((f) => ({ ...f, delta: String((parseInt(f.delta) || 0) - 1) }))}
                    className="rounded-xl bg-rose-500/20 border border-rose-500/30 px-4 py-2 text-lg font-bold text-rose-300 hover:bg-rose-500/30 transition w-12 flex items-center justify-center">
                    −
                  </button>
                  <input
                    type="number"
                    value={rettificaForm.delta}
                    onChange={(e) => setRettificaForm((f) => ({ ...f, delta: e.target.value }))}
                    className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-center text-lg font-bold text-slate-100 outline-none"
                  />
                  <button type="button"
                    onClick={() => setRettificaForm((f) => ({ ...f, delta: String((parseInt(f.delta) || 0) + 1) }))}
                    className="rounded-xl bg-emerald-500/20 border border-emerald-500/30 px-4 py-2 text-lg font-bold text-emerald-300 hover:bg-emerald-500/30 transition w-12 flex items-center justify-center">
                    +
                  </button>
                </div>
              </div>


              {/* Anteprima */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm">
                <span className="text-slate-400">Giacenza attuale: </span>
                <span className="font-semibold text-slate-100">{rettificaPart.quantita}</span>
                <span className="text-slate-400"> → Nuova giacenza: </span>
                <span className={`font-semibold ${
                  rettificaNuovaGiacenza < 0 ? 'text-rose-400' :
                  rettificaNuovaGiacenza <= rettificaPart.scorta_minima ? 'text-amber-400' :
                  'text-emerald-400'
                }`}>{rettificaNuovaGiacenza}</span>
                {rettificaNuovaGiacenza < 0 && (
                  <p className="mt-1 text-xs text-rose-400">⚠ La giacenza diventerà negativa</p>
                )}
              </div>


              {/* Nota obbligatoria */}
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Nota <span className="text-rose-500">*</span>
                </label>
                <input
                  value={rettificaForm.note}
                  onChange={(e) => setRettificaForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="es. Inventario fisico, Errore di registrazione..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600"
                />
              </div>


              <div className="flex gap-2 pt-1">
                <button type="button" onClick={submitRettifica} disabled={rettificaSaving || rettificaDelta === 0 || !rettificaForm.note.trim()}
                  className="rounded-2xl bg-sky-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50 transition flex-1">
                  {rettificaSaving ? 'Salvataggio...' : 'Salva rettifica'}
                </button>
                <button type="button" onClick={() => setRettificaId(null)}
                  className="rounded-2xl border border-slate-700 bg-slate-900 px-5 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800 transition">
                  Annulla
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* ──────────────────────────────────────────────────────────────────────────
          MODAL CREA ORDINE
      ────────────────────────────────────────────────────────────────────────── */}
      {ordinePartId && ordinePart && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl">
            <div className="p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-100">Crea ordine interno</h2>
                <button type="button" onClick={() => setOrdinePartId(null)} className="text-slate-500 hover:text-slate-200 text-2xl leading-none">×</button>
              </div>


              {/* Riepilogo articolo */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-100">{ordinePart.name}</span>
                  {ordinePart.codice && <span className="font-mono text-xs text-slate-500">{ordinePart.codice}</span>}
                </div>
                <div className="text-slate-400">
                  Giacenza attuale: <span className={`font-semibold ${
                    ordinePart.giacenza_negativa ? 'text-rose-400' : 'text-amber-400'
                  }`}>{ordinePart.quantita}</span>
                </div>
              </div>


              {/* Quantità */}
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Quantità da ordinare <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number" min={1}
                  value={ordineForm.quantita_ordinata}
                  onChange={(e) => setOrdineForm((f) => ({ ...f, quantita_ordinata: e.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none"
                />
                <p className="text-xs text-slate-600 mt-1">Pre-compilato con la quantità di riordino: {ordinePart.quantita_riordino}</p>
              </div>


              {/* Note ordine */}
              <div>
                <label className="text-xs text-slate-400 block mb-1">Note (opzionale)</label>
                <input
                  value={ordineForm.note}
                  onChange={(e) => setOrdineForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="Note per il fornitore..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600"
                />
              </div>


              <div className="flex gap-2 pt-1">
                <button type="button" onClick={submitCreaOrdine} disabled={ordineSaving}
                  className="rounded-2xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50 transition flex-1">
                  {ordineSaving ? 'Creazione...' : '📄 Crea ordine e scarica PDF'}
                </button>
                <button type="button" onClick={() => setOrdinePartId(null)}
                  className="rounded-2xl border border-slate-700 bg-slate-900 px-5 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800 transition">
                  Annulla
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* ──────────────────────────────────────────────────────────────────────────
          DRAWER STORICO MOVIMENTI
      ────────────────────────────────────────────────────────────────────────── */}
      {storicoPart && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={() => setStoricoPart(null)} />
          {/* Drawer */}
          <div className="relative z-10 w-full max-w-2xl bg-slate-950 border-l border-slate-800 shadow-2xl flex flex-col max-h-screen overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-base font-semibold text-slate-100">Storico movimenti</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {storicoPart.name}{storicoPart.codice ? ` · ${storicoPart.codice}` : ''}
                </p>
              </div>
              <button type="button" onClick={() => setStoricoPart(null)} className="text-slate-500 hover:text-slate-200 text-2xl leading-none">×</button>
            </div>


            {/* Filtri */}
            <div className="px-5 py-3 border-b border-slate-800 flex flex-wrap gap-2 shrink-0">
              <select
                value={storicoFiltroTipo}
                onChange={(e) => setStoricoFiltroTipo(e.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 outline-none"
              >
                <option value="">Tutti i tipi</option>
                <option value="scarico_manutenzione">Scarico utilizzo</option>
                <option value="versamento_riordine">Versamento riordine</option>
                <option value="rettifica_manuale">Rettifica manuale</option>
              </select>
              <input
                type="date"
                value={storicoFiltroFrom}
                onChange={(e) => setStoricoFiltroFrom(e.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 outline-none"
                title="Da data"
              />
              <input
                type="date"
                value={storicoFiltroTo}
                onChange={(e) => setStoricoFiltroTo(e.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 outline-none"
                title="A data"
              />
            </div>


            {/* Tabella movimenti */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
              {storicoLoading && movimenti.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">Caricamento...</p>
              ) : movimenti.length === 0 ? (
                <p className="text-sm text-slate-500 italic text-center py-8">Nessun movimento trovato.</p>
              ) : (
                movimenti.map((m) => (
                  <div key={m.id} className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={`font-semibold ${TIPO_COLOR[m.tipo] ?? 'text-slate-300'}`}>
                        {TIPO_LABEL[m.tipo] ?? m.tipo}
                      </span>
                      <span className={`font-mono font-bold text-base ${
                        m.delta > 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}>
                        {m.delta > 0 ? `+${m.delta}` : m.delta}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                      <span>Giacenza dopo: <span className="text-slate-300 font-medium">{m.quantita_dopo}</span></span>
                      {m.actor_username && <span>Operatore: <span className="text-slate-300">{m.actor_username}</span></span>}
                      {m.riferimento_tipo && m.riferimento_tipo !== 'manuale' && (
                        <span>
                          {m.riferimento_tipo === 'reorder'
                            ? `Ordine #${m.riferimento_label ?? m.riferimento_numero ?? m.riferimento_id?.slice(0, 8)}`
                            : (
                              <span
                                className="text-sky-400 cursor-pointer hover:underline"
                                onClick={() => {
                                  const target = m.riferimento_numero ?? m.riferimento_id?.slice(0, 8);
                                  if (target) window.location.href = `/#caso-${target}`;
                                }}
                              >
                                Caso #{m.riferimento_label ?? m.riferimento_numero ?? m.riferimento_id?.slice(0, 8)}
                              </span>
                            )
                          }
                        </span>
                      )}
                      <span>{new Date(m.created_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {m.note && <p className="mt-1.5 text-xs text-slate-400 italic">{m.note}</p>}
                  </div>
                ))
              )}


              {haAltri && (
                <button
                  type="button"
                  onClick={caricaAltri}
                  disabled={storicoLoading}
                  className="w-full mt-2 rounded-2xl border border-slate-700 bg-slate-900 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50 transition"
                >
                  {storicoLoading ? 'Caricamento...' : `Carica altri (${storicoTotal - movimenti.length} rimanenti)`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
