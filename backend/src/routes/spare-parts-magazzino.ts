import { Router } from 'express';
import PDFDocument from 'pdfkit';
import { authMiddleware, requireRole } from '../middleware/auth';
import { pool } from '../db';

export const sparePartsMagazzinoRoutes = Router();

// Helper: calcola flags giacenza
function calcFlags(quantita: number, scorta_minima: number, ordine_aperto: boolean) {
  return {
    giacenza_negativa: quantita < 0,
    sotto_scorta: quantita >= 0 && quantita <= scorta_minima,
    ordine_aperto,
  };
}

// ─────────────────────────────────────────────────────────────
// GET /api/spare-parts  (override con campi magazzino)
// ─────────────────────────────────────────────────────────────
sparePartsMagazzinoRoutes.get(
  '/spare-parts',
  authMiddleware,
  requireRole('admin', 'magazziniere'),
  async (_req, res, next) => {
    try {
      const r = await pool.query(`
        SELECT
          sp.id, sp.name, sp.description,
          sp.codice, sp.tipologia,
          sp.quantita, sp.scorta_minima, sp.quantita_riordino,
          sp.created_at,
          EXISTS (
            SELECT 1 FROM reorders r
            WHERE r.spare_part_id = sp.id
              AND r.status IN ('in_lavorazione','partial')
          ) AS ordine_aperto
        FROM spare_parts sp
        ORDER BY sp.name ASC
      `);

      const items = r.rows.map((row) => ({
        ...row,
        ...calcFlags(row.quantita, row.scorta_minima, row.ordine_aperto),
      }));

      res.json({ items });
    } catch (e) {
      next(e);
    }
  }
);

