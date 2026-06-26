import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth';
import { pool } from '../db';
import PDFDocument from 'pdfkit';

export const reordersRoutes = Router();

const WAREHOUSE = ['admin', 'magazziniere'] as const;

// ── helper: genera PDF ordine ──────────────────────────────────────────────
function buildPdf(
  res: any,
  order: Record<string, any>,
  part: Record<string, any>
) {
  const doc     = new PDFDocument({ margin: 60, size: 'A4' });
  const TEAL    = '#0f766e';
  const BLACK   = '#111827';
  const GRAY    = '#6b7280';
  const LIGHT   = '#f3f4f6';

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="ordine-${order.numero_ordine}.pdf"`
  );
  doc.pipe(res);

  const W = 595 - 120; // larghezza utile (A4 - margini)

  // ── Intestazione azienda ──
  doc
    .fontSize(22)
    .fillColor(TEAL)
    .font('Helvetica-Bold')
    .text('RACCAGNI GROUP SRL', { align: 'center' });

  doc.moveDown(0.3);
  doc
    .fontSize(16)
    .fillColor(BLACK)
    .font('Helvetica')
    .text('ORDINE INTERNO', { align: 'center' });

  doc.moveDown(0.2);
  doc
    .fontSize(13)
    .fillColor(GRAY)
    .text(`N\u00b0 ${order.numero_ordine}`, { align: 'center' });

  // Linea separatrice
  doc.moveDown(0.6);
  const lineY = doc.y;
  doc.moveTo(60, lineY).lineTo(535, lineY).strokeColor(TEAL).lineWidth(1.5).stroke();
  doc.moveDown(0.8);

  // ── Data di creazione ──
  const dataFmt = new Date(order.created_at).toLocaleDateString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  doc
    .fontSize(11)
    .fillColor(GRAY)
    .font('Helvetica')
    .text('Data: ', { continued: true })
    .fillColor(BLACK)
    .font('Helvetica-Bold')
    .text(dataFmt);

  if (order.created_by_username) {
    doc
      .fontSize(11)
      .fillColor(GRAY)
      .font('Helvetica')
      .text('Creato da: ', { continued: true })
      .fillColor(BLACK)
      .font('Helvetica-Bold')
      .text(order.created_by_username);
  }

  doc.moveDown(0.8);

  // ── Tabella dati articolo ──
  const rows: [string, string][] = [
    ['Codice articolo',  part.codice    ?? '\u2014'],
    ['Descrizione',      part.name      ?? '\u2014'],
    ['Tipologia',        part.tipologia ?? '\u2014'],
    ['Quantit\u00e0 ordinata', String(order.quantita_ordinata)],
  ];

  const COL1 = 60;
  const COL2 = 230;
  const ROW_H = 26;

  for (let i = 0; i < rows.length; i++) {
    const [label, value] = rows[i];
    const y = doc.y;
    const bg = i % 2 === 0 ? LIGHT : '#ffffff';

    // Sfondo riga alternato
    doc.rect(COL1, y, W + 60, ROW_H).fillColor(bg).fill();

    // Testo label
    doc
      .fontSize(10)
      .fillColor(GRAY)
      .font('Helvetica')
      .text(label, COL1 + 6, y + 7, { width: COL2 - COL1 - 10 });

    // Testo valore
    doc
      .fontSize(10)
      .fillColor(BLACK)
      .font('Helvetica-Bold')
      .text(value, COL2, y + 7, { width: W - (COL2 - COL1) + 20 });

    doc.y = y + ROW_H + 2;
  }

  // Bordo tabella
  const tableTop = doc.y - (rows.length * (ROW_H + 2));
  doc
    .rect(COL1, tableTop, W + 60, rows.length * (ROW_H + 2))
    .strokeColor('#d1d5db')
    .lineWidth(0.5)
    .stroke();

  // ── Note ──
  if (order.note) {
    doc.moveDown(0.8);
    doc
      .fontSize(10)
      .fillColor(GRAY)
      .font('Helvetica')
      .text('Note: ', { continued: true })
      .fillColor(BLACK)
      .font('Helvetica')
      .text(order.note, { width: W + 60 });
  }

  // ── Footer ──
  doc.moveDown(2);
  doc
    .fontSize(8)
    .fillColor(GRAY)
    .font('Helvetica')
    .text(
      `Documento generato il ${new Date().toLocaleString('it-IT')}`,
      { align: 'right' }
    );

  doc.end();
}

// ── GET /api/reorders ──────────────────────────────────────────────────────
reordersRoutes.get('/', authMiddleware, requireRole(...WAREHOUSE), async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt((req.query.page  as string) || '1'));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '20')));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    const status        = req.query.status        as string | undefined;
    const spare_part_id = req.query.spare_part_id as string | undefined;
    const from          = req.query.from          as string | undefined;
    const to            = req.query.to            as string | undefined;

    if (status)        { conditions.push(`r.status = $${idx++}`);        params.push(status); }
    if (spare_part_id) { conditions.push(`r.spare_part_id = $${idx++}`); params.push(spare_part_id); }
    if (from)          { conditions.push(`r.created_at >= $${idx++}`);   params.push(from); }
    if (to)            { conditions.push(`r.created_at <= $${idx++}`);   params.push(to); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countR = await pool.query(
      `SELECT COUNT(*)::int AS total FROM reorders r ${where}`, params
    );
    const total = countR.rows[0].total;

    const r = await pool.query(
      `SELECT r.id, r.numero_ordine, r.status, r.note,
              r.quantita_ordinata, r.quantita_ricevuta,
              r.created_at, r.updated_at,
              u.username   AS created_by_username,
              sp.name      AS spare_part_name,
              sp.codice    AS codice,
              sp.tipologia AS tipologia
       FROM reorders r
       LEFT JOIN users       u  ON u.id  = r.created_by
       LEFT JOIN spare_parts sp ON sp.id = r.spare_part_id
       ${where}
       ORDER BY r.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    res.json({ items: r.rows, total, page, pages: Math.ceil(total / limit) });
  } catch (e) { next(e); }
});

