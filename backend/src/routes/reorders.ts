import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth';
import { pool } from '../db';
import PDFDocument from 'pdfkit';

export const reordersRoutes = Router();

const WAREHOUSE = ['admin', 'magazziniere'] as const;

const STATUS_LABEL: Record<string, string> = {
  pending:   'IN SOSPESO',
  partial:   'PARZIALMENTE RICEVUTO',
  completed: 'COMPLETATO',
  cancelled: 'ANNULLATO',
};

// ── PDF multi-riga ────────────────────────────────────────────────────────────
async function buildPdf(
  res: any,
  order: Record<string, any>,
  items: Record<string, any>[]
) {
  const doc    = new PDFDocument({ margin: 50, size: 'A4' });
  const GRAY   = '#6b7280';
  const BLACK  = '#111827';
  const ACCENT = '#0f766e';

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="ordine-${order.numero_ordine}.pdf"`
  );
  doc.pipe(res);

  // Intestazione
  doc.fontSize(20).fillColor(ACCENT).text('ORDINE DI RIORDINO', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(13).fillColor(BLACK).text(`N° ${order.numero_ordine}`, { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(9).fillColor(GRAY);
  doc.text(
    `Data: ${new Date(order.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })}`,
    { align: 'center' }
  );
  if (order.created_by_username)
    doc.text(`Creato da: ${order.created_by_username}`, { align: 'center' });

  doc.moveDown(0.3);
  doc.fontSize(10).fillColor(BLACK)
    .text('Stato: ', { continued: true })
    .fillColor(ACCENT)
    .text(STATUS_LABEL[order.status] ?? order.status);

  if (order.note) {
    doc.moveDown(0.2);
    doc.fontSize(9).fillColor(GRAY).text(`Note: ${order.note}`);
  }

  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(ACCENT).lineWidth(1).stroke();
  doc.moveDown(0.8);

  // Intestazione tabella
  const colX = [50, 130, 320, 410, 480];
  doc.fontSize(9).fillColor(GRAY);
  doc.text('Codice',    colX[0], doc.y, { width: 75 });
  const headerY = doc.y - doc.currentLineHeight();
  doc.text('Descrizione',   colX[1], headerY, { width: 185 });
  doc.text('Tipologia',     colX[2], headerY, { width: 85 });
  doc.text('Q.tà ord.',     colX[3], headerY, { width: 65 });
  doc.text('Q.tà ric.',     colX[4], headerY, { width: 65 });

  doc.moveDown(0.4);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
  doc.moveDown(0.4);

  // Righe
  for (const it of items) {
    const rowY = doc.y;
    doc.fontSize(9).fillColor(BLACK);
    doc.text(it.codice ?? '—',            colX[0], rowY, { width: 75 });
    doc.text(it.spare_part_name ?? '—',   colX[1], rowY, { width: 185 });
    doc.text(it.tipologia ?? '—',         colX[2], rowY, { width: 85 });
    doc.text(String(it.quantita_ordinata), colX[3], rowY, { width: 65 });
    doc.text(String(it.quantita_ricevuta), colX[4], rowY, { width: 65 });
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#f3f4f6').lineWidth(0.3).stroke();
    doc.moveDown(0.3);
  }

  // Totali
  const totOrd = items.reduce((s, i) => s + (i.quantita_ordinata ?? 0), 0);
  const totRic = items.reduce((s, i) => s + (i.quantita_ricevuta ?? 0), 0);
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(ACCENT).lineWidth(0.5).stroke();
  doc.moveDown(0.4);
  doc.fontSize(9).fillColor(GRAY)
    .text(`Totale righe: ${items.length}   Totale ordinato: ${totOrd} pz   Totale ricevuto: ${totRic} pz`,
      { align: 'right' });

  // Footer
  doc.moveDown(1.5);
  doc.fontSize(8).fillColor(GRAY)
    .text(`Documento generato il ${new Date().toLocaleString('it-IT')}`, { align: 'right' });

  doc.end();
}

// ── GET /api/reorders ─────────────────────────────────────────────────────────
reordersRoutes.get('/', authMiddleware, requireRole(...WAREHOUSE), async (req, res, next) => {
  try {
    const { status } = req.query as Record<string, string>;
    const page  = Math.max(1, parseInt((req.query.page  as string) || '1'));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '20')));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (status) { conditions.push(`r.status = $${idx++}`); params.push(status); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countR = await pool.query(
      `SELECT COUNT(*)::int AS total FROM reorders r ${where}`, params
    );
    const total = countR.rows[0].total;

    const r = await pool.query(
      `SELECT r.id, r.numero_ordine, r.status, r.note, r.created_at,
              u.username AS created_by_username,
              COALESCE(SUM(i.quantita_ordinata),0)::int  AS total_qty_ordinata,
              COALESCE(SUM(i.quantita_ricevuta),0)::int  AS total_qty_ricevuta,
              COUNT(i.id)::int                            AS total_items
       FROM reorders r
       LEFT JOIN users        u ON u.id = r.created_by
       LEFT JOIN reorder_items i ON i.reorder_id = r.id
       ${where}
       GROUP BY r.id, u.username
       ORDER BY r.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    res.json({ items: r.rows, total, page, pages: Math.ceil(total / limit) });
  } catch (e) { next(e); }
});

