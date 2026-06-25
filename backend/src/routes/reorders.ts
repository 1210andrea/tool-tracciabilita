import { Router } from 'express';
import PDFDocument from 'pdfkit';
import { authMiddleware, requireRole } from '../middleware/auth';
import { pool } from '../db';

export const reordersRoutes = Router();

// ── Helper: genera PDF ordine in memoria
function buildPdf(order: any, part: any, creatorUsername: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const statusLabel: Record<string, string> = {
      in_lavorazione: 'IN LAVORAZIONE',
      partial: 'PARZIALE',
      completed: 'COMPLETATO',
      cancelled: 'ANNULLATO',
    };

    const fmt = (d: Date) =>
      new Intl.DateTimeFormat('it-IT', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }).format(d);

    // Intestazione
    doc.fontSize(18).font('Helvetica-Bold').text(`ORDINE INTERNO N\u00b0 ${order.numero_ordine}`, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Data: ${fmt(new Date(order.created_at))}    Creato da: ${creatorUsername}`, { align: 'center' });
    doc.text(`Stato: ${statusLabel[order.status] ?? order.status}`, { align: 'center' });
    doc.moveDown(1);

    // Separatore
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#888').stroke();
    doc.moveDown(0.8);

    // Dati articolo
    const row = (label: string, value: string) => {
      doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
      doc.font('Helvetica').text(value || '\u2014');
    };

    row('Codice articolo ', part.codice ?? '\u2014');
    row('Descrizione     ', part.name);
    row('Tipologia       ', part.tipologia ?? '\u2014');
    row('Q.t\u00e0 da ordinare', String(order.quantita_ordinata));

    if (order.quantita_ricevuta != null && order.quantita_ricevuta > 0) {
      row('Q.t\u00e0 gi\u00e0 versata', String(order.quantita_ricevuta));
    }

    doc.moveDown(0.8);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#888').stroke();
    doc.moveDown(0.8);

    if (order.note) {
      doc.font('Helvetica-Bold').text('Note: ', { continued: true });
      doc.font('Helvetica').text(order.note);
    }

    doc.end();
  });
}

// ── POST /api/reorders — crea ordine + scarica PDF direttamente
reordersRoutes.post('/reorders', authMiddleware, requireRole('admin', 'magazziniere'), async (req, res, next) => {
  try {
    const { spare_part_id, quantita_ordinata, note } = req.body as {
      spare_part_id?: string;
      quantita_ordinata?: number;
      note?: string;
    };
    if (!spare_part_id) return res.status(400).json({ error: 'spare_part_id è obbligatorio' });
    if (typeof quantita_ordinata !== 'number' || quantita_ordinata < 1) {
      return res.status(400).json({ error: 'quantita_ordinata deve essere un intero >= 1' });
    }

    // Verifica articolo esistente
    const partR = await pool.query('SELECT * FROM spare_parts WHERE id = $1', [spare_part_id]);
    if (!partR.rows.length) return res.status(404).json({ error: 'Ricambio non trovato' });

    // Verifica ordine aperto gi\u00e0 esistente
    const openR = await pool.query(
      `SELECT id FROM reorders WHERE spare_part_id = $1 AND status IN ('in_lavorazione','partial')`,
      [spare_part_id]
    );
    if (openR.rows.length) {
      return res.status(409).json({ error: 'Esiste gi\u00e0 un ordine aperto per questo articolo' });
    }

    // Crea ordine
    const { rows } = await pool.query(
      `INSERT INTO reorders (spare_part_id, quantita_ordinata, status, note, created_by)
       VALUES ($1, $2, 'in_lavorazione', $3, $4)
       RETURNING *`,
      [spare_part_id, quantita_ordinata, note?.trim() ?? null, req.user!.id]
    );
    const order = rows[0];

    // Recupera username del creatore
    const userR = await pool.query('SELECT username FROM users WHERE id = $1', [req.user!.id]);
    const creatorUsername = userR.rows[0]?.username ?? req.user!.id;

    // Genera PDF in memoria
    const pdfBuf = await buildPdf(order, partR.rows[0], creatorUsername);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ordine-${order.numero_ordine}.pdf"`);
    res.setHeader('Content-Length', pdfBuf.length);
    res.setHeader('X-Order-Id', order.id);
    res.send(pdfBuf);
  } catch (e) { next(e); }
});