// ── POST /api/reorders ─────────────────────────────────────────────────────
reordersRoutes.post('/', authMiddleware, requireRole(...WAREHOUSE), async (req, res, next) => {
  try {
    const { spare_part_id, quantita_ordinata, note } = req.body as {
      spare_part_id?: string; quantita_ordinata?: number; note?: string;
    };

    if (!spare_part_id)
      return res.status(400).json({ error: 'spare_part_id è obbligatorio' });
    if (!quantita_ordinata || quantita_ordinata <= 0)
      return res.status(400).json({ error: 'quantita_ordinata deve essere > 0' });

    const openR = await pool.query(
      `SELECT id FROM reorders
       WHERE spare_part_id = $1 AND status IN ('in_lavorazione','partial')`,
      [spare_part_id]
    );
    if (openR.rows.length)
      return res.status(409).json({ error: 'Esiste gi\u00e0 un ordine aperto per questo articolo' });

    const ordR = await pool.query(
      `INSERT INTO reorders (spare_part_id, quantita_ordinata, status, note, created_by)
       VALUES ($1, $2, 'in_lavorazione', $3, $4)
       RETURNING *`,
      [spare_part_id, quantita_ordinata, note?.trim() ?? null, req.user!.id]
    );
    const order = ordR.rows[0];

    const partR = await pool.query(
      `SELECT id, name, codice, tipologia FROM spare_parts WHERE id = $1`,
      [spare_part_id]
    );
    if (!partR.rows.length) return res.status(404).json({ error: 'Articolo non trovato' });

    const userR = await pool.query('SELECT username FROM users WHERE id = $1', [req.user!.id]);
    order.created_by_username = userR.rows[0]?.username ?? '';

    buildPdf(res, order, partR.rows[0]);
  } catch (e) { next(e); }
});

// ── GET /api/reorders/:id ──────────────────────────────────────────────────
reordersRoutes.get('/:id', authMiddleware, requireRole(...WAREHOUSE), async (req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT r.*,
              u.username   AS created_by_username,
              sp.name      AS spare_part_name,
              sp.codice    AS codice,
              sp.tipologia AS tipologia
       FROM reorders r
       LEFT JOIN users       u  ON u.id  = r.created_by
       LEFT JOIN spare_parts sp ON sp.id = r.spare_part_id
       WHERE r.id = $1`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Ordine non trovato' });
    res.json({ item: r.rows[0] });
  } catch (e) { next(e); }
});

// ── GET /api/reorders/:id/pdf ──────────────────────────────────────────────
reordersRoutes.get('/:id/pdf', authMiddleware, requireRole(...WAREHOUSE), async (req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT r.*, u.username AS created_by_username
       FROM reorders r
       LEFT JOIN users u ON u.id = r.created_by
       WHERE r.id = $1`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Ordine non trovato' });
    const order = r.rows[0];

    const partR = await pool.query(
      `SELECT id, name, codice, tipologia FROM spare_parts WHERE id = $1`,
      [order.spare_part_id]
    );
    if (!partR.rows.length) return res.status(404).json({ error: 'Articolo non trovato' });

    buildPdf(res, order, partR.rows[0]);
  } catch (e) { next(e); }
});

