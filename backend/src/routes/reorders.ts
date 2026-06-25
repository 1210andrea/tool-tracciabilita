import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth';
import { pool } from '../db';
import PDFDocument from 'pdfkit';

export const reordersRoutes = Router();

const WAREHOUSE = ['admin', 'magazziniere'] as const;

const STATUS_LABEL: Record<string, string> = {
  in_lavorazione: 'IN LAVORAZIONE',
  partial:        'PARZIALMENTE RICEVUTO',
  completed:      'COMPLETATO',
  cancelled:      'ANNULLATO',
};

// ── Genera PDF in memoria ─────────────────────────────────────────────────────
async function buildPdf(
  res: any,
  order: Record<string, any>,
  part: Record<string, any>
) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
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
  doc.fontSize(20).fillColor(ACCENT).text('ORDINE INTERNO', { align: 'center' });
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

  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(ACCENT).lineWidth(1).stroke();
  doc.moveDown(0.8);

  // Corpo articolo
  const field = (label: string, value: string) => {
    doc.fontSize(10).fillColor(GRAY).text(label, { continued: true });
    doc.fillColor(BLACK).text(` ${value}`);
  };

  field('Codice articolo :', part.codice ?? '—');
  field('Descrizione     :', part.name ?? '—');
  field('Tipologia       :', part.tipologia ?? '—');
  doc.moveDown(0.3);
  field('Q.tà ordinata   :', String(order.quantita_ordinata));
  if (order.quantita_ricevuta > 0)
    field('Q.tà già versata:', String(order.quantita_ricevuta));

  if (order.note) {
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor(GRAY).text(`Note: ${order.note}`);
  }

  // Footer
  doc.moveDown(2);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(ACCENT).lineWidth(0.5).stroke();
  doc.moveDown(0.5);
  doc.fontSize(8).fillColor(GRAY)
    .text(`Documento generato il ${new Date().toLocaleString('it-IT')}`, { align: 'right' });

  doc.end();
}

// ── GET /api/reorders ─────────────────────────────────────────────────────────
reordersRoutes.get('/', authMiddleware, requireRole(...WAREHOUSE), async (req, res, next) => {
  try {
    const { status, from, to, spare_part_id } = req.query as Record<string, string>;
    const page  = Math.max(1, parseInt((req.query.page  as string) || '1'));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '20')));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (status)        { conditions.push(`r.status = $${idx++}`);                params.push(status); }
    if (from)          { conditions.push(`r.created_at >= $${idx++}`);           params.push(from); }
    if (to)            { conditions.push(`r.created_at <= $${idx++}`);           params.push(to); }
    if (spare_part_id) { conditions.push(`r.spare_part_id = $${idx++}`);         params.push(spare_part_id); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countR = await pool.query(
      `SELECT COUNT(*)::int AS total FROM reorders r ${where}`, params
    );
    const total = countR.rows[0].total;

    const r = await pool.query(
      `SELECT r.id, r.numero_ordine, r.status, r.note,
              r.quantita_ordinata, r.quantita_ricevuta,
              r.created_at, r.updated_at,
              u.username AS created_by_username,
              sp.codice, sp.name AS spare_part_name, sp.tipologia
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

// ── POST /api/reorders ────────────────────────────────────────────────────────
// Crea ordine (1 articolo) + genera PDF inline
reordersRoutes.post('/', authMiddleware, requireRole(...WAREHOUSE), async (req, res, next) => {
  try {
    const { spare_part_id, quantita_ordinata, note } = req.body as {
      spare_part_id?: string;
      quantita_ordinata?: number;
      note?: string;
    };

    if (!spare_part_id)
      return res.status(400).json({ error: 'spare_part_id è obbligatorio' });
    if (!quantita_ordinata || quantita_ordinata <= 0)
      return res.status(400).json({ error: 'quantita_ordinata deve essere > 0' });

    // Controlla ordine aperto duplicato
    const dupR = await pool.query(
      `SELECT id FROM reorders
       WHERE spare_part_id = $1 AND status IN ('in_lavorazione','partial')`,
      [spare_part_id]
    );
    if (dupR.rows.length)
      return res.status(409).json({ error: 'Esiste già un ordine aperto per questo articolo' });

    // Recupera articolo
    const partR = await pool.query('SELECT * FROM spare_parts WHERE id = $1', [spare_part_id]);
    if (!partR.rows.length)
      return res.status(404).json({ error: 'Ricambio non trovato' });
    const part = partR.rows[0];

    // Crea ordine
    const ordR = await pool.query(
      `INSERT INTO reorders(spare_part_id, quantita_ordinata, status, note, created_by)
       VALUES($1, $2, 'in_lavorazione', $3, $4)
       RETURNING *`,
      [spare_part_id, quantita_ordinata, note?.trim() ?? null, req.user!.id]
    );
    const order = ordR.rows[0];

    // Recupera username
    const userR = await pool.query('SELECT username FROM users WHERE id = $1', [req.user!.id]);
    order.created_by_username = userR.rows[0]?.username ?? '';

    // Genera PDF in memoria e invia
    await buildPdf(res, order, part);
  } catch (e) { next(e); }
});

// ── GET /api/reorders/:id ─────────────────────────────────────────────────────
reordersRoutes.get('/:id', authMiddleware, requireRole(...WAREHOUSE), async (req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT r.*, u.username AS created_by_username,
              sp.codice, sp.name AS spare_part_name, sp.tipologia,
              sp.quantita AS spare_part_quantita, sp.scorta_minima
       FROM reorders r
       LEFT JOIN users u       ON u.id  = r.created_by
       LEFT JOIN spare_parts sp ON sp.id = r.spare_part_id
       WHERE r.id = $1`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Ordine non trovato' });
    res.json({ item: r.rows[0] });
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
    const order = rHead.rows[0];

    const partR = await pool.query('SELECT * FROM spare_parts WHERE id = $1', [order.spare_part_id]);
    const part  = partR.rows[0] ?? {};

    await buildPdf(res, order, part);
  } catch (e) { next(e); }
});

