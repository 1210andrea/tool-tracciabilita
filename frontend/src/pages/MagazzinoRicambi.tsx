import React, { useEffect, useState, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

type SparePart = {
  id: string;
  name: string;
  codice?: string;
  tipologia?: string;
  quantita: number;
  scorta_minima: number;
  quantita_riordino: number;
  giacenza_negativa: boolean;
  sotto_scorta: boolean;
  ordine_aperto: boolean;
};

type Movimento = {
  id: string;
  tipo: 'scarico_manutenzione' | 'versamento_riordine' | 'rettifica_manuale';
  delta: number;
  quantita_dopo: number;
  riferimento_tipo?: string;
  riferimento_numero?: string;
  actor_username?: string;
  note?: string;
  created_at: string;
};

const TIPO_LABEL: Record<string, { label: string; color: string }> = {
  scarico_manutenzione: { label: 'Scarico manutenzione', color: '#e53e3e' },
  versamento_riordine: { label: 'Versamento riordine', color: '#38a169' },
  rettifica_manuale: { label: 'Rettifica manuale', color: '#dd6b20' },
};

function GiacenzaBadge({ part }: { part: SparePart }) {
  if (part.giacenza_negativa)
    return <span className="badge badge-rosso">⚠ {part.quantita} Giacenza negativa</span>;
  if (part.sotto_scorta)
    return <span className="badge badge-giallo">⚠ {part.quantita} Sotto scorta</span>;
  return <span className="badge badge-verde">✓ {part.quantita} OK</span>;
}

export default function MagazzinoRicambi() {
  const [parts, setParts] = useState<SparePart[]>([]);
  const [loading, setLoading] = useState(true);

  // Drawer storico
  const [storPartId, setStorPartId] = useState<string | null>(null);
  const [movimenti, setMovimenti] = useState<Movimento[]>([]);
  const [movPage, setMovPage] = useState(1);
  const [movTotal, setMovTotal] = useState(0);
  const [movLoading, setMovLoading] = useState(false);
  const [storPart, setStorPart] = useState<SparePart | null>(null);

  // Modal rettifica
  const [rettPart, setRettPart] = useState<SparePart | null>(null);
  const [rettDelta, setRettDelta] = useState(0);
  const [rettNote, setRettNote] = useState('');
  const [rettSaving, setRettSaving] = useState(false);

  // Modal modifica
  const [editPart, setEditPart] = useState<SparePart | null>(null);
  const [editForm, setEditForm] = useState({ codice: '', tipologia: '', scorta_minima: 1, quantita_riordino: 10 });
  const [editSaving, setEditSaving] = useState(false);

  // Modal crea ordine
  const [orderPart, setOrderPart] = useState<SparePart | null>(null);
  const [orderQta, setOrderQta] = useState(0);
  const [orderNote, setOrderNote] = useState('');
  const [orderSaving, setOrderSaving] = useState(false);

  const fetchParts = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/spare-parts');
      setParts(r.data.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchParts(); }, [fetchParts]);

  const openStorico = async (part: SparePart) => {
    setStorPart(part);
    setStorPartId(part.id);
    setMovPage(1);
    setMovimenti([]);
    await loadMovimenti(part.id, 1);
  };

  const loadMovimenti = async (id: string, page: number) => {
    setMovLoading(true);
    try {
      const r = await api.get(`/spare-parts/${id}/movimenti`, { params: { page, limit: 20 } });
      if (page === 1) setMovimenti(r.data.items);
      else setMovimenti((prev) => [...prev, ...r.data.items]);
      setMovTotal(r.data.total);
    } finally {
      setMovLoading(false);
    }
  };

  const openRett = (part: SparePart) => { setRettPart(part); setRettDelta(0); setRettNote(''); };
  const saveRett = async () => {
    if (!rettPart) return;
    if (!rettNote.trim()) { alert('La nota è obbligatoria'); return; }
    if (rettDelta === 0) { alert('Il delta non può essere 0'); return; }
    setRettSaving(true);
    try {
      await api.patch(`/spare-parts/${rettPart.id}/rettifica`, { delta: rettDelta, note: rettNote });
      setRettPart(null);
      fetchParts();
    } finally {
      setRettSaving(false);
    }
  };

  const openEdit = (part: SparePart) => {
    setEditPart(part);
    setEditForm({ codice: part.codice ?? '', tipologia: part.tipologia ?? '', scorta_minima: part.scorta_minima, quantita_riordino: part.quantita_riordino });
  };
  const saveEdit = async () => {
    if (!editPart) return;
    setEditSaving(true);
    try {
      await api.patch(`/spare-parts/${editPart.id}`, editForm);
      setEditPart(null);
      fetchParts();
    } finally {
      setEditSaving(false);
    }
  };

  const openOrder = (part: SparePart) => { setOrderPart(part); setOrderQta(part.quantita_riordino); setOrderNote(''); };
  const saveOrder = async () => {
    if (!orderPart) return;
    setOrderSaving(true);
    try {
      const response = await api.post('/reorders', {
        spare_part_id: orderPart.id,
        quantita_ordinata: orderQta,
        note: orderNote || undefined,
      }, { responseType: 'blob' });

      // Scarica PDF automaticamente
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `ordine.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setOrderPart(null);
      fetchParts();
    } catch (err: any) {
      if (err?.response?.status === 409) alert('Esiste già un ordine aperto per questo articolo.');
      else alert('Errore durante la creazione dell’ordine.');
    } finally {
      setOrderSaving(false);
    }
  };

  const nuovaGiacenza = rettPart ? rettPart.quantita + rettDelta : 0;

  return (
    <div className="magazzino-page">
      <h1>Ricambi</h1>

      {loading ? <p>Caricamento...</p> : (
        <table className="table">
          <thead>
            <tr>
              <th>Codice</th><th>Descrizione</th><th>Tipologia</th>
              <th>Giacenza</th><th>Scorta Min.</th><th>Q.tà Riordino</th><th>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {parts.map((p) => (
              <tr key={p.id}>
                <td>{p.codice ?? <em>N/D</em>}</td>
                <td>{p.name}</td>
                <td>{p.tipologia ?? <em>N/D</em>}</td>
                <td><GiacenzaBadge part={p} /></td>
                <td>{p.scorta_minima}</td>
                <td>{p.quantita_riordino}</td>
                <td className="azioni">
                  <button onClick={() => openEdit(p)}>Modifica</button>
                  <button onClick={() => openRett(p)}>Rettifica ±</button>
                  {(p.sotto_scorta || p.giacenza_negativa) && !p.ordine_aperto && (
                    <button className="btn-primary" onClick={() => openOrder(p)}>Crea ordine</button>
                  )}
                  {p.ordine_aperto && (
                    <a href="#/magazzino/ordini" className="chip-ordine-aperto">Ordine aperto →</a>
                  )}
                  <button onClick={() => openStorico(p)}>Storico</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* MODAL MODIFICA */}
      {editPart && (
        <div className="modal-overlay" onClick={() => setEditPart(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Modifica: {editPart.name}</h2>
            <label>Codice<input value={editForm.codice} onChange={(e) => setEditForm({ ...editForm, codice: e.target.value })} /></label>
            <label>Tipologia<input value={editForm.tipologia} onChange={(e) => setEditForm({ ...editForm, tipologia: e.target.value })} /></label>
            <label>Scorta minima<input type="number" value={editForm.scorta_minima} onChange={(e) => setEditForm({ ...editForm, scorta_minima: Number(e.target.value) })} /></label>
            <label>Q.tà riordino<input type="number" value={editForm.quantita_riordino} onChange={(e) => setEditForm({ ...editForm, quantita_riordino: Number(e.target.value) })} /></label>
            <div className="modal-actions">
              <button onClick={() => setEditPart(null)}>Annulla</button>
              <button className="btn-primary" disabled={editSaving} onClick={saveEdit}>{editSaving ? 'Salvo...' : 'Salva'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL RETTIFICA */}
      {rettPart && (
        <div className="modal-overlay" onClick={() => setRettPart(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Rettifica giacenza: {rettPart.name}</h2>
            <div className="rettifica-controls">
              <button onClick={() => setRettDelta((d) => d - 1)}>-</button>
              <input type="number" value={rettDelta} onChange={(e) => setRettDelta(Number(e.target.value))} />
              <button onClick={() => setRettDelta((d) => d + 1)}>+</button>
            </div>
            <p>Giacenza attuale: <strong>{rettPart.quantita}</strong> → Nuova giacenza: <strong>{nuovaGiacenza}</strong></p>
            {nuovaGiacenza < 0 && <p className="avviso-rosso">⚠ La giacenza diventerà negativa</p>}
            <label>Nota (obbligatoria)
              <input
                placeholder="es. Inventario fisico, Errore di registrazione..."
                value={rettNote}
                onChange={(e) => setRettNote(e.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button onClick={() => setRettPart(null)}>Annulla</button>
              <button className="btn-primary" disabled={rettSaving} onClick={saveRett}>{rettSaving ? 'Salvo...' : 'Salva'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CREA ORDINE */}
      {orderPart && (
        <div className="modal-overlay" onClick={() => setOrderPart(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Crea ordine: {orderPart.name}</h2>
            <p>Codice: <strong>{orderPart.codice ?? 'N/D'}</strong> | Giacenza attuale: <strong>{orderPart.quantita}</strong></p>
            <label>Q.tà da ordinare
              <input type="number" min={1} value={orderQta} onChange={(e) => setOrderQta(Number(e.target.value))} />
            </label>
            <label>Note (opzionali)
              <input value={orderNote} onChange={(e) => setOrderNote(e.target.value)} />
            </label>
            <div className="modal-actions">
              <button onClick={() => setOrderPart(null)}>Annulla</button>
              <button className="btn-primary" disabled={orderSaving} onClick={saveOrder}>
                {orderSaving ? 'Creazione...' : 'Crea ordine e scarica PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER STORICO */}
      {storPartId && storPart && (
        <div className="drawer-overlay" onClick={() => { setStorPartId(null); setStorPart(null); setMovimenti([]); }}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h2>Storico: {storPart.name} {storPart.codice ? `(${storPart.codice})` : ''}</h2>
              <button onClick={() => { setStorPartId(null); setStorPart(null); setMovimenti([]); }}>×</button>
            </div>
            {movLoading && movimenti.length === 0 ? <p>Caricamento...</p> : (
              <table className="table">
                <thead>
                  <tr><th>Data/Ora</th><th>Tipo</th><th>Variazione</th><th>Giacenza dopo</th><th>Riferimento</th><th>Operatore</th><th>Note</th></tr>
                </thead>
                <tbody>
                  {movimenti.map((m) => (
                    <tr key={m.id}>
                      <td>{new Date(m.created_at).toLocaleString('it-IT')}</td>
                      <td style={{ color: TIPO_LABEL[m.tipo]?.color }}>{TIPO_LABEL[m.tipo]?.label ?? m.tipo}</td>
                      <td>{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
                      <td>{m.quantita_dopo}</td>
                      <td>
                        {m.riferimento_tipo === 'case' && m.riferimento_numero && <span>Caso #{m.riferimento_numero}</span>}
                        {m.riferimento_tipo === 'reorder' && m.riferimento_numero && <span>Ordine #{m.riferimento_numero}</span>}
                        {m.riferimento_tipo === 'manuale' && <span>—</span>}
                      </td>
                      <td>{m.actor_username ?? '—'}</td>
                      <td>{m.note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {movimenti.length < movTotal && (
              <button
                onClick={async () => {
                  const nextPage = movPage + 1;
                  setMovPage(nextPage);
                  await loadMovimenti(storPartId, nextPage);
                }}
                disabled={movLoading}
              >
                {movLoading ? 'Caricamento...' : 'Carica altri'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