// ── DELETE /api/reorders/:id ───────────────────────────────────────────────
// - admin: elimina qualsiasi ordine
// - magazziniere: solo ordini cancelled
reordersRoutes.delete('/:id', authMiddleware, requireRole(...WAREHOUSE), async (req, res, next) => {
  try {
    const rOrd = await pool.query('SELECT status FROM reorders WHERE id = $1', [req.params.id]);
    if (!rOrd.rows.length) return res.status(404).json({ error: 'Ordine non trovato' });

    const role   = (req as any).user?.role;
    const status = rOrd.rows[0].status;

    if (role !== 'admin' && status !== 'cancelled')
      return res.status(400).json({ error: 'Solo gli ordini annullati possono essere eliminati' });

    await pool.query('DELETE FROM reorders WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── PATCH /api/reorders/:id/versamento ────────────────────────────────────
reordersRoutes.patch('/:id/versamento', authMiddleware, requireRole(...WAREHOUSE), async (req, res, next) => {
  try {
    const { quantita_versata } = req.body as { quantita_versata?: number };
    if (!quantita_versata || quantita_versata <= 0)
      return res.status(400).json({ error: 'quantita_versata deve essere > 0' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const rOrd = await client.query(
        `SELECT * FROM reorders WHERE id = $1 FOR UPDATE`, [req.params.id]
      );
      if (!rOrd.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Ordine non trovato' });
      }
      const ord = rOrd.rows[0];

      if (['completed', 'cancelled'].includes(ord.status)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Ordine ${ord.status}: non modificabile`,
        });
      }

      const updOrd = await client.query(
        `UPDATE reorders
         SET quantita_ricevuta = quantita_ricevuta + $1,
             status = CASE
               WHEN quantita_ricevuta + $1 >= quantita_ordinata THEN 'completed'
               ELSE 'partial'
             END,
             updated_at = now()
         WHERE id = $2
         RETURNING spare_part_id, quantita_ricevuta, quantita_ordinata, status`,
        [quantita_versata, req.params.id]
      );
      const updOrdRow = updOrd.rows[0];

      const updPart = await client.query(
        `UPDATE spare_parts
         SET quantita = quantita + $1, updated_at = now()
         WHERE id = $2
         RETURNING id, quantita`,
        [quantita_versata, updOrdRow.spare_part_id]
      );

      await client.query(
        `INSERT INTO spare_parts_movimenti
           (spare_part_id, tipo, delta, quantita_dopo, riferimento_id, riferimento_tipo, actor_id)
         VALUES ($1,'versamento_riordine',$2,$3,$4,'reorder',$5)`,
        [
          updPart.rows[0].id,
          quantita_versata,
          updPart.rows[0].quantita,
          req.params.id,
          req.user!.id,
        ]
      );

      await client.query('COMMIT');

      const finalOrd = await pool.query(
        `SELECT r.*, u.username AS created_by_username,
                sp.name AS spare_part_name, sp.codice, sp.tipologia
         FROM reorders r
         LEFT JOIN users       u  ON u.id  = r.created_by
         LEFT JOIN spare_parts sp ON sp.id = r.spare_part_id
         WHERE r.id = $1`,
        [req.params.id]
      );
      res.json({ item: finalOrd.rows[0] });
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  } catch (e) { next(e); }
});

// ── PATCH /api/reorders/:id/cancel ────────────────────────────────────────
reordersRoutes.patch('/:id/cancel', authMiddleware, requireRole(...WAREHOUSE), async (req, res, next) => {
  try {
    const rOrd = await pool.query('SELECT * FROM reorders WHERE id = $1', [req.params.id]);
    if (!rOrd.rows.length) return res.status(404).json({ error: 'Ordine non trovato' });
    const ord = rOrd.rows[0];

    if (ord.status !== 'in_lavorazione')
      return res.status(400).json({ error: 'Solo gli ordini in lavorazione possono essere annullati' });
    if ((ord.quantita_ricevuta ?? 0) > 0)
      return res.status(400).json({
        error: 'Non \u00e8 possibile annullare un ordine con versamenti gi\u00e0 registrati',
      });

    const r = await pool.query(
      `UPDATE reorders SET status = 'cancelled', updated_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json({ item: r.rows[0] });
  } catch (e) { next(e); }
});
