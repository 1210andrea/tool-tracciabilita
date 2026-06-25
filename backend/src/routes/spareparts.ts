import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../db';

export const sparepartsRoutes = Router();

// ── GET /api/spare-parts ─────────────────────────────────────────────────────────────────────
sparepartsRoutes.get('/spare-parts', authMiddleware, async (_req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT sp.id,
              sp.name,
              sp.description,
              sp.codice,
              sp.quantita,
              sp.scorta_minima,
              sp.qty_riordino,
              sp.created_at,
              (sp.quantita <= sp.scorta_minima) AS sotto_scorta,
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

// ── GET /api/spare-parts/sotto-scorta ───────────────────────────────────────────────
sparepartsRoutes.get('/spare-parts/sotto-scorta', authMiddleware, async (_req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT sp.id, sp.codice, sp.name, sp.quantita, sp.scorta_minima, sp.qty_riordino,
              COALESCE(ARRAY_AGG(spt.tipologia) FILTER (WHERE spt.tipologia IS NOT NULL), '{}') AS tipologie
       FROM spare_parts sp
       LEFT JOIN spare_part_tipologie spt ON spt.spare_part_id = sp.id
       WHERE sp.quantita <= sp.scorta_minima
       GROUP BY sp.id
       ORDER BY sp.name ASC`
    );
    res.json({ items: r.rows });
  } catch (e) { next(e); }
});

// ── GET /api/spare-parts/by-type/:type ───────────────────────────────────────────────
sparepartsRoutes.get('/spare-parts/by-type/:type', authMiddleware, async (req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT sp.id, sp.name, sp.description, sp.codice, sp.quantita, sp.scorta_minima, sp.qty_riordino, sp.created_at,
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

// ── POST /api/spare-parts ─────────────────────────────────────────────────────────────────
sparepartsRoutes.post('/spare-parts', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const { name, description, tipologie, types, codice, quantita, scorta_minima, qty_riordino } = req.body as {
      name?: string; description?: string; tipologie?: string[]; types?: string[];
      codice?: string; quantita?: number; scorta_minima?: number; qty_riordino?: number;
    };
    if (!name?.trim()) return res.status(400).json({ error: 'name è obbligatorio' });
    const raw = Array.isArray(tipologie) && tipologie.length ? tipologie : (Array.isArray(types) ? types : []);
    const cleanedTipologie = raw.map((t) => String(t).trim()).filter(Boolean);
    if (!cleanedTipologie.length) return res.status(400).json({ error: 'tipologie (array) è obbligatorio' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const spR = await client.query(
        `INSERT INTO spare_parts(name, description, codice, quantita, scorta_minima, qty_riordino)
         VALUES($1,$2,$3,$4,$5,$6)
         RETURNING id, name, description, codice, quantita, scorta_minima, qty_riordino, created_at`,
        [
          name.trim(),
          description?.trim() ?? null,
          codice?.trim() ?? null,
          quantita ?? 0,
          scorta_minima ?? 1,
          qty_riordino ?? 10
        ]
      );
      const sparePartId = spR.rows[0].id as string;
      const values: any[] = [];
      const placeholders = cleanedTipologie.map((t, idx) => {
        values.push(sparePartId, t);
        return `($${idx * 2 + 1}, $${idx * 2 + 2})`;
      });
      await client.query(
        `INSERT INTO spare_part_tipologie(spare_part_id, tipologia) VALUES ${placeholders.join(', ')} ON CONFLICT(spare_part_id, tipologia) DO NOTHING`,
        values
      );
      await client.query('COMMIT');
      res.json({ item: { ...spR.rows[0], tipologie: cleanedTipologie } });
    } catch (e) {
      await client.query('ROLLBACK'); throw e;
    } finally { client.release(); }
  } catch (e) { next(e); }
});

// ── PUT /api/spare-parts/:id ─────────────────────────────────────────────────────────────
sparepartsRoutes.put('/spare-parts/:id', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const { id } = req.params;
    const { name, description, tipologie, codice, quantita, scorta_minima, qty_riordino } = req.body as {
      name?: string; description?: string; tipologie?: string[];
      codice?: string; quantita?: number; scorta_minima?: number; qty_riordino?: number;
    };
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query(
        `UPDATE spare_parts SET
           name          = COALESCE($1, name),
           description   = COALESCE($2, description),
           codice        = COALESCE($3, codice),
           quantita      = COALESCE($4, quantita),
           scorta_minima = COALESCE($5, scorta_minima),
           qty_riordino  = COALESCE($6, qty_riordino),
           updated_at    = now()
         WHERE id = $7 RETURNING *`,
        [name?.trim() ?? null, description?.trim() ?? null, codice?.trim() ?? null,
         quantita ?? null, scorta_minima ?? null, qty_riordino ?? null, id]
      );
      if (!r.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Ricambio non trovato' }); }
      if (Array.isArray(tipologie)) {
        await client.query('DELETE FROM spare_part_tipologie WHERE spare_part_id = $1', [id]);
        const cleaned = tipologie.map((t) => String(t).trim()).filter(Boolean);
        if (cleaned.length) {
          const vals: any[] = [];
          const ph = cleaned.map((t, idx) => { vals.push(id, t); return `($${idx * 2 + 1}, $${idx * 2 + 2})`; });
          await client.query(`INSERT INTO spare_part_tipologie(spare_part_id, tipologia) VALUES ${ph.join(', ')} ON CONFLICT DO NOTHING`, vals);
        }
      }
      await client.query('COMMIT');
      res.json({ item: r.rows[0] });
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  } catch (e) { next(e); }
});

// ── PATCH /api/spare-parts/:id/scala  (scala giacenza dopo manutenzione) ────────
sparepartsRoutes.patch('/spare-parts/:id/scala', authMiddleware, async (req, res, next) => {
  try {
    const { quantita } = req.body as { quantita?: number };
    if (!quantita || quantita <= 0) return res.status(400).json({ error: 'quantita deve essere > 0' });
    const r = await pool.query(
      `UPDATE spare_parts
       SET quantita = GREATEST(0, quantita - $1), updated_at = now()
       WHERE id = $2
       RETURNING id, name, quantita, scorta_minima, (quantita <= scorta_minima) AS sotto_scorta`,
      [quantita, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Ricambio non trovato' });
    res.json({ item: r.rows[0] });
  } catch (e) { next(e); }
});

// ── DELETE /api/spare-parts/:id ────────────────────────────────────────────────────────────
sparepartsRoutes.delete('/spare-parts/:id', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const usedR = await pool.query('SELECT COUNT(*)::int AS count FROM case_spare_parts WHERE spare_part_id = $1', [req.params.id]);
    const count = usedR.rows[0]?.count ?? 0;
    if (count > 0) return res.status(400).json({ error: `In uso da ${count} casi`, usage_count: count });
    await pool.query('DELETE FROM spare_parts WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ──────────────────────────────────────────────────────────────────────────────
// SOLUZIONI APPLICATE
// ──────────────────────────────────────────────────────────────────────────────
sparepartsRoutes.get('/solutions-applied', authMiddleware, async (_req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT sa.id,
              sa.name,
              sa.description,
              sa.created_at,
              COALESCE(
                ARRAY_AGG(sp.problem_id::text ORDER BY c.name) FILTER (WHERE sp.problem_id IS NOT NULL),
                '{}'
              ) AS problem_ids,
              COALESCE(
                ARRAY_AGG(c.name ORDER BY c.name) FILTER (WHERE c.name IS NOT NULL),
                '{}'
              ) AS problem_names,
              (
                (SELECT COUNT(*)::int FROM case_solutions_applied csa WHERE csa.solution_id = sa.id) +
                (SELECT COUNT(*)::int FROM case_solutions_tried  cst  WHERE cst.solution_id  = sa.id)
              ) AS usage_count
       FROM solutions_applied sa
       LEFT JOIN solution_problems sp ON sp.solution_id = sa.id
       LEFT JOIN categories c         ON c.id = sp.problem_id AND c.type = 'problem'
       GROUP BY sa.id
       ORDER BY sa.name ASC`
    );
    res.json({ items: r.rows });
  } catch (e) { next(e); }
});

