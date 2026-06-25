import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth';
import { pool } from '../db';
import PDFDocument from 'pdfkit';

export const reordersRoutes = Router();

const WAREHOUSE = ['admin', 'magazziniere'] as const;

const STATUS_LABEL: Record<string, string> = {
  in_lavorazione: 'IN LAVORAZIONE',
  partial:        'PARZIALE',
  completed:      'COMPLETATO',
  cancelled:      'ANNULLATO',
};

// ── helper: genera PDF per un singolo ordine (1 articolo) ─────────────────────
function buildPdf(
  res: any,
  order: Record<string, any>,
  part: Record<string, any>,
  includeRicevuta = false
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

  // ── Intestazione ──
  doc.fontSize(20).fillColor(ACCENT).text('ORDINE INTERNO', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(13).fillColor(BLACK).text(`N° ${order.numero_ordine}`, { align: 'center' });
  doc.moveDown(0.5);

  const dataFmt = new Date(order.created_at).toLocaleDateString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
  doc.fontSize(9).fillColor(GRAY);
  doc.text(`Data: ${dataFmt}`, { align: 'center' });
  if (order.created_by_username)
    doc.text(`Creato da: ${order.created_by_username}`, { align: 'center' });

  doc.moveDown(0.3);
  doc.fontSize(10).fillColor(BLACK)
    .text('Stato: ', { continued: true })
    .fillColor(ACCENT)
    .text(STATUS_LABEL[order.status] ?? order.status.toUpperCase());

  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(ACCENT).lineWidth(1).stroke();
  doc.moveDown(0.8);

  // ── Dati articolo ──
  const rows: [string, string][] = [
    ['Codice articolo',  part.codice   ?? '—'],
    ['Descrizione',      part.name     ?? '—'],
    ['Tipologia',        part.tipologia ?? '—'],
    ['Q.tà da ordinare', String(order.quantita_ordinata)],
  ];
  if (includeRicevuta) {
    rows.push(['Q.tà già versata', String(order.quantita_ricevuta ?? 0)]);
  }

  for (const [label, value] of rows) {
    const y = doc.y;
    doc.fontSize(9).fillColor(GRAY).text(label + ' :', 50, y, { width: 140 });
    doc.fontSize(9).fillColor(BLACK).text(value, 200, y, { width: 345 });
    doc.moveDown(0.5);
  }

  doc.moveDown(0.3);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(ACCENT).lineWidth(0.5).stroke();

  if (order.note) {
    doc.moveDown(0.6);
    doc.fontSize(9).fillColor(GRAY).text('Note:', { continued: true })
      .fillColor(BLACK).text(` ${order.note}`);
  }

  // ── Footer ──
  doc.moveDown(2);
  doc.fontSize(8).fillColor(GRAY)
    .text(`Documento generato il ${new Date().toLocaleString('it-IT')}`, { align: 'right' });

  doc.end();
}

// ── GET /api/reorders ─────────────────────────────────────────────────────────
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

    if (status)        { conditions.push(`r.status = $${idx++}`);            params.push(status); }
    if (spare_part_id) { conditions.push(`r.spare_part_id = $${idx++}`);     params.push(spare_part_id); }
    if (from)          { conditions.push(`r.created_at >= $${idx++}`);       params.push(from); }
    if (to)            { conditions.push(`r.created_at <= $${idx++}`);       params.push(to); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countR = await pool.query(
      `SELECT COUNT(*)::int AS total FROM reorders r ${where}`, params
    );
    const total = countR.rows[0].total;

    const r = await pool.query(
      `SELECT r.id, r.numero_ordine, r.status, r.note,
              r.quantita_ordinata, r.quantita_ricevuta,
              r.created_at, r.updated_at,
              u.username  AS created_by_username,
              sp.name     AS spare_part_name,
              sp.codice   AS spare_part_codice,
              sp.tipologia AS spare_part_tipologia
       FROM reorders r
       LEFT JOIN users      u  ON u.id  = r.created_by
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
// Crea ordine (1 articolo) E invia PDF come stream nella stessa response
reordersRoutes.post('/', authMiddleware, requireRole(...WAREHOUSE), async (req, res, next) => {
  try {
    const { spare_part_id, quantita_ordinata, note } = req.body as {
      spare_part_id?: string; quantita_ordinata?: number; note?: string;
    };

    if (!spare_part_id)           return res.status(400).json({ error: 'spare_part_id è obbligatorio' });
    if (!quantita_ordinata || quantita_ordinata <= 0)
      return res.status(400).json({ error: 'quantita_ordinata deve essere > 0' });

    // Verifica ordine aperto
    const openR = await pool.query(
      `SELECT id FROM reorders
       WHERE spare_part_id = $1 AND status IN ('in_lavorazione','partial')`,
      [spare_part_id]
    );
    if (openR.rows.length)
      return res.status(409).json({ error: 'Esiste già un ordine aperto per questo articolo' });

    // Crea ordine
    const ordR = await pool.query(
      `INSERT INTO reorders (spare_part_id, quantita_ordinata, status, note, created_by)
       VALUES ($1, $2, 'in_lavorazione', $3, $4)
       RETURNING *`,
      [spare_part_id, quantita_ordinata, note?.trim() ?? null, req.user!.id]
    );
    const order = ordR.rows[0];

    // Dati articolo
    const partR = await pool.query(
      `SELECT id, name, codice, tipologia FROM spare_parts WHERE id = $1`,
      [spare_part_id]
    );
    if (!partR.rows.length) return res.status(404).json({ error: 'Articolo non trovato' });
    const part = partR.rows[0];

    // Username creatore
    const userR = await pool.query('SELECT username FROM users WHERE id = $1', [req.user!.id]);
    order.created_by_username = userR.rows[0]?.username ?? '';

    // Genera PDF in memoria e invia come stream (mai salvato su disco)
    buildPdf(res, order, part, false);
  } catch (e) { next(e); }
});

// ── GET /api/reorders/:id ─────────────────────────────────────────────────────
reordersRoutes.get('/:id', authMiddleware, requireRole(...WAREHOUSE), async (req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT r.*,
              u.username  AS created_by_username,
              sp.name     AS spare_part_name,
              sp.codice   AS spare_part_codice,
              sp.tipologia AS spare_part_tipologia,
              sp.description AS spare_part_description
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

// ── GET /api/reorders/:id/pdf ─────────────────────────────────────────────────
// Rigenera PDF dai dati live (include quantita_ricevuta aggiornata)
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

    buildPdf(res, order, partR.rows[0], true);
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
        return res.status(400).json({
          error: `Ordine ${STATUS_LABEL[ord.status] ?? ord.status}: non modificabile`,
        });
      }

      // Aggiorna ordine
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

      // Aggiorna giacenza (NO GREATEST — può diventare negativa)
      const updPart = await client.query(
        `UPDATE spare_parts
         SET quantita = quantita + $1, updated_at = now()
         WHERE id = $2
         RETURNING id, quantita`,
        [quantita_versata, updOrdRow.spare_part_id]
      );

      // Movimento magazzino
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
                sp.name AS spare_part_name, sp.codice AS spare_part_codice
         FROM reorders r
         LEFT JOIN users u ON u.id = r.created_by
         LEFT JOIN spare_parts sp ON sp.id = r.spare_part_id
         WHERE r.id = $1`,
        [req.params.id]
      );
      res.json({ item: finalOrd.rows[0] });
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

    if ((ord.quantita_ricevuta ?? 0) > 0)
      return res.status(400).json({
        error: 'Non è possibile annullare un ordine con versamenti già registrati',
      });

    const r = await pool.query(
      `UPDATE reorders SET status = 'cancelled', updated_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json({ item: r.rows[0] });
  } catch (e) { next(e); }
});
