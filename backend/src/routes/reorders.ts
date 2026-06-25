import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../db';
import PDFDocument from 'pdfkit';

export const reordersRoutes = Router();

// ── GET /api/reorders  (lista ordini con riepilogo righe) ─────────────────
reordersRoutes.get('/', authMiddleware, async (req, res, next) => {
  try {
    const status = (req.query.status as string) || null;
    const r = await pool.query(
      `SELECT r.id,
              r.numero_ordine,
              r.status,
              r.note,
              r.created_at,
              r.updated_at,
              u.username AS created_by_username,
              COUNT(ri.id)::int                           AS total_items,
              COALESCE(SUM(ri.quantita_ordinata),0)::int  AS total_qty_ordinata,
              COALESCE(SUM(ri.quantita_ricevuta),0)::int  AS total_qty_ricevuta
       FROM reorders r
       LEFT JOIN users         u  ON u.id  = r.created_by
       LEFT JOIN reorder_items ri ON ri.reorder_id = r.id
       WHERE ($1::text IS NULL OR r.status = $1)
       GROUP BY r.id, u.username
       ORDER BY r.created_at DESC`,
      [status]
    );
    res.json({ items: r.rows });
  } catch (e) { next(e); }
});

// ── GET /api/reorders/:id  (dettaglio + righe) ────────────────────────────
reordersRoutes.get('/:id', authMiddleware, async (req, res, next) => {
  try {
    const rHead = await pool.query(
      `SELECT r.*, u.username AS created_by_username
       FROM reorders r
       LEFT JOIN users u ON u.id = r.created_by
       WHERE r.id = $1`,
      [req.params.id]
    );
    if (!rHead.rows.length) return res.status(404).json({ error: 'Ordine non trovato' });

    const rItems = await pool.query(
      `SELECT ri.id,
              ri.spare_part_id,
              sp.codice,
              sp.name      AS spare_part_name,
              sp.description AS spare_part_description,
              ri.quantita_ordinata,
              ri.quantita_ricevuta,
              ri.status,
              COALESCE(
                ARRAY_AGG(spt.tipologia) FILTER (WHERE spt.tipologia IS NOT NULL),
                '{}'
              ) AS tipologie
       FROM reorder_items ri
       JOIN spare_parts sp ON sp.id = ri.spare_part_id
       LEFT JOIN spare_part_tipologie spt ON spt.spare_part_id = sp.id
       WHERE ri.reorder_id = $1
       GROUP BY ri.id, ri.spare_part_id, sp.codice, sp.name, sp.description,
                ri.quantita_ordinata, ri.quantita_ricevuta, ri.status
       ORDER BY sp.name ASC`,
      [req.params.id]
    );

    res.json({ item: rHead.rows[0], items: rItems.rows });
  } catch (e) { next(e); }
});