sparepartsRoutes.post('/solutions-applied', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const { name, description, problem_ids } = req.body as {
      name?: string; description?: string; problem_ids?: string[];
    };
    if (!name?.trim()) return res.status(400).json({ error: 'name è obbligatorio' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query(
        'INSERT INTO solutions_applied(name, description) VALUES($1, $2) RETURNING *',
        [name.trim(), description?.trim() ?? null]
      );
      const solId = r.rows[0].id as string;
      if (Array.isArray(problem_ids) && problem_ids.length) {
        const vals: any[] = [];
        const ph = problem_ids.map((pid, idx) => { vals.push(solId, pid); return `($${idx * 2 + 1}, $${idx * 2 + 2})`; });
        await client.query(
          `INSERT INTO solution_problems(solution_id, problem_id) VALUES ${ph.join(', ')} ON CONFLICT DO NOTHING`,
          vals
        );
      }
      await client.query('COMMIT');
      res.json({ item: r.rows[0] });
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  } catch (e) { next(e); }
});

sparepartsRoutes.put('/solutions-applied/:id', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const { id } = req.params;
    const { name, description, problem_ids } = req.body as {
      name?: string; description?: string; problem_ids?: string[];
    };
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query(
        `UPDATE solutions_applied SET name = COALESCE($1, name), description = COALESCE($2, description) WHERE id = $3 RETURNING *`,
        [name?.trim() ?? null, description?.trim() ?? null, id]
      );
      if (!r.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Soluzione non trovata' }); }
      if (Array.isArray(problem_ids)) {
        await client.query('DELETE FROM solution_problems WHERE solution_id = $1', [id]);
        if (problem_ids.length) {
          const vals: any[] = [];
          const ph = problem_ids.map((pid, idx) => { vals.push(id, pid); return `($${idx * 2 + 1}, $${idx * 2 + 2})`; });
          await client.query(
            `INSERT INTO solution_problems(solution_id, problem_id) VALUES ${ph.join(', ')} ON CONFLICT DO NOTHING`,
            vals
          );
        }
      }
      await client.query('COMMIT');
      res.json({ item: r.rows[0] });
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  } catch (e) { next(e); }
});

sparepartsRoutes.delete('/solutions-applied/:id', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const usedR = await pool.query(
      `SELECT ((SELECT COUNT(*)::int FROM case_solutions_applied WHERE solution_id = $1) + (SELECT COUNT(*)::int FROM case_solutions_tried WHERE solution_id = $1)) AS count`,
      [req.params.id]
    );
    const count = usedR.rows[0]?.count ?? 0;
    if (count > 0) return res.status(400).json({ error: `In uso da ${count} casi`, usage_count: count });
    const r = await pool.query('DELETE FROM solutions_applied WHERE id = $1 RETURNING id', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Soluzione non trovata' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
