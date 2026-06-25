import React, { useEffect, useState, useCallback } from 'react';
import api from '../services/api';

type Reorder = {
  id: string;
  numero_ordine: number;
  spare_part_id: string;
  spare_part_name: string;
  spare_part_codice?: string;
  quantita_ordinata: number;
  quantita_ricevuta: number;
  status: 'in_lavorazione' | 'partial' | 'completed' | 'cancelled';
  created_at: string;
  note?: string;
};

const STATUS_CHIP: Record<string, { label: string; color: string }> = {
  in_lavorazione: { label: 'IN LAVORAZIONE', color: '#3182ce' },
  partial: { label: 'PARZIALE', color: '#dd6b20' },
  completed: { label: 'COMPLETATO', color: '#38a169' },
  cancelled: { label: 'ANNULLATO', color: '#e53e3e' },
};

export default function OrdiniInterni() {
  const [orders, setOrders] = useState<Reorder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('');

  // Modal versamento
  const [versOrder, setVersOrder] = useState<Reorder | null>(null);
  const [versQta, setVersQta] = useState(1);
  const [versSaving, setVersSaving] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/reorders', { params: filterStatus ? { status: filterStatus } : {} });
      setOrders(r.data.items);
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const downloadPdf = async (order: Reorder) => {
    const r = await api.get(`/reorders/${order.id}/pdf`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `ordine-${order.numero_ordine}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const openVers = (order: Reorder) => { setVersOrder(order); setVersQta(1); };
  const saveVers = async () => {
    if (!versOrder) return;
    setVersSaving(true);
    try {
      const r = await api.patch(`/reorders/${versOrder.id}/versamento`, { quantita_versata: versQta });
      if (r.data.item?.status === 'completed') {
        alert('✓ Ordine completato e chiuso automaticamente');
      }
      setVersOrder(null);
      fetchOrders();
    } finally {
      setVersSaving(false);
    }
  };

  const cancelOrder = async (order: Reorder) => {
    if (!window.confirm('Sei sicuro? L’ordine verrà annullato.')) return;
    await api.patch(`/reorders/${order.id}/cancel`);
    fetchOrders();
  };

  return (
    <div className="ordini-page">
      <h1>Ordini Interni</h1>

      <div className="filtri">
        <label>Filtra per stato:
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">Tutti</option>
            <option value="in_lavorazione">In lavorazione</option>
            <option value="partial">Parziale</option>
            <option value="completed">Completato</option>
            <option value="cancelled">Annullato</option>
          </select>
        </label>
      </div>

      {loading ? <p>Caricamento...</p> : (
        <table className="table">
          <thead>
            <tr>
              <th>N° Ordine</th><th>Codice</th><th>Descrizione</th>
              <th>Q.tà ordinata</th><th>Q.tà ricevuta</th><th>Stato</th><th>Data</th><th>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>#{o.numero_ordine}</td>
                <td>{o.spare_part_codice ?? 'N/D'}</td>
                <td>{o.spare_part_name}</td>
                <td>{o.quantita_ordinata}</td>
                <td>{o.quantita_ricevuta}</td>
                <td>
                  <span className="chip" style={{ background: STATUS_CHIP[o.status]?.color, color: '#fff' }}>
                    {STATUS_CHIP[o.status]?.label ?? o.status}
                  </span>
                </td>
                <td>{new Date(o.created_at).toLocaleDateString('it-IT')}</td>
                <td className="azioni">
                  <button onClick={() => downloadPdf(o)}>Scarica PDF</button>
                  {['in_lavorazione', 'partial'].includes(o.status) && (
                    <button className="btn-primary" onClick={() => openVers(o)}>Registra versamento</button>
                  )}
                  {o.status === 'in_lavorazione' && o.quantita_ricevuta === 0 && (
                    <button className="btn-danger" onClick={() => cancelOrder(o)}>Annulla ordine</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* MODAL VERSAMENTO */}
      {versOrder && (
        <div className="modal-overlay" onClick={() => setVersOrder(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Registra versamento</h2>
            <p>{versOrder.spare_part_codice} — {versOrder.spare_part_name}</p>
            <p>Ordinato: <strong>{versOrder.quantita_ordinata}</strong> | Già ricevuto: <strong>{versOrder.quantita_ricevuta}</strong></p>
            <label>Q.tà versata
              <input type="number" min={1} value={versQta} onChange={(e) => setVersQta(Number(e.target.value))} />
            </label>
            <p className="anteprima">
              Dopo il versamento: <strong>{versOrder.quantita_ricevuta + versQta}</strong> / {versOrder.quantita_ordinata}
              {versOrder.quantita_ricevuta + versQta >= versOrder.quantita_ordinata && <span className="verde"> (ordine si chiuderà ✓)</span>}
              {versOrder.quantita_ricevuta + versQta > versOrder.quantita_ordinata && <span className="verde"> (eccedenza: +{versOrder.quantita_ricevuta + versQta - versOrder.quantita_ordinata} pezzi in giacenza)</span>}
            </p>
            <div className="modal-actions">
              <button onClick={() => setVersOrder(null)}>Annulla</button>
              <button className="btn-primary" disabled={versSaving} onClick={saveVers}>{versSaving ? 'Salvo...' : 'Salva'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
