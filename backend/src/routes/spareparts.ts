import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth';
import { pool } from '../db';

export const sparepartsRoutes = Router();

const WAREHOUSE_ROLES = ['admin', 'magazziniere'] as const;

// ── GET /api/spare-parts/sotto-scorta ───────────────────────────────────────
sparepartsRoutes.get(
  '/spare-parts/sotto-scorta',
  authMiddleware,
  requireRole(...WAREHOUSE_ROLES),
  async (_req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT sp.id, sp.codice, sp.name, sp.quantita, sp.scorta_minima,
                COALESCE(sp.quantita_riordino, 10) AS quantita_riordino,
                (sp.quantita < 0) AS giacenza_negativa,
                (sp.quantita >= 0 AND sp.quantita <= sp.scorta_minima) AS sotto_scorta,
                EXISTS (
                  SELECT 1 FROM reorders ord
                  WHERE ord.spare_part_id = sp.id AND ord.status IN ('in_lavorazione','partial')
                ) AS ordine_aperto
         FROM spare_parts sp
         WHERE sp.quantita <= sp.scorta_minima
         ORDER BY sp.name ASC`
      );
      res.json({ items: result.rows });
    } catch (e) { next(e); }
  }
);

// ── GET /api/spare-parts/by-type/:type ─────────────────────────────────────
sparepartsRoutes.get('/spare-parts/by-type/:type', authMiddleware, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT sp.id, sp.name, sp.description, sp.codice, sp.quantita, sp.scorta_minima,
              COALESCE(sp.quantita_riordino, 10) AS quantita_riordino, sp.created_at
       FROM spare_parts sp
       WHERE sp.tipologia = $1
       ORDER BY sp.name ASC`,
      [req.params.type]
    );
    res.json({ items: result.rows });
  } catch (e) { next(e); }
});

// ── POST /api/spare-parts ────────────────────────────────────────────────────
sparepartsRoutes.post(
  '/spare-parts',
  authMiddleware,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const { name, description, codice, tipologia, quantita, scorta_minima, quantita_riordino } = req.body as {
        name?: string; description?: string; codice?: string; tipologia?: string;
        quantita?: number; scorta_minima?: number; quantita_riordino?: number;
      };
      if (!name?.trim()) return res.status(400).json({ error: 'name è obbligatorio' });
      const result = await pool.query(
        `INSERT INTO spare_parts(name, description, codice, tipologia, quantita, scorta_minima, quantita_riordino)
         VALUES($1,$2,$3,$4,$5,$6,$7)
         RETURNING *`,
        [name.trim(), description?.trim() ?? null, codice?.trim() ?? null,
         tipologia?.trim() ?? null, quantita ?? 0, scorta_minima ?? 1, quantita_riordino ?? 10]
      );
      res.json({ item: result.rows[0] });
    } catch (e) { next(e); }
  }
);

// ── PUT /api/spare-parts/:id ─────────────────────────────────────────────────
sparepartsRoutes.put(
  '/spare-parts/:id',
  authMiddleware,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const { name, description, codice, tipologia, quantita, scorta_minima, quantita_riordino } = req.body as {
        name?: string; description?: string; codice?: string; tipologia?: string;
        quantita?: number; scorta_minima?: number; quantita_riordino?: number;
      };
      if (!name?.trim()) return res.status(400).json({ error: 'name è obbligatorio' });
      const result = await pool.query(
        `UPDATE spare_parts
         SET name              = $1,
             description       = $2,
             codice            = $3,
             tipologia         = $4,
             quantita          = COALESCE($5, quantita),
             scorta_minima     = COALESCE($6, scorta_minima),
             quantita_riordino = COALESCE($7, quantita_riordino),
             updated_at        = now()
         WHERE id = $8
         RETURNING *`,
        [
          name.trim(),
          description?.trim() ?? null,
          codice?.trim() ?? null,
          tipologia?.trim() ?? null,
          quantita ?? null,
          scorta_minima ?? null,
          quantita_riordino ?? null,
          req.params.id,
        ]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Ricambio non trovato' });
      res.json({ item: result.rows[0] });
    } catch (e) { next(e); }
  }
);

// ── DELETE /api/spare-parts/:id ──────────────────────────────────────────────
sparepartsRoutes.delete(
  '/spare-parts/:id',
  authMiddleware,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const result = await pool.query(
        `DELETE FROM spare_parts WHERE id = $1 RETURNING id`,
        [req.params.id]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Ricambio non trovato' });
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);

// ── GET /api/solutions-applied ───────────────────────────────────────────────
sparepartsRoutes.get('/solutions-applied', authMiddleware, async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT * FROM solutions_applied ORDER BY created_at DESC`
    );
    res.json({ items: result.rows });
  } catch (e) { next(e); }
});

// ── POST /api/solutions-applied ─────────────────────────────────────────────
sparepartsRoutes.post('/solutions-applied', authMiddleware, async (req, res, next) => {
  try {
    const { name, description, category } = req.body as {
      name?: string; description?: string; category?: string;
    };
    if (!name?.trim()) return res.status(400).json({ error: 'name è obbligatorio' });
    const result = await pool.query(
      `INSERT INTO solutions_applied(name, description, category) VALUES($1,$2,$3) RETURNING *`,
      [name.trim(), description?.trim() ?? null, category?.trim() ?? null]
    );
    res.json({ item: result.rows[0] });
  } catch (e) { next(e); }
});

// ── PUT /api/solutions-applied/:id ──────────────────────────────────────────
sparepartsRoutes.put('/solutions-applied/:id', authMiddleware, async (req, res, next) => {
  try {
    const { name, description, category } = req.body as {
      name?: string; description?: string; category?: string;
    };
    const result = await pool.query(
      `UPDATE solutions_applied
       SET name        = COALESCE($1, name),
           description = COALESCE($2, description),
           category    = COALESCE($3, category)
       WHERE id = $4 RETURNING *`,
      [name?.trim() ?? null, description?.trim() ?? null, category?.trim() ?? null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Soluzione non trovata' });
    res.json({ item: result.rows[0] });
  } catch (e) { next(e); }
});

// ── DELETE /api/solutions-applied/:id ───────────────────────────────────────
sparepartsRoutes.delete('/solutions-applied/:id', authMiddleware, async (req, res, next) => {
  try {
    const result = await pool.query(
      `DELETE FROM solutions_applied WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Soluzione non trovata' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