// ─────────────────────────────────────────────────────────────
// GET /api/spare-parts/:id
// ─────────────────────────────────────────────────────────────
sparePartsMagazzinoRoutes.get(
  '/spare-parts/:id',
  authMiddleware,
  requireRole('admin', 'magazziniere'),
  async (req, res, next) => {
    try {
      const r = await pool.query(
        `SELECT sp.*,
          EXISTS (
            SELECT 1 FROM reorders r
            WHERE r.spare_part_id = sp.id
              AND r.status IN ('in_lavorazione','partial')
          ) AS ordine_aperto
         FROM spare_parts sp WHERE sp.id = $1`,
        [req.params.id]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Ricambio non trovato' });
      const row = r.rows[0];
      res.json({ item: { ...row, ...calcFlags(row.quantita, row.scorta_minima, row.ordine_aperto) } });
    } catch (e) {
      next(e);
    }
  }
);

// ─────────────────────────────────────────────────────────────
// PATCH /api/spare-parts/:id  (modifica codice, tipologia, scorta_minima, quantita_riordino)
// ─────────────────────────────────────────────────────────────
sparePartsMagazzinoRoutes.patch(
  '/spare-parts/:id',
  authMiddleware,
  requireRole('admin', 'magazziniere'),
  async (req, res, next) => {
    try {
      const { codice, tipologia, scorta_minima, quantita_riordino } = req.body as {
        codice?: string;
        tipologia?: string;
        scorta_minima?: number;
        quantita_riordino?: number;
      };
      const r = await pool.query(
        `UPDATE spare_parts
         SET codice = COALESCE($1, codice),
             tipologia = COALESCE($2, tipologia),
             scorta_minima = COALESCE($3, scorta_minima),
             quantita_riordino = COALESCE($4, quantita_riordino),
             updated_at = now()
         WHERE id = $5
         RETURNING *`,
        [codice ?? null, tipologia ?? null, scorta_minima ?? null, quantita_riordino ?? null, req.params.id]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Ricambio non trovato' });
      res.json({ item: r.rows[0] });
    } catch (e) {
      next(e);
    }
  }
);

// ─────────────────────────────────────────────────────────────
// PATCH /api/spare-parts/:id/scalare  (chiamato alla chiusura caso)
// ─────────────────────────────────────────────────────────────
sparePartsMagazzinoRoutes.patch(
  '/spare-parts/:id/scalare',
  authMiddleware, // tutti gli autenticati
  async (req, res, next) => {
    try {
      const { case_id, quantita = 1 } = req.body as { case_id?: string; quantita?: number };
      const userId = (req as any).user?.id;
      const partId = req.params.id;

      const { rows } = await pool.query(
        `UPDATE spare_parts
         SET quantita = quantita - $1, updated_at = now()
         WHERE id = $2
         RETURNING id, quantita, scorta_minima`,
        [quantita, partId]
      );

      if (!rows.length) return res.status(404).json({ error: 'Ricambio non trovato' });

      await pool.query(
        `INSERT INTO spare_parts_movimenti
           (spare_part_id, tipo, delta, quantita_dopo, riferimento_id, riferimento_tipo, actor_id)
         VALUES ($1,'scarico_manutenzione',$2,$3,$4,'case',$5)`,
        [partId, -quantita, rows[0].quantita, case_id ?? null, userId]
      );

      // Restituisce la lista pezzi con avvisi per il banner post-chiusura
      const alertR = await pool.query(
        `SELECT id, name, codice, quantita, scorta_minima
         FROM spare_parts
         WHERE quantita < 0 OR (quantita >= 0 AND quantita <= scorta_minima)`
      );

      const pezzi_sotto_scorta = alertR.rows.map((p) => ({
        ...p,
        giacenza_negativa: p.quantita < 0,
        sotto_scorta: p.quantita >= 0 && p.quantita <= p.scorta_minima,
      }));

      res.json({ item: rows[0], pezzi_sotto_scorta });
    } catch (e) {
      next(e);
    }
  }
);

// ─────────────────────────────────────────────────────────────
// PATCH /api/spare-parts/:id/rettifica
// ─────────────────────────────────────────────────────────────
sparePartsMagazzinoRoutes.patch(
  '/spare-parts/:id/rettifica',
  authMiddleware,
  requireRole('admin', 'magazziniere'),
  async (req, res, next) => {
    try {
      const { delta, note } = req.body as { delta?: number; note?: string };
      const userId = (req as any).user?.id;

      if (!note || note.trim() === '') {
        return res.status(400).json({ error: 'La nota è obbligatoria' });
      }
      if (delta === undefined || delta === 0) {
        return res.status(400).json({ error: 'delta è obbligatorio e non può essere 0' });
      }

      const { rows } = await pool.query(
        `UPDATE spare_parts
         SET quantita = quantita + $1, updated_at = now()
         WHERE id = $2
         RETURNING id, quantita, scorta_minima`,
        [delta, req.params.id]
      );

      if (!rows.length) return res.status(404).json({ error: 'Ricambio non trovato' });

      await pool.query(
        `INSERT INTO spare_parts_movimenti
           (spare_part_id, tipo, delta, quantita_dopo, riferimento_tipo, note, actor_id)
         VALUES ($1,'rettifica_manuale',$2,$3,'manuale',$4,$5)`,
        [req.params.id, delta, rows[0].quantita, note, userId]
      );

      res.json({ item: rows[0] });
    } catch (e) {
      next(e);
    }
  }
);

// ─────────────────────────────────────────────────────────────
// GET /api/spare-parts/:id/movimenti
// ─────────────────────────────────────────────────────────────
sparePartsMagazzinoRoutes.get(
  '/spare-parts/:id/movimenti',
  authMiddleware,
  requireRole('admin', 'magazziniere'),
  async (req, res, next) => {
    try {
      const { tipo, from, to, actor_id, page = '1', limit = '20' } = req.query as Record<string, string>;
      const pageN = Math.max(1, Number(page));
      const limitN = Math.min(100, Math.max(1, Number(limit)));
      const offset = (pageN - 1) * limitN;

      const conditions: string[] = ['m.spare_part_id = $1'];
      const values: any[] = [req.params.id];

      if (tipo) { values.push(tipo); conditions.push(`m.tipo = $${values.length}`); }
      if (from) { values.push(from); conditions.push(`m.created_at >= $${values.length}`); }
      if (to) { values.push(to); conditions.push(`m.created_at <= $${values.length}`); }
      if (actor_id) { values.push(actor_id); conditions.push(`m.actor_id = $${values.length}`); }

      const where = conditions.join(' AND ');

      const r = await pool.query(
        `SELECT
           m.*,
           u.username AS actor_username,
           CASE
             WHEN m.riferimento_tipo = 'reorder'
               THEN (SELECT numero_ordine::text FROM reorders WHERE id = m.riferimento_id)
             WHEN m.riferimento_tipo = 'case'
               THEN LEFT(m.riferimento_id::text, 8)
             ELSE NULL
           END AS riferimento_numero,
           COUNT(*) OVER() AS total_count
         FROM spare_parts_movimenti m
         LEFT JOIN users u ON u.id = m.actor_id
         WHERE ${where}
         ORDER BY m.created_at DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limitN, offset]
      );

      res.json({ items: r.rows, total: r.rows[0]?.total_count ?? 0 });
    } catch (e) {
      next(e);
    }
  }
);

// ─────────────────────────────────────────────────────────────
// Helper: genera PDF ordine in memoria con pdfkit
// ─────────────────────────────────────────────────────────────
function buildOrderPdf(
  doc: InstanceType<typeof PDFDocument>,
  order: any,
  part: any,
  creatorUsername: string
) {
  const fmtDate = (d: Date | string) =>
    new Date(d).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });

  const statusLabel: Record<string, string> = {
    in_lavorazione: 'IN LAVORAZIONE',
    partial: 'PARZIALE',
    completed: 'COMPLETATO',
    cancelled: 'ANNULLATO',
  };

  doc.fontSize(18).font('Helvetica-Bold').text(`ORDINE INTERNO N° ${order.numero_ordine}`, { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).font('Helvetica');
  doc.text(`Data: ${fmtDate(order.created_at)}    Creato da: ${creatorUsername}`);
  doc.text(`Stato: ${statusLabel[order.status] ?? order.status}`);
  doc.moveDown();

  doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).dash(1, { space: 2 }).stroke();
  doc.undash().moveDown(0.5);

  doc.font('Helvetica-Bold').text('Codice articolo  : ', { continued: true }).font('Helvetica').text(part.codice ?? 'N/D');
  doc.font('Helvetica-Bold').text('Descrizione      : ', { continued: true }).font('Helvetica').text(part.name ?? 'N/D');
  doc.font('Helvetica-Bold').text('Tipologia        : ', { continued: true }).font('Helvetica').text(part.tipologia ?? 'N/D');
  doc.font('Helvetica-Bold').text('Q.tà ordinata    : ', { continued: true }).font('Helvetica').text(String(order.quantita_ordinata));

  if (order.quantita_ricevuta !== undefined && order.quantita_ricevuta > 0) {
    doc.font('Helvetica-Bold').text('Q.tà già versata : ', { continued: true }).font('Helvetica').text(String(order.quantita_ricevuta));
  }

  doc.moveDown(0.5);
  doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).dash(1, { space: 2 }).stroke();
  doc.undash().moveDown();

  if (order.note) {
    doc.font('Helvetica-Bold').text('Note: ', { continued: true }).font('Helvetica').text(order.note);
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/reorders  — crea ordine + scarica PDF in-memory
// ─────────────────────────────────────────────────────────────
sparePartsMagazzinoRoutes.post(
  '/reorders',
  authMiddleware,
  requireRole('admin', 'magazziniere'),
  async (req, res, next) => {
    try {
      const { spare_part_id, quantita_ordinata, note } = req.body as {
        spare_part_id?: string;
        quantita_ordinata?: number;
        note?: string;
      };
      const userId = (req as any).user?.id;

      if (!spare_part_id || !quantita_ordinata || quantita_ordinata < 1) {
        return res.status(400).json({ error: 'spare_part_id e quantita_ordinata (>=1) sono obbligatori' });
      }

      // Controlla ordine aperto esistente
      const existing = await pool.query(
        `SELECT id FROM reorders WHERE spare_part_id = $1 AND status IN ('in_lavorazione','partial')`,
        [spare_part_id]
      );
      if (existing.rows.length) {
        return res.status(409).json({ error: 'Esiste già un ordine aperto per questo articolo' });
      }

      // Crea ordine
      const { rows } = await pool.query(
        `INSERT INTO reorders (spare_part_id, quantita_ordinata, status, note, created_by)
         VALUES ($1, $2, 'in_lavorazione', $3, $4)
         RETURNING *`,
        [spare_part_id, quantita_ordinata, note ?? null, userId]
      );
      const order = rows[0];

      // Recupera dati articolo
      const partR = await pool.query(`SELECT * FROM spare_parts WHERE id = $1`, [spare_part_id]);
      const part = partR.rows[0];

      // Recupera username creatore
      const userR = await pool.query(`SELECT username FROM users WHERE id = $1`, [userId]);
      const creatorUsername = userR.rows[0]?.username ?? 'N/D';

      // Genera PDF in memoria
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="ordine-${order.numero_ordine}.pdf"`);
        res.setHeader('Content-Length', String(pdfBuffer.length));
        // Invia anche l'id ordine come header per aggiornare la UI
        res.setHeader('X-Order-Id', order.id);
        res.end(pdfBuffer);
      });

      buildOrderPdf(doc, order, part, creatorUsername);
      doc.end();
    } catch (e) {
      next(e);
    }
  }
);