// ── POST /api/reorders  (crea ordine manuale) ─────────────────────────────
reordersRoutes.post('/', authMiddleware, async (req, res, next) => {
  try {
    const { note, items } = req.body as {
      note?: string;
      items?: { spare_part_id: string; quantita_ordinata: number }[];
    };
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: 'items[] è obbligatorio e non può essere vuoto' });

    for (const it of items) {
      if (!it.spare_part_id) return res.status(400).json({ error: 'spare_part_id obbligatorio per ogni riga' });
      if (!it.quantita_ordinata || it.quantita_ordinata <= 0)
        return res.status(400).json({ error: 'quantita_ordinata deve essere > 0' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const rHead = await client.query(
        `INSERT INTO reorders(note, created_by) VALUES($1, $2) RETURNING *`,
        [note?.trim() ?? null, req.user!.id]
      );
      const reorderId = rHead.rows[0].id as string;

      for (const it of items) {
        await client.query(
          `INSERT INTO reorder_items(reorder_id, spare_part_id, quantita_ordinata)
           VALUES($1, $2, $3)`,
          [reorderId, it.spare_part_id, it.quantita_ordinata]
        );
      }
      await client.query('COMMIT');
      res.status(201).json({ item: rHead.rows[0] });
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  } catch (e) { next(e); }
});

// ── POST /api/reorders/generate  (genera ordine automatico sotto-scorta) ──
reordersRoutes.post('/generate', authMiddleware, async (req, res, next) => {
  try {
    const { note } = req.body as { note?: string };

    const rParts = await pool.query(
      `SELECT id, qty_riordino
       FROM spare_parts
       WHERE quantita <= scorta_minima AND qty_riordino > 0`
    );

    if (!rParts.rows.length)
      return res.status(200).json({ message: 'Nessun pezzo sotto scorta minima.', item: null });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const rHead = await client.query(
        `INSERT INTO reorders(note, created_by) VALUES($1, $2) RETURNING *`,
        [note?.trim() ?? 'Ordine automatico sotto-scorta', req.user!.id]
      );
      const reorderId = rHead.rows[0].id as string;

      for (const part of rParts.rows) {
        await client.query(
          `INSERT INTO reorder_items(reorder_id, spare_part_id, quantita_ordinata)
           VALUES($1, $2, $3)`,
          [reorderId, part.id, part.qty_riordino]
        );
      }
      await client.query('COMMIT');
      res.status(201).json({ item: rHead.rows[0], parts_count: rParts.rows.length });
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  } catch (e) { next(e); }
});

// ── PATCH /api/reorders/:id/items/:itemId  (ricevi quantità) ─────────────
reordersRoutes.patch('/:id/items/:itemId', authMiddleware, async (req, res, next) => {
  try {
    const { id: reorderId, itemId } = req.params;
    const { quantita_ricevuta } = req.body as { quantita_ricevuta?: number };

    if (quantita_ricevuta === undefined || quantita_ricevuta < 0)
      return res.status(400).json({ error: 'quantita_ricevuta deve essere >= 0' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const rCheck = await client.query(
        `SELECT ri.*, sp.id AS sp_id
         FROM reorder_items ri
         JOIN spare_parts sp ON sp.id = ri.spare_part_id
         WHERE ri.id = $1 AND ri.reorder_id = $2`,
        [itemId, reorderId]
      );
      if (!rCheck.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Riga ordine non trovata' });
      }

      const row = rCheck.rows[0];
      const prevRicevuta = Number(row.quantita_ricevuta);
      const delta = quantita_ricevuta - prevRicevuta;
      const newStatus = quantita_ricevuta >= Number(row.quantita_ordinata) ? 'completed'
        : quantita_ricevuta > 0 ? 'partial' : 'pending';

      await client.query(
        `UPDATE reorder_items
         SET quantita_ricevuta = $1, status = $2, updated_at = now()
         WHERE id = $3`,
        [quantita_ricevuta, newStatus, itemId]
      );

      if (delta > 0) {
        await client.query(
          `UPDATE spare_parts SET quantita = quantita + $1, updated_at = now() WHERE id = $2`,
          [delta, row.sp_id]
        );
      }

      await client.query('SELECT refresh_reorder_status($1)', [reorderId]);
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  } catch (e) { next(e); }
});

// ── PATCH /api/reorders/:id/cancel  (annulla ordine) ─────────────────────
reordersRoutes.patch('/:id/cancel', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const r = await pool.query(
      `UPDATE reorders SET status = 'cancelled', updated_at = now()
       WHERE id = $1 AND status = 'pending' RETURNING id`,
      [req.params.id]
    );
    if (!r.rows.length)
      return res.status(400).json({ error: 'Ordine non trovato o non annullabile' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── GET /api/reorders/:id/pdf  (genera e scarica PDF ordine) ─────────────
reordersRoutes.get('/:id/pdf', authMiddleware, async (req, res, next) => {
  try {
    // Dati testata
    const rHead = await pool.query(
      `SELECT r.*, u.username AS created_by_username
       FROM reorders r LEFT JOIN users u ON u.id = r.created_by
       WHERE r.id = $1`,
      [req.params.id]
    );
    if (!rHead.rows.length) return res.status(404).json({ error: 'Ordine non trovato' });
    const order = rHead.rows[0];

    // Righe ordine
    const rItems = await pool.query(
      `SELECT sp.codice, sp.name, sp.description,
              COALESCE(ARRAY_AGG(spt.tipologia) FILTER (WHERE spt.tipologia IS NOT NULL), '{}') AS tipologie,
              ri.quantita_ordinata, ri.quantita_ricevuta, ri.status
       FROM reorder_items ri
       JOIN spare_parts sp ON sp.id = ri.spare_part_id
       LEFT JOIN spare_part_tipologie spt ON spt.spare_part_id = sp.id
       WHERE ri.reorder_id = $1
       GROUP BY sp.codice, sp.name, sp.description, ri.quantita_ordinata, ri.quantita_ricevuta, ri.status
       ORDER BY sp.name ASC`,
      [req.params.id]
    );
    const items = rItems.rows;

    // Genera PDF
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ordine-${order.numero_ordine}.pdf"`
    );
    doc.pipe(res);

    const GRAY  = '#6b7280';
    const BLACK = '#111827';
    const ACCENT = '#0f766e';

    // — Intestazione —
    doc.fontSize(20).fillColor(ACCENT).text('ORDINE DI RIAPPROVVIGIONAMENTO', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor(GRAY);
    doc.text(`N° Ordine: ${order.numero_ordine}`, { align: 'center' });
    doc.text(
      `Data: ${new Date(order.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })}`,
      { align: 'center' }
    );
    if (order.created_by_username)
      doc.text(`Creato da: ${order.created_by_username}`, { align: 'center' });

    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(ACCENT).lineWidth(1).stroke();
    doc.moveDown(1);

    // — Stato ordine —
    const statusLabel: Record<string, string> = {
      pending: 'IN SOSPESO', partial: 'PARZIALMENTE RICEVUTO',
      completed: 'COMPLETATO', cancelled: 'ANNULLATO'
    };
    doc.fontSize(11).fillColor(BLACK)
      .text('Stato ordine: ', { continued: true })
      .fillColor(ACCENT)
      .text(statusLabel[order.status] ?? order.status);

    if (order.note) {
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor(GRAY).text(`Note: ${order.note}`);
    }

    doc.moveDown(1);

    // — Tabella righe —
    const colX = { codice: 50, descrizione: 130, tipologia: 330, qta: 460, ricevuta: 510 };
    const rowH = 22;

    // Intestazione colonne
    doc.fontSize(9).fillColor(GRAY);
    doc.text('CODICE',      colX.codice,      doc.y, { width: 75 });
    const headerY = doc.y - rowH;
    doc.text('DESCRIZIONE', colX.descrizione, headerY, { width: 195 });
    doc.text('TIPOLOGIA',   colX.tipologia,   headerY, { width: 120 });
    doc.text('Q.TÀ ORD.',   colX.qta,         headerY, { width: 45, align: 'right' });
    doc.text('RICEVUTA',    colX.ricevuta,    headerY, { width: 45, align: 'right' });

    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
    doc.moveDown(0.3);

    // Righe
    for (const item of items) {
      const y = doc.y;
      doc.fontSize(9).fillColor(BLACK);
      doc.text(item.codice ?? '-',              colX.codice,      y, { width: 75 });
      doc.text(item.name ?? '-',                colX.descrizione, y, { width: 195 });
      doc.text((item.tipologie ?? []).join(', ') || '-', colX.tipologia, y, { width: 120 });
      doc.text(String(item.quantita_ordinata),  colX.qta,         y, { width: 45, align: 'right' });
      doc.text(String(item.quantita_ricevuta),  colX.ricevuta,    y, { width: 45, align: 'right' });

      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#f3f4f6').lineWidth(0.5).stroke();
      doc.moveDown(0.3);
    }

    // — Footer —
    doc.moveDown(2);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(ACCENT).lineWidth(0.5).stroke();
    doc.moveDown(0.5);
    doc.fontSize(8).fillColor(GRAY)
      .text(`Documento generato il ${new Date().toLocaleString('it-IT')}`, { align: 'right' });

    doc.end();
  } catch (e) { next(e); }
});