// ── GET /api/reorders
reordersRoutes.get('/reorders', authMiddleware, requireRole('admin', 'magazziniere'), async (req, res, next) => {
  try {
    const { status, from, to, spare_part_id, page = '1', limit = '20' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions: string[] = [];
    const values: any[] = [];

    if (status) {
      const statuses = status.split(',').map((s) => s.trim()).filter(Boolean);
      if (statuses.length) {
        values.push(statuses);
        conditions.push(`ro.status = ANY($${values.length})`);
      }
    }
    if (from) { values.push(from); conditions.push(`ro.created_at >= $${values.length}`); }
    if (to) { values.push(to); conditions.push(`ro.created_at <= $${values.length}`); }
    if (spare_part_id) { values.push(spare_part_id); conditions.push(`ro.spare_part_id = $${values.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const r = await pool.query(
      `SELECT ro.id, ro.numero_ordine, ro.spare_part_id, ro.quantita_ordinata,
              ro.quantita_ricevuta, ro.status, ro.note, ro.created_at, ro.updated_at,
              sp.codice, sp.name AS part_name, sp.tipologia AS part_tipologia,
              u.username AS created_by_username,
              COUNT(*) OVER() AS total_count
       FROM reorders ro
       JOIN spare_parts sp ON sp.id = ro.spare_part_id
       LEFT JOIN users u ON u.id = ro.created_by
       ${where}
       ORDER BY ro.created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limitNum, offset]
    );

    const total = r.rows[0]?.total_count ?? 0;
    res.json({ items: r.rows, total, page: pageNum, limit: limitNum });
  } catch (e) { next(e); }
});

// ── GET /api/reorders/:id
reordersRoutes.get('/reorders/:id', authMiddleware, requireRole('admin', 'magazziniere'), async (req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT ro.*, sp.codice, sp.name AS part_name, sp.tipologia AS part_tipologia,
              sp.quantita AS part_giacenza_attuale,
              sp.scorta_minima, sp.quantita_riordino,
              u.username AS created_by_username
       FROM reorders ro
       JOIN spare_parts sp ON sp.id = ro.spare_part_id
       LEFT JOIN users u ON u.id = ro.created_by
       WHERE ro.id = $1`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Ordine non trovato' });
    res.json({ item: r.rows[0] });
  } catch (e) { next(e); }
});

// ── GET /api/reorders/:id/pdf — rigenera PDF
reordersRoutes.get('/reorders/:id/pdf', authMiddleware, requireRole('admin', 'magazziniere'), async (req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT ro.*, sp.codice, sp.name, sp.tipologia,
              u.username AS created_by_username
       FROM reorders ro
       JOIN spare_parts sp ON sp.id = ro.spare_part_id
       LEFT JOIN users u ON u.id = ro.created_by
       WHERE ro.id = $1`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Ordine non trovato' });
    const order = r.rows[0];
    const part = { codice: order.codice, name: order.name, tipologia: order.tipologia };
    const pdfBuf = await buildPdf(order, part, order.created_by_username ?? 'N/D');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ordine-${order.numero_ordine}.pdf"`);
    res.setHeader('Content-Length', pdfBuf.length);
    res.send(pdfBuf);
  } catch (e) { next(e); }
});

// ── PATCH /api/reorders/:id/versamento
reordersRoutes.patch('/reorders/:id/versamento', authMiddleware, requireRole('admin', 'magazziniere'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { quantita_versata } = req.body as { quantita_versata?: number };
    if (typeof quantita_versata !== 'number' || !Number.isInteger(quantita_versata) || quantita_versata < 1) {
      return res.status(400).json({ error: 'quantita_versata deve essere un intero >= 1' });
    }

    const check = await pool.query('SELECT * FROM reorders WHERE id = $1', [id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Ordine non trovato' });
    const current = check.rows[0];
    if (['completed', 'cancelled'].includes(current.status)) {
      return res.status(400).json({ error: `Non è possibile registrare versamenti su un ordine in stato '${current.status}'` });
    }

    // Aggiorna ordine
    const { rows } = await pool.query(
      `UPDATE reorders
       SET quantita_ricevuta = quantita_ricevuta + $1,
           status = CASE
             WHEN quantita_ricevuta + $1 >= quantita_ordinata THEN 'completed'
             ELSE 'partial'
           END,
           updated_at = now()
       WHERE id = $2
       RETURNING spare_part_id, quantita_ricevuta, quantita_ordinata, status, numero_ordine`,
      [quantita_versata, id]
    );
    const updated = rows[0];

    // Aggiorna giacenza ricambio
    const { rows: partRows } = await pool.query(
      `UPDATE spare_parts SET quantita = quantita + $1, updated_at = now()
       WHERE id = $2 RETURNING id, quantita`,
      [quantita_versata, updated.spare_part_id]
    );

    // Scrivi movimento
    await pool.query(
      `INSERT INTO spare_parts_movimenti
         (spare_part_id, tipo, delta, quantita_dopo, riferimento_id, riferimento_tipo, actor_id)
       VALUES ($1, 'versamento_riordine', $2, $3, $4, 'reorder', $5)`,
      [partRows[0].id, quantita_versata, partRows[0].quantita, id, req.user!.id]
    );

    res.json({
      ok: true,
      status: updated.status,
      quantita_ricevuta: updated.quantita_ricevuta,
      quantita_ordinata: updated.quantita_ordinata,
      giacenza_aggiornata: partRows[0].quantita,
    });
  } catch (e) { next(e); }
});

// ── PATCH /api/reorders/:id/cancel
reordersRoutes.patch('/reorders/:id/cancel', authMiddleware, requireRole('admin', 'magazziniere'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const check = await pool.query('SELECT * FROM reorders WHERE id = $1', [id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Ordine non trovato' });
    const current = check.rows[0];
    if (current.status !== 'in_lavorazione') {
      return res.status(400).json({ error: 'Solo gli ordini in stato \'in_lavorazione\' possono essere annullati' });
    }
    if (current.quantita_ricevuta > 0) {
      return res.status(400).json({ error: 'Non \u00e8 possibile annullare un ordine con versamenti gi\u00e0 registrati' });
    }
    await pool.query(`UPDATE reorders SET status = 'cancelled', updated_at = now() WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
