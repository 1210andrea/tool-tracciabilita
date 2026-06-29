import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../db';

export const sparepartsRoutes = Router();

sparepartsRoutes.get('/spare-parts', authMiddleware, async (_req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT sp.id,
              sp.name,
              sp.description,
              sp.created_at,
              COUNT(c.id)::int AS usage_count,
              COALESCE(ARRAY_AGG(spt.type) FILTER (WHERE spt.type IS NOT NULL), '{}') AS types
       FROM spare_parts sp
       LEFT JOIN spare_part_types spt ON spt.spare_part_id = sp.id
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
    const r = await pool.query(
      `SELECT sp.id, sp.name, sp.description, sp.created_at,
              ARRAY_AGG(spt.type) FILTER (WHERE spt.type IS NOT NULL) AS types
       FROM spare_parts sp
       JOIN spare_part_types spt ON spt.spare_part_id = sp.id AND spt.type = $1
       GROUP BY sp.id
       ORDER BY sp.name`,
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

    const { name, description, types } = req.body as {
      name?: string;
      description?: string;
      types?: string[];
    };

    if (!name?.trim()) {
      return res.status(400).json({ error: 'name è obbligatorio' });
    }

    const cleanedTypes = Array.isArray(types)
      ? types.map((t) => String(t).trim()).filter((t) => Boolean(t))
      : [];

    if (!cleanedTypes.length) {
      return res.status(400).json({ error: 'types (array di tipi/reparti) è obbligatorio' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const spR = await client.query(
        'INSERT INTO spare_parts(name, description) VALUES($1,$2) RETURNING id, name, description, created_at',
        [name.trim(), description?.trim() ?? null]
      );

      const sparePartId = spR.rows[0].id as string;

      const values: any[] = [];
      const placeholders = cleanedTypes.map((t, idx) => {
        values.push(sparePartId, t);
        return `($${idx * 2 + 1}, $${idx * 2 + 2})`;
      });

      await client.query(
        `INSERT INTO spare_part_types(spare_part_id, type)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT(spare_part_id, type) DO NOTHING`,
        values
      );

      await client.query('COMMIT');

      res.json({
        item: {
          id: sparePartId,
          name: spR.rows[0].name,
          description: spR.rows[0].description,
          types: cleanedTypes
        }
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
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

    await pool.query('DELETE FROM spare_parts WHERE id = $1', [req.params.id]);
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