// ── PATCH /api/reorders/:id/versamento ───────────────────────────────────────
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
      if (!rOrd.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Ordine non trovato' }); }
      const ord = rOrd.rows[0];

      if (['completed', 'cancelled'].includes(ord.status)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Non si può versare su un ordine ${STATUS_LABEL[ord.status] ?? ord.status}` });
      }

      const nuovaRicevuta = ord.quantita_ricevuta + quantita_versata;
      const nuovoStatus = nuovaRicevuta >= ord.quantita_ordinata ? 'completed' : 'partial';

      const updOrd = await client.query(
        `UPDATE reorders
         SET quantita_ricevuta = $1, status = $2, updated_at = now()
         WHERE id = $3
         RETURNING *`,
        [nuovaRicevuta, nuovoStatus, req.params.id]
      );

      // Aggiorna giacenza spare_part (NO GREATEST)
      const updPart = await client.query(
        `UPDATE spare_parts
         SET quantita = quantita + $1, updated_at = now()
         WHERE id = $2
         RETURNING id, quantita`,
        [quantita_versata, ord.spare_part_id]
      );

      // Movimento
      await client.query(
        `INSERT INTO spare_parts_movimenti
           (spare_part_id, tipo, delta, quantita_dopo, riferimento_id, riferimento_tipo, actor_id)
         VALUES ($1,'versamento_riordine',$2,$3,$4,'reorder',$5)`,
        [updPart.rows[0].id, quantita_versata, updPart.rows[0].quantita, req.params.id, req.user!.id]
      );

      await client.query('COMMIT');
      res.json({ item: updOrd.rows[0] });
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

    if (ord.status !== 'in_lavorazione')
      return res.status(400).json({ error: 'Solo gli ordini in lavorazione possono essere annullati' });
    if (ord.quantita_ricevuta > 0)
      return res.status(400).json({ error: 'Non è possibile annullare un ordine con versamenti già registrati' });

    const r = await pool.query(
      `UPDATE reorders SET status = 'cancelled', updated_at = now()
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json({ item: r.rows[0] });
  } catch (e) { next(e); }
});
