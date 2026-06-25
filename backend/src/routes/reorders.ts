import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../db';

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

    // Recupera tutti i pezzi sotto scorta minima
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

      // Verifica che la riga appartenga all'ordine
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
      const newRicevuta = quantita_ricevuta;
      const newStatus = newRicevuta >= Number(row.quantita_ordinata) ? 'completed'
        : newRicevuta > 0 ? 'partial' : 'pending';

      // Aggiorna la riga
      await client.query(
        `UPDATE reorder_items
         SET quantita_ricevuta = $1, status = $2, updated_at = now()
         WHERE id = $3`,
        [newRicevuta, newStatus, itemId]
      );

      // Aggiorna la giacenza in spare_parts solo se delta > 0
      if (delta > 0) {
        await client.query(
          `UPDATE spare_parts SET quantita = quantita + $1, updated_at = now() WHERE id = $2`,
          [delta, row.sp_id]
        );
      }

      // Aggiorna lo status dell'ordine testata
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
