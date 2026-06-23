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
              COUNT(csp.id)::int AS usage_count,
              COALESCE(ARRAY_AGG(spt.tipologia) FILTER (WHERE spt.tipologia IS NOT NULL), '{}') AS tipologie
       FROM spare_parts sp
       LEFT JOIN spare_part_tipologie spt ON spt.spare_part_id = sp.id
       LEFT JOIN case_spare_parts csp ON csp.spare_part_id = sp.id
       GROUP BY sp.id
       ORDER BY sp.name ASC`
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
              COALESCE(ARRAY_AGG(spt.tipologia) FILTER (WHERE spt.tipologia IS NOT NULL), '{}') AS tipologie
       FROM spare_parts sp
       JOIN spare_part_tipologie spt ON spt.spare_part_id = sp.id AND spt.tipologia = $1
       GROUP BY sp.id
       ORDER BY sp.name ASC`,
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

    const { name, description, tipologie, types } = req.body as {
      name?: string;
      description?: string;
      tipologie?: string[];
      types?: string[];
    };

    if (!name?.trim()) {
      return res.status(400).json({ error: 'name è obbligatorio' });
    }

    const raw = Array.isArray(tipologie) && tipologie.length ? tipologie : (Array.isArray(types) ? types : []);
    const cleanedTipologie = raw.map((t) => String(t).trim()).filter(Boolean);

    if (!cleanedTipologie.length) {
      return res.status(400).json({ error: 'tipologie (array) è obbligatorio' });
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
      const placeholders = cleanedTipologie.map((t, idx) => {
        values.push(sparePartId, t);
        return `($${idx * 2 + 1}, $${idx * 2 + 2})`;
      });

      await client.query(
        `INSERT INTO spare_part_tipologie(spare_part_id, tipologia)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT(spare_part_id, tipologia) DO NOTHING`,
        values
      );

      await client.query('COMMIT');

      res.json({
        item: {
          id: sparePartId,
          name: spR.rows[0].name,
          description: spR.rows[0].description,
          tipologie: cleanedTipologie
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

sparepartsRoutes.put('/spare-parts/:id', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    const { id } = req.params;
    const { name, description, tipologie } = req.body as {
      name?: string;
      description?: string;
      tipologie?: string[];
    };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const r = await client.query(
        `UPDATE spare_parts SET name = COALESCE($1, name), description = COALESCE($2, description) WHERE id = $3 RETURNING *`,
        [name?.trim() ?? null, description?.trim() ?? null, id]
      );
      if (!r.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Ricambio non trovato' });
      }

      if (Array.isArray(tipologie)) {
        await client.query('DELETE FROM spare_part_tipologie WHERE spare_part_id = $1', [id]);
        const cleaned = tipologie.map((t) => String(t).trim()).filter(Boolean);
        if (cleaned.length) {
          const vals: any[] = [];
          const ph = cleaned.map((t, idx) => {
            vals.push(id, t);
            return `($${idx * 2 + 1}, $${idx * 2 + 2})`;
          });
          await client.query(
            `INSERT INTO spare_part_tipologie(spare_part_id, tipologia) VALUES ${ph.join(', ')} ON CONFLICT DO NOTHING`,
            vals
          );
        }
      }

      await client.query('COMMIT');
      res.json({ item: r.rows[0] });
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

    const usedR = await pool.query('SELECT COUNT(*)::int AS count FROM case_spare_parts WHERE spare_part_id = $1', [req.params.id]);
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

// GET tutte le soluzioni
sparepartsRoutes.get('/solutions-applied', authMiddleware, async (_req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT sa.id, sa.name, sa.description, sa.created_at,
              ((SELECT COUNT(*)::int FROM case_solutions_applied csa WHERE csa.solution_id = sa.id) +
               (SELECT COUNT(*)::int FROM case_solutions_tried cst WHERE cst.solution_id = sa.id))::int AS usage_count
       FROM solutions_applied sa
       ORDER BY sa.name ASC`
    );
    res.json({ items: r.rows });
  } catch (e) {
    next(e);
  }
});

// POST nuova soluzione
sparepartsRoutes.post('/solutions-applied', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    const { name, description } = req.body as {
      name?: string;
      description?: string;
    };
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

// DELETE soluzione
sparepartsRoutes.delete('/solutions-applied/:id', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    const usedR = await pool.query(
      `SELECT
        (SELECT COUNT(*)::int FROM case_solutions_applied WHERE solution_id = $1) +
        (SELECT COUNT(*)::int FROM case_solutions_tried WHERE solution_id = $1) AS count`,
      [req.params.id]
    );
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