// ── POST /api/reorders/generate ───────────────────────────────────────────────
// Genera ordine multi-riga da tutti i ricambi sotto scorta senza ordine aperto
reordersRoutes.post('/generate', authMiddleware, requireRole(...WAREHOUSE), async (req, res, next) => {
  try {
    // Ricambi sotto scorta senza ordine aperto
    const partsR = await pool.query(
      `SELECT sp.id, sp.name, sp.codice, sp.tipologia,
              sp.quantita, sp.scorta_minima,
              COALESCE(sp.quantita_riordino, 10) AS quantita_riordino
       FROM spare_parts sp
       WHERE sp.quantita <= sp.scorta_minima
         AND NOT EXISTS (
           SELECT 1 FROM reorders r
           JOIN reorder_items ri ON ri.reorder_id = r.id
           WHERE ri.spare_part_id = sp.id
             AND r.status IN ('pending','partial')
         )
       ORDER BY sp.name ASC`
    );

    if (!partsR.rows.length) {
      return res.json({ message: 'Nessun ricambio sotto scorta senza ordine aperto.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Crea header ordine
      const ordR = await client.query(
        `INSERT INTO reorders(status, note, created_by)
         VALUES('pending', $1, $2)
         RETURNING *`,
        [req.body.note?.trim() ?? null, req.user!.id]
      );
      const order = ordR.rows[0];

      // Crea righe
      const itemRows: any[] = [];
      for (const sp of partsR.rows) {
        const qty = Math.max(1, sp.quantita_riordino - sp.quantita);
        const iR = await client.query(
          `INSERT INTO reorder_items(reorder_id, spare_part_id, quantita_ordinata)
           VALUES($1, $2, $3)
           RETURNING *`,
          [order.id, sp.id, qty]
        );
        itemRows.push({
          ...iR.rows[0],
          spare_part_name: sp.name,
          codice: sp.codice,
          tipologia: sp.tipologia,
        });
      }

      await client.query('COMMIT');

      // Recupera username
      const userR = await pool.query('SELECT username FROM users WHERE id = $1', [req.user!.id]);
      order.created_by_username = userR.rows[0]?.username ?? '';

      // Restituisce PDF
      await buildPdf(res, order, itemRows);
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  } catch (e) { next(e); }
});

// ── GET /api/reorders/:id ─────────────────────────────────────────────────────
reordersRoutes.get('/:id', authMiddleware, requireRole(...WAREHOUSE), async (req, res, next) => {
  try {
    const rHead = await pool.query(
      `SELECT r.*, u.username AS created_by_username,
              COALESCE(SUM(i.quantita_ordinata),0)::int AS total_qty_ordinata,
              COALESCE(SUM(i.quantita_ricevuta),0)::int AS total_qty_ricevuta,
              COUNT(i.id)::int                           AS total_items
       FROM reorders r
       LEFT JOIN users u          ON u.id = r.created_by
       LEFT JOIN reorder_items i  ON i.reorder_id = r.id
       WHERE r.id = $1
       GROUP BY r.id, u.username`,
      [req.params.id]
    );
    if (!rHead.rows.length) return res.status(404).json({ error: 'Ordine non trovato' });

    const rItems = await pool.query(
      `SELECT i.id, i.spare_part_id, i.quantita_ordinata, i.quantita_ricevuta, i.status,
              sp.name AS spare_part_name, sp.codice, sp.tipologia, sp.description AS spare_part_description
       FROM reorder_items i
       JOIN spare_parts sp ON sp.id = i.spare_part_id
       WHERE i.reorder_id = $1
       ORDER BY sp.name ASC`,
      [req.params.id]
    );

    res.json({ item: rHead.rows[0], items: rItems.rows });
  } catch (e) { next(e); }
});

// ── GET /api/reorders/:id/pdf ─────────────────────────────────────────────────
reordersRoutes.get('/:id/pdf', authMiddleware, requireRole(...WAREHOUSE), async (req, res, next) => {
  try {
    const rHead = await pool.query(
      `SELECT r.*, u.username AS created_by_username
       FROM reorders r LEFT JOIN users u ON u.id = r.created_by
       WHERE r.id = $1`,
      [req.params.id]
    );
    if (!rHead.rows.length) return res.status(404).json({ error: 'Ordine non trovato' });

    const rItems = await pool.query(
      `SELECT i.*, sp.name AS spare_part_name, sp.codice, sp.tipologia
       FROM reorder_items i
       JOIN spare_parts sp ON sp.id = i.spare_part_id
       WHERE i.reorder_id = $1
       ORDER BY sp.name ASC`,
      [req.params.id]
    );

    await buildPdf(res, rHead.rows[0], rItems.rows);
  } catch (e) { next(e); }
});

// ── PATCH /api/reorders/:id/items/:itemId ─────────────────────────────────────
// Registra ricezione parziale/totale su una singola riga
reordersRoutes.patch('/:id/items/:itemId', authMiddleware, requireRole(...WAREHOUSE), async (req, res, next) => {
  try {
    const { quantita_ricevuta } = req.body as { quantita_ricevuta?: number };
    if (quantita_ricevuta === undefined || quantita_ricevuta < 0)
      return res.status(400).json({ error: 'quantita_ricevuta deve essere >= 0' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verifica ordine
      const rOrd = await client.query(
        `SELECT * FROM reorders WHERE id = $1 FOR UPDATE`, [req.params.id]
      );
      if (!rOrd.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Ordine non trovato' }); }
      const ord = rOrd.rows[0];
      if (['completed', 'cancelled'].includes(ord.status)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Ordine ${STATUS_LABEL[ord.status] ?? ord.status}: non modificabile` });
      }

      // Recupera riga corrente
      const rItem = await client.query(
        `SELECT * FROM reorder_items WHERE id = $1 AND reorder_id = $2 FOR UPDATE`,
        [req.params.itemId, req.params.id]
      );
      if (!rItem.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Riga non trovata' }); }
      const item = rItem.rows[0];

      const delta = quantita_ricevuta - item.quantita_ricevuta;
      const nuovoStatus = quantita_ricevuta >= item.quantita_ordinata ? 'completed'
                        : quantita_ricevuta  > 0                      ? 'partial'
                        : 'pending';

      // Aggiorna riga
      const updItem = await client.query(
        `UPDATE reorder_items
         SET quantita_ricevuta = $1, status = $2, updated_at = now()
         WHERE id = $3
         RETURNING *`,
        [quantita_ricevuta, nuovoStatus, req.params.itemId]
      );

      // Se c'è un delta positivo → aggiorna giacenza
      if (delta > 0) {
        const updPart = await client.query(
          `UPDATE spare_parts SET quantita = quantita + $1, updated_at = now()
           WHERE id = $2 RETURNING id, quantita`,
          [delta, item.spare_part_id]
        );
        await client.query(
          `INSERT INTO spare_parts_movimenti
             (spare_part_id, tipo, delta, quantita_dopo, riferimento_id, riferimento_tipo, actor_id)
           VALUES ($1,'versamento_riordine',$2,$3,$4,'reorder',$5)`,
          [updPart.rows[0].id, delta, updPart.rows[0].quantita, req.params.id, req.user!.id]
        );
      }

      // Ricalcola status ordine in base alle righe
      const allItemsR = await client.query(
        `SELECT status FROM reorder_items WHERE reorder_id = $1`, [req.params.id]
      );
      const statuses = allItemsR.rows.map((r: any) => r.status);
      let newOrdStatus: string;
      if (statuses.every((s: string) => s === 'completed'))  newOrdStatus = 'completed';
      else if (statuses.some((s: string)  => s !== 'pending')) newOrdStatus = 'partial';
      else                                                     newOrdStatus = 'pending';

      await client.query(
        `UPDATE reorders SET status = $1, updated_at = now() WHERE id = $2`,
        [newOrdStatus, req.params.id]
      );

      await client.query('COMMIT');
      res.json({ item: updItem.rows[0] });
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  } catch (e) { next(e); }
});

// ── PATCH /api/reorders/:id/cancel ───────────────────────────────────────────
reordersRoutes.patch('/:id/cancel', authMiddleware, requireRole(...WAREHOUSE), async (req, res, next) => {
  try {
    const rOrd = await pool.query('SELECT * FROM reorders WHERE id = $1', [req.params.id]);
    if (!rOrd.rows.length) return res.status(404).json({ error: 'Ordine non trovato' });
    const ord = rOrd.rows[0];

    if (!['pending', 'partial'].includes(ord.status))
      return res.status(400).json({ error: 'Solo gli ordini in sospeso o parziali possono essere annullati' });

    // Verifica che non ci siano già versamenti
    const versR = await pool.query(
      `SELECT COALESCE(SUM(quantita_ricevuta),0)::int AS tot FROM reorder_items WHERE reorder_id = $1`,
      [req.params.id]
    );
    if (versR.rows[0].tot > 0)
      return res.status(400).json({ error: 'Non è possibile annullare un ordine con versamenti già registrati' });

    const r = await pool.query(
      `UPDATE reorders SET status = 'cancelled', updated_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json({ item: r.rows[0] });
  } catch (e) { next(e); }
});
