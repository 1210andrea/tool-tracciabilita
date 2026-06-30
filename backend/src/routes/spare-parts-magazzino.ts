import { Router } from 'express';
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
// GET /api/spare-parts
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
          ) AS ordine_aperto,
          (SELECT COUNT(*)::int FROM case_spare_parts csp WHERE csp.spare_part_id = sp.id) AS usage_count
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
// GET /api/spare-parts/:id/movimenti  (deve stare PRIMA di /:id)
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

      if (tipo)     { values.push(tipo);     conditions.push(`m.tipo = $${values.length}`); }
      if (from)     { values.push(from);     conditions.push(`m.created_at >= $${values.length}`); }
      if (to)       { values.push(to);       conditions.push(`m.created_at <= $${values.length}`); }
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
// PATCH /api/spare-parts/:id/scalare  (chiamato alla chiusura caso, tutti gli autenticati)
// ─────────────────────────────────────────────────────────────
sparePartsMagazzinoRoutes.patch(
  '/spare-parts/:id/scalare',
  authMiddleware,
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

      // Lista pezzi critici per il banner post-chiusura caso
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

      if (!note || note.trim() === '')
        return res.status(400).json({ error: 'La nota è obbligatoria' });
      if (delta === undefined || delta === 0)
        return res.status(400).json({ error: 'delta è obbligatorio e non può essere 0' });

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
// PATCH /api/spare-parts/:id  (aggiorna campi magazzino: codice, tipologia, scorta_minima, quantita_riordino)
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
         SET codice            = COALESCE($1, codice),
             tipologia         = COALESCE($2, tipologia),
             scorta_minima     = COALESCE($3, scorta_minima),
             quantita_riordino = COALESCE($4, quantita_riordino),
             updated_at        = now()
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