// ─────────────────────────────────────────────────────────────
// GET /api/reorders
// ─────────────────────────────────────────────────────────────
sparePartsMagazzinoRoutes.get(
  '/reorders',
  authMiddleware,
  requireRole('admin', 'magazziniere'),
  async (req, res, next) => {
    try {
      const { status, from, to, spare_part_id, page = '1', limit = '20' } = req.query as Record<string, string>;
      const pageN = Math.max(1, Number(page));
      const limitN = Math.min(100, Math.max(1, Number(limit)));
      const offset = (pageN - 1) * limitN;

      const conditions: string[] = [];
      const values: any[] = [];

      if (status) {
        const statuses = status.split(',').map((s) => s.trim()).filter(Boolean);
        if (statuses.length) { values.push(statuses); conditions.push(`r.status = ANY($${values.length})`); }
      }
      if (from) { values.push(from); conditions.push(`r.created_at >= $${values.length}`); }
      if (to) { values.push(to); conditions.push(`r.created_at <= $${values.length}`); }
      if (spare_part_id) { values.push(spare_part_id); conditions.push(`r.spare_part_id = $${values.length}`); }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const r = await pool.query(
        `SELECT
           r.*,
           sp.name AS spare_part_name,
           sp.codice AS spare_part_codice,
           sp.tipologia AS spare_part_tipologia,
           u.username AS created_by_username,
           COUNT(*) OVER() AS total_count
         FROM reorders r
         JOIN spare_parts sp ON sp.id = r.spare_part_id
         LEFT JOIN users u ON u.id = r.created_by
         ${where}
         ORDER BY r.created_at DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limitN, offset]
      );

      res.json({ items: r.rows, total: r.rows[0]?.total_count ?? 0 });
    } catch (e) {
      next(e);
    }
  }
);

// ─────────────────────────────────────────────────────────────
// GET /api/reorders/:id
// ─────────────────────────────────────────────────────────────
sparePartsMagazzinoRoutes.get(
  '/reorders/:id',
  authMiddleware,
  requireRole('admin', 'magazziniere'),
  async (req, res, next) => {
    try {
      const r = await pool.query(
        `SELECT r.*, sp.*, u.username AS created_by_username
         FROM reorders r
         JOIN spare_parts sp ON sp.id = r.spare_part_id
         LEFT JOIN users u ON u.id = r.created_by
         WHERE r.id = $1`,
        [req.params.id]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Ordine non trovato' });
      res.json({ item: r.rows[0] });
    } catch (e) {
      next(e);
    }
  }
);

// ─────────────────────────────────────────────────────────────
// GET /api/reorders/:id/pdf  — re-download PDF
// ─────────────────────────────────────────────────────────────
sparePartsMagazzinoRoutes.get(
  '/reorders/:id/pdf',
  authMiddleware,
  requireRole('admin', 'magazziniere'),
  async (req, res, next) => {
    try {
      const r = await pool.query(
        `SELECT r.*, sp.name, sp.codice, sp.tipologia, u.username AS created_by_username
         FROM reorders r
         JOIN spare_parts sp ON sp.id = r.spare_part_id
         LEFT JOIN users u ON u.id = r.created_by
         WHERE r.id = $1`,
        [req.params.id]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Ordine non trovato' });

      const row = r.rows[0];
      const order = row;
      const part = { name: row.name, codice: row.codice, tipologia: row.tipologia };
      const creatorUsername = row.created_by_username ?? 'N/D';

      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="ordine-${order.numero_ordine}.pdf"`);
        res.setHeader('Content-Length', String(pdfBuffer.length));
        res.end(pdfBuffer);
      });

      buildOrderPdf(doc, order, part, creatorUsername);
      doc.end();
    } catch (e) {
      next(e);
    }
  }
);

