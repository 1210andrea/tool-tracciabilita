import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../db';

export const sparepartsRoutes = Router();

sparepartsRoutes.get('/spare-parts', authMiddleware, async (_req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT sp.*, COUNT(c.id)::int AS usage_count
       FROM spare_parts sp
       LEFT JOIN cases c ON c.spare_part_id = sp.id
       GROUP BY sp.id
       ORDER BY sp.created_at DESC`
    );
    res.json({ items: r.rows });
  } catch (e) {
    next(e);
  }
});

sparepartsRoutes.get('/spare-parts/by-type/:type', authMiddleware, async (req, res, next) => {
  try {
    // Compatibilità temporanea con lo schema attuale (spare_parts.type).
    // NOTA: quando verrà applicata la migrazione many-to-many spare_part_types, questa route andrà aggiornata.
    const r = await pool.query(
      'SELECT id, name, type, description, created_at FROM spare_parts WHERE type = $1 ORDER BY name',
      [req.params.type]
    );
    res.json({ items: r.rows });
  } catch (e) {
    next(e);
  }
});


sparepartsRoutes.post('/spare-parts', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    const { name, type, description } = req.body as { name?: string; type?: string; description?: string };
    if (!name?.trim() || !type?.trim()) {
      return res.status(400).json({ error: 'name e type sono obbligatori' });
    }

    const r = await pool.query(
      'INSERT INTO spare_parts(name, type, description) VALUES($1, $2, $3) RETURNING *',
      [name.trim(), type.trim(), description?.trim() ?? null]
    );
    res.json({ item: r.rows[0] });
  } catch (e) {
    next(e);
  }
});

sparepartsRoutes.delete('/spare-parts/:id', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    const usedR = await pool.query('SELECT COUNT(*)::int AS count FROM cases WHERE spare_part_id = $1', [req.params.id]);
    const count = usedR.rows[0]?.count ?? 0;
    if (count > 0) {
      return res.status(400).json({ error: `In uso da ${count} casi`, usage_count: count });
    }

    const r = await pool.query('DELETE FROM spare_parts WHERE id = $1 RETURNING id', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Ricambio non trovato' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

sparepartsRoutes.get('/solutions-applied', authMiddleware, async (_req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT sa.*, COUNT(c.id)::int AS usage_count
       FROM solutions_applied sa
       LEFT JOIN cases c ON c.solution_applied_id = sa.id
       GROUP BY sa.id
       ORDER BY sa.created_at DESC`
    );
    res.json({ items: r.rows });
  } catch (e) {
    next(e);
  }
});

sparepartsRoutes.post('/solutions-applied', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    const { name, description } = req.body as { name?: string; description?: string };
    if (!name?.trim()) return res.status(400).json({ error: 'name è obbligatorio' });

    const r = await pool.query(
      'INSERT INTO solutions_applied(name, description) VALUES($1, $2) RETURNING *',
      [name.trim(), description?.trim() ?? null]
    );
    res.json({ item: r.rows[0] });
  } catch (e) {
    next(e);
  }
});

sparepartsRoutes.delete('/solutions-applied/:id', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    const usedR = await pool.query('SELECT COUNT(*)::int AS count FROM cases WHERE solution_applied_id = $1', [req.params.id]);
    const count = usedR.rows[0]?.count ?? 0;
    if (count > 0) {
      return res.status(400).json({ error: `In uso da ${count} casi`, usage_count: count });
    }

    const r = await pool.query('DELETE FROM solutions_applied WHERE id = $1 RETURNING id', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Soluzione non trovata' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
