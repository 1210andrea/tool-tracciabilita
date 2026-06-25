import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth';
import { pool } from '../db';

export const sparepartsRoutes = Router();

// ── helpers ──────────────────────────────────────────────────────────────────
const WAREHOUSE_ROLES = ['admin', 'magazziniere'] as const;

// ── GET /api/spare-parts ────────────────────────────────────────────────────
sparepartsRoutes.get(
  '/spare-parts',
  authMiddleware,
  requireRole(...WAREHOUSE_ROLES),
  async (_req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT sp.id,
                sp.name,
                sp.description,
                sp.codice,
                sp.tipologia,
                sp.quantita,
                sp.scorta_minima,
                COALESCE(sp.quantita_riordino, sp.qty_riordino, 10) AS quantita_riordino,
                sp.created_at,
                (sp.quantita < 0)                                    AS giacenza_negativa,
                (sp.quantita >= 0 AND sp.quantita <= sp.scorta_minima) AS sotto_scorta,
                EXISTS (
                  SELECT 1 FROM reorders ord
                  WHERE ord.spare_part_id = sp.id
                    AND ord.status IN ('in_lavorazione','partial')
                )                                                     AS ordine_aperto,
                COUNT(csp.id)::int                                    AS usage_count
         FROM spare_parts sp
         LEFT JOIN case_spare_parts csp ON csp.spare_part_id = sp.id
         GROUP BY sp.id
         ORDER BY sp.name ASC`
      );
      res.json({ items: result.rows });
    } catch (e) { next(e); }
  }
);

// ── GET /api/spare-parts/sotto-scorta ───────────────────────────────────────
sparepartsRoutes.get(
  '/spare-parts/sotto-scorta',
  authMiddleware,
  async (_req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT sp.id, sp.codice, sp.name, sp.quantita, sp.scorta_minima,
                COALESCE(sp.quantita_riordino, sp.qty_riordino, 10) AS quantita_riordino,
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

// ── GET /api/spare-parts/:id ─────────────────────────────────────────────────
sparepartsRoutes.get(
  '/spare-parts/:id',
  authMiddleware,
  requireRole(...WAREHOUSE_ROLES),
  async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT sp.*,
                (sp.quantita < 0) AS giacenza_negativa,
                (sp.quantita >= 0 AND sp.quantita <= sp.scorta_minima) AS sotto_scorta,
                EXISTS (
                  SELECT 1 FROM reorders ord
                  WHERE ord.spare_part_id = sp.id AND ord.status IN ('in_lavorazione','partial')
                ) AS ordine_aperto
         FROM spare_parts sp WHERE sp.id = $1`,
        [req.params.id]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Ricambio non trovato' });
      res.json({ item: result.rows[0] });
    } catch (e) { next(e); }
  }
);

// ── GET /api/spare-parts/by-type/:type ─────────────────────────────────────
sparepartsRoutes.get('/spare-parts/by-type/:type', authMiddleware, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT sp.id, sp.name, sp.description, sp.codice, sp.quantita, sp.scorta_minima,
              COALESCE(sp.quantita_riordino, sp.qty_riordino, 10) AS quantita_riordino, sp.created_at
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
  requireRole(...WAREHOUSE_ROLES),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { name, description, codice, tipologia, scorta_minima, quantita_riordino } = req.body as {
        name?: string; description?: string; codice?: string; tipologia?: string;
        scorta_minima?: number; quantita_riordino?: number;
      };
      const result = await pool.query(
        `UPDATE spare_parts SET
           name               = COALESCE($1, name),
           description        = COALESCE($2, description),
           codice             = COALESCE($3, codice),
           tipologia          = COALESCE($4, tipologia),
           scorta_minima      = COALESCE($5, scorta_minima),
           quantita_riordino  = COALESCE($6, COALESCE(quantita_riordino, qty_riordino, 10)),
           updated_at         = now()
         WHERE id = $7 RETURNING *`,
        [name?.trim() ?? null, description?.trim() ?? null, codice?.trim() ?? null,
         tipologia?.trim() ?? null, scorta_minima ?? null, quantita_riordino ?? null, id]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Ricambio non trovato' });
      res.json({ item: result.rows[0] });
    } catch (e) { next(e); }
  }
);