// ─────────────────────────────────────────────────────────────
// PATCH /api/reorders/:id/versamento
// ─────────────────────────────────────────────────────────────
sparePartsMagazzinoRoutes.patch(
  '/reorders/:id/versamento',
  authMiddleware,
  requireRole('admin', 'magazziniere'),
  async (req, res, next) => {
    try {
      const { quantita_versata } = req.body as { quantita_versata?: number };
      const userId = (req as any).user?.id;

      if (!quantita_versata || quantita_versata < 1) {
        return res.status(400).json({ error: 'quantita_versata deve essere >= 1' });
      }

      const checkR = await pool.query(`SELECT status FROM reorders WHERE id = $1`, [req.params.id]);
      if (!checkR.rows.length) return res.status(404).json({ error: 'Ordine non trovato' });
      if (['completed', 'cancelled'].includes(checkR.rows[0].status)) {
        return res.status(400).json({ error: `Non è possibile versare su un ordine ${checkR.rows[0].status}` });
      }

      const { rows } = await pool.query(
        `UPDATE reorders
         SET quantita_ricevuta = quantita_ricevuta + $1,
             status = CASE
               WHEN quantita_ricevuta + $1 >= quantita_ordinata THEN 'completed'
               ELSE 'partial'
             END,
             updated_at = now()
         WHERE id = $2
         RETURNING spare_part_id, quantita_ricevuta, status`,
        [quantita_versata, req.params.id]
      );

      const { rows: partRows } = await pool.query(
        `UPDATE spare_parts SET quantita = quantita + $1, updated_at = now()
         WHERE id = $2 RETURNING id, quantita`,
        [quantita_versata, rows[0].spare_part_id]
      );

      await pool.query(
        `INSERT INTO spare_parts_movimenti
           (spare_part_id, tipo, delta, quantita_dopo, riferimento_id, riferimento_tipo, actor_id)
         VALUES ($1,'versamento_riordine',$2,$3,$4,'reorder',$5)`,
        [partRows[0].id, quantita_versata, partRows[0].quantita, req.params.id, userId]
      );

      res.json({ item: rows[0] });
    } catch (e) {
      next(e);
    }
  }
);

// ─────────────────────────────────────────────────────────────
// PATCH /api/reorders/:id/cancel
// ─────────────────────────────────────────────────────────────
sparePartsMagazzinoRoutes.patch(
  '/reorders/:id/cancel',
  authMiddleware,
  requireRole('admin', 'magazziniere'),
  async (req, res, next) => {
    try {
      const checkR = await pool.query(
        `SELECT status, quantita_ricevuta FROM reorders WHERE id = $1`,
        [req.params.id]
      );
      if (!checkR.rows.length) return res.status(404).json({ error: 'Ordine non trovato' });

      const { status, quantita_ricevuta } = checkR.rows[0];
      if (status !== 'in_lavorazione') {
        return res.status(400).json({ error: 'Puoi annullare solo ordini in_lavorazione' });
      }
      if (quantita_ricevuta > 0) {
        return res.status(400).json({ error: 'Non è possibile annullare un ordine con versamenti già registrati' });
      }

      await pool.query(
        `UPDATE reorders SET status = 'cancelled', updated_at = now() WHERE id = $1`,
        [req.params.id]
      );

      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  }
);
