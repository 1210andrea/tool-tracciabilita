import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Link } from 'react-router-dom';

const API_URL = '/api';

type SparePart = {
  id: string;
  name: string;
  codice?: string;
  description?: string;
  tipologie: string[];
  quantita: number;
  scorta_minima: number;
  qty_riordino: number;
  sotto_scorta: boolean;
  usage_count: number;
};

function BadgeGiacenza({ part }: { part: SparePart }) {
  if (part.quantita === 0)
    return <span className="rounded-full bg-rose-500/15 px-3 py-1 text-xs font-bold text-rose-400">Esaurito</span>;
  if (part.sotto_scorta)
    return <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-400">Sotto scorta</span>;
  return <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-400">OK</span>;
}

type EditForm = {
  codice: string;
  quantita: string;
  scorta_minima: string;
  qty_riordino: string;
};

export default function Magazzino() {
  const { token } = useAuth();
  const headers = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);

  const [parts, setParts] = useState<SparePart[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterSottoScorta, setFilterSottoScorta] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ codice: '', quantita: '', scorta_minima: '', qty_riordino: '' });
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/spare-parts`, headers);
      setParts(r.data.items ?? []);
    } catch { setMessage('Errore caricamento ricambi.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [token]);

  const filtered = useMemo(() => {
    let list = parts;
    if (filterSottoScorta) list = list.filter((p) => p.sotto_scorta || p.quantita === 0);
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

  const countSottoScorta = parts.filter((p) => p.sotto_scorta || p.quantita === 0).length;

  const startEdit = (part: SparePart) => {
    setEditingId(part.id);
    setEditForm({
      codice: part.codice ?? '',
      quantita: String(part.quantita),
      scorta_minima: String(part.scorta_minima),
      qty_riordino: String(part.qty_riordino),
    });
  };
  const cancelEdit = () => { setEditingId(null); };

  const submitEdit = async (part: SparePart) => {
    try {
      await axios.put(`${API_URL}/spare-parts/${part.id}`, {
        codice: editForm.codice.trim() || null,
        quantita: parseInt(editForm.quantita) || 0,
        scorta_minima: parseInt(editForm.scorta_minima) || 1,
        qty_riordino: parseInt(editForm.qty_riordino) || 10,
      }, headers);
      setMessage('Ricambio aggiornato.');
      setEditingId(null);
      load();
    } catch (err: any) { setMessage(err?.response?.data?.error ?? 'Errore aggiornamento.'); }
  };

  const generateOrder = async () => {
    if (countSottoScorta === 0) { setMessage('Nessun pezzo sotto scorta.'); return; }
    setGenerating(true);
    try {
      const r = await axios.post(`${API_URL}/reorders/generate`, {}, headers);
      if (r.data.item) {
        setMessage(`Ordine N°${r.data.item.numero_ordine} generato con ${r.data.parts_count} righe.`);
      } else {
        setMessage(r.data.message ?? 'Nessun pezzo sotto scorta.');
      }
    } catch (err: any) { setMessage(err?.response?.data?.error ?? 'Errore generazione ordine.'); }
    finally { setGenerating(false); }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Magazzino Ricambi</h1>
          <p className="text-sm text-slate-400">Giacenze, scorte minime e riordini.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/ordini"
            className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800 transition"
          >
            Ordini di riordino
          </Link>
          {countSottoScorta > 0 && (
            <button
              type="button"
              onClick={generateOrder}
              disabled={generating}
              className="rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50 transition"
            >
              {generating ? 'Generazione...' : `Genera ordine (${countSottoScorta} sotto scorta)`}
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
          {message}
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

      {/* Tabella */}
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
                part.quantita === 0
                  ? 'border-rose-500/40 bg-rose-500/5'
                  : part.sotto_scorta
                  ? 'border-amber-500/40 bg-amber-500/5'
                  : 'border-slate-800 bg-slate-950/80'
              } p-4 sm:p-5`}
            >
              {editingId === part.id ? (
                /* ── EDIT MODE ── */
                <div className="space-y-3">
                  <p className="font-semibold text-slate-100">{part.name}</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <label className="text-xs text-slate-400">Codice</label>
                      <input
                        value={editForm.codice}
                        onChange={(e) => setEditForm((c) => ({ ...c, codice: e.target.value }))}
                        placeholder="SP-001"
                        className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400">Giacenza</label>
                      <input
                        type="number" min={0}
                        value={editForm.quantita}
                        onChange={(e) => setEditForm((c) => ({ ...c, quantita: e.target.value }))}
                        className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400">Scorta minima</label>
                      <input
                        type="number" min={0}
                        value={editForm.scorta_minima}
                        onChange={(e) => setEditForm((c) => ({ ...c, scorta_minima: e.target.value }))}
                        className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400">Qty riordino</label>
                      <input
                        type="number" min={1}
                        value={editForm.qty_riordino}
                        onChange={(e) => setEditForm((c) => ({ ...c, qty_riordino: e.target.value }))}
                        className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => submitEdit(part)}
                      className="rounded-2xl bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400 transition"
                    >
                      Salva
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 transition"
                    >
                      Annulla
                    </button>
                  </div>
                </div>
              ) : (
                /* ── VIEW MODE ── */
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-100">{part.name}</span>
                      {part.codice && <span className="text-xs text-slate-500 font-mono">{part.codice}</span>}
                      <BadgeGiacenza part={part} />
                    </div>
                    {part.description && <p className="text-xs text-slate-500 mt-0.5">{part.description}</p>}
                    <div className="mt-2 flex flex-wrap gap-4 text-sm">
                      <span className="text-slate-300">
                        Giacenza: <strong className={part.sotto_scorta ? 'text-amber-400' : 'text-emerald-400'}>{part.quantita}</strong>
                      </span>
                      <span className="text-slate-500">Scorta min: {part.scorta_minima}</span>
                      <span className="text-slate-500">Qty riordino: {part.qty_riordino}</span>
                    </div>
                    {part.tipologie.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {part.tipologie.map((t) => (
                          <span key={t} className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => startEdit(part)}
                    className="rounded-2xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 transition shrink-0"
                  >
                    Modifica
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