// ── PATCH /api/spare-parts/:id/scalare  (scarico post-manutenzione) ─────────
sparepartsRoutes.patch('/spare-parts/:id/scalare', authMiddleware, async (req, res, next) => {
  try {
    const { quantita, caso_id } = req.body as { quantita?: number; caso_id?: string };
    if (!quantita || quantita <= 0) return res.status(400).json({ error: 'quantita deve essere > 0' });

    const result = await pool.query(
      `UPDATE spare_parts
       SET quantita = quantita - $1, updated_at = now()
       WHERE id = $2
       RETURNING id, name, codice, quantita, scorta_minima,
                 (quantita - $1 < 0)                                            AS giacenza_negativa,
                 (quantita - $1 >= 0 AND quantita - $1 <= scorta_minima)        AS sotto_scorta`,
      [quantita, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Ricambio non trovato' });

    const part = result.rows[0];
    await pool.query(
      `INSERT INTO spare_parts_movimenti
         (spare_part_id, tipo, delta, quantita_dopo, riferimento_id, riferimento_tipo, actor_id)
       VALUES ($1,'scarico_manutenzione',$2,$3,$4,'case',$5)`,
      [part.id, -quantita, part.quantita, caso_id ?? null, req.user!.id]
    );

    res.json({ item: part });
  } catch (e) { next(e); }
});

// ── PATCH /api/spare-parts/:id/rettifica ────────────────────────────────────
sparepartsRoutes.patch(
  '/spare-parts/:id/rettifica',
  authMiddleware,
  requireRole(...WAREHOUSE_ROLES),
  async (req, res, next) => {
    try {
      const { delta, note } = req.body as { delta?: number; note?: string };
      if (delta === undefined || delta === 0)
        return res.status(400).json({ error: 'delta deve essere diverso da 0' });
      if (!note || note.trim() === '')
        return res.status(400).json({ error: 'La nota è obbligatoria' });

      const result = await pool.query(
        `UPDATE spare_parts
         SET quantita = quantita + $1, updated_at = now()
         WHERE id = $2
         RETURNING id, name, codice, quantita, scorta_minima,
                   (quantita + $1 < 0)                                           AS giacenza_negativa,
                   (quantita + $1 >= 0 AND quantita + $1 <= scorta_minima)       AS sotto_scorta`,
        [delta, req.params.id]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Ricambio non trovato' });

      const part = result.rows[0];
      await pool.query(
        `INSERT INTO spare_parts_movimenti
           (spare_part_id, tipo, delta, quantita_dopo, riferimento_tipo, note, actor_id)
         VALUES ($1,'rettifica_manuale',$2,$3,'manuale',$4,$5)`,
        [part.id, delta, part.quantita, note.trim(), req.user!.id]
      );

      res.json({ item: part });
    } catch (e) { next(e); }
  }
);

// ── GET /api/spare-parts/:id/movimenti ──────────────────────────────────────
sparepartsRoutes.get(
  '/spare-parts/:id/movimenti',
  authMiddleware,
  requireRole(...WAREHOUSE_ROLES),
  async (req, res, next) => {
    try {
      const { tipo, from, to, actor_id } = req.query as Record<string, string>;
      const page  = Math.max(1, parseInt((req.query.page  as string) || '1'));
      const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '20')));
      const offset = (page - 1) * limit;

      const conditions: string[] = ['m.spare_part_id = $1'];
      const params: any[]        = [req.params.id];
      let idx = 2;

      if (tipo)     { conditions.push(`m.tipo = $${idx++}`);         params.push(tipo); }
      if (from)     { conditions.push(`m.created_at >= $${idx++}`);  params.push(from); }
      if (to)       { conditions.push(`m.created_at <= $${idx++}`);  params.push(to); }
      if (actor_id) { conditions.push(`m.actor_id = $${idx++}`);     params.push(actor_id); }

      const where = conditions.join(' AND ');

      const countR = await pool.query(
        `SELECT COUNT(*)::int AS total FROM spare_parts_movimenti m WHERE ${where}`,
        params
      );
      const total = countR.rows[0].total;

      const movResult = await pool.query(
        `SELECT m.*,
                u.username AS actor_username,
                CASE
                  WHEN m.riferimento_tipo = 'reorder'
                    THEN (SELECT ro.numero_ordine::text FROM reorders ro WHERE ro.id = m.riferimento_id)
                  WHEN m.riferimento_tipo = 'case'
                    THEN LEFT(m.riferimento_id::text, 8)
                  ELSE NULL
                END AS riferimento_numero
         FROM spare_parts_movimenti m
         LEFT JOIN users u ON u.id = m.actor_id
         WHERE ${where}
         ORDER BY m.created_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, limit, offset]
      );

      res.json({
        items: movResult.rows,
        total,
        page,
        pages: Math.ceil(total / limit),
      });
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
      const usedR = await pool.query(
        'SELECT COUNT(*)::int AS count FROM case_spare_parts WHERE spare_part_id = $1',
        [req.params.id]
      );
      const count = usedR.rows[0]?.count ?? 0;
      if (count > 0) return res.status(400).json({ error: `In uso da ${count} casi`, usage_count: count });
      await pool.query('DELETE FROM spare_parts WHERE id = $1', [req.params.id]);
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);

// ── SOLUZIONI APPLICATE (invariato) ─────────────────────────────────────────
sparepartsRoutes.get('/solutions-applied', authMiddleware, async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT sa.id, sa.name, sa.description, sa.created_at,
              COALESCE(ARRAY_AGG(sp.problem_id::text ORDER BY c.name) FILTER (WHERE sp.problem_id IS NOT NULL),'{}') AS problem_ids,
              COALESCE(ARRAY_AGG(c.name ORDER BY c.name) FILTER (WHERE c.name IS NOT NULL),'{}') AS problem_names,
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
    res.json({ items: result.rows });
  } catch (e) { next(e); }
});

sparepartsRoutes.post('/solutions-applied', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const { name, description, problem_ids } = req.body as { name?: string; description?: string; problem_ids?: string[] };
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
        await client.query(`INSERT INTO solution_problems(solution_id, problem_id) VALUES ${ph.join(', ')} ON CONFLICT DO NOTHING`, vals);
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
    const { name, description, problem_ids } = req.body as { name?: string; description?: string; problem_ids?: string[] };
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
          await client.query(`INSERT INTO solution_problems(solution_id, problem_id) VALUES ${ph.join(', ')} ON CONFLICT DO NOTHING`, vals);
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
      `SELECT ((SELECT COUNT(*)::int FROM case_solutions_applied WHERE solution_id = $1) +
               (SELECT COUNT(*)::int FROM case_solutions_tried  WHERE solution_id = $1)) AS count`,
      [req.params.id]
    );
    const count = usedR.rows[0]?.count ?? 0;
    if (count > 0) return res.status(400).json({ error: `In uso da ${count} casi`, usage_count: count });
    const r = await pool.query('DELETE FROM solutions_applied WHERE id = $1 RETURNING id', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Soluzione non trovata' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
