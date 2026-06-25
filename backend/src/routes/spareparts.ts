import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth';
import { pool } from '../db';

export const sparepartsRoutes = Router();

// ── SPARE PARTS ────────────────────────────────────────────────────────────

sparepartsRoutes.get('/spare-parts', authMiddleware, requireRole('admin', 'magazziniere'), async (_req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT sp.id,
              sp.name,
              sp.description,
              sp.codice,
              sp.tipologia,
              sp.quantita,
              sp.scorta_minima,
              sp.quantita_riordino,
              sp.created_at,
              COUNT(csp.id)::int AS usage_count,
              COALESCE(ARRAY_AGG(spt.tipologia) FILTER (WHERE spt.tipologia IS NOT NULL), '{}') AS tipologie,
              (sp.quantita < 0) AS giacenza_negativa,
              (sp.quantita >= 0 AND sp.quantita <= sp.scorta_minima) AS sotto_scorta,
              EXISTS (
                SELECT 1 FROM reorders ro
                WHERE ro.spare_part_id = sp.id
                  AND ro.status IN ('in_lavorazione','partial')
              ) AS ordine_aperto
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

sparepartsRoutes.get('/spare-parts/:id', authMiddleware, requireRole('admin', 'magazziniere'), async (req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT sp.id, sp.name, sp.description, sp.codice, sp.tipologia,
              sp.quantita, sp.scorta_minima, sp.quantita_riordino, sp.created_at,
              (sp.quantita < 0) AS giacenza_negativa,
              (sp.quantita >= 0 AND sp.quantita <= sp.scorta_minima) AS sotto_scorta,
              EXISTS (
                SELECT 1 FROM reorders ro
                WHERE ro.spare_part_id = sp.id
                  AND ro.status IN ('in_lavorazione','partial')
              ) AS ordine_aperto
       FROM spare_parts sp
       WHERE sp.id = $1`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Ricambio non trovato' });
    res.json({ item: r.rows[0] });
  } catch (e) {
    next(e);
  }
});

sparepartsRoutes.post('/spare-parts', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const { name, description, tipologie, types, codice, tipologia, scorta_minima, quantita_riordino } = req.body as {
      name?: string;
      description?: string;
      tipologie?: string[];
      types?: string[];
      codice?: string;
      tipologia?: string;
      scorta_minima?: number;
      quantita_riordino?: number;
    };
    if (!name?.trim()) return res.status(400).json({ error: 'name è obbligatorio' });
    const raw = Array.isArray(tipologie) && tipologie.length ? tipologie : (Array.isArray(types) ? types : []);
    const cleanedTipologie = raw.map((t) => String(t).trim()).filter(Boolean);
    if (!cleanedTipologie.length) return res.status(400).json({ error: 'tipologie (array) è obbligatorio' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const spR = await client.query(
        `INSERT INTO spare_parts(name, description, codice, tipologia, scorta_minima, quantita_riordino)
         VALUES($1,$2,$3,$4,$5,$6)
         RETURNING id, name, description, codice, tipologia, quantita, scorta_minima, quantita_riordino, created_at`,
        [name.trim(), description?.trim() ?? null, codice?.trim() ?? null, tipologia?.trim() ?? null,
         scorta_minima ?? 1, quantita_riordino ?? 10]
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

sparepartsRoutes.put('/spare-parts/:id', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const { id } = req.params;
    const { name, description, tipologie, codice, tipologia, scorta_minima, quantita_riordino } = req.body as {
      name?: string;
      description?: string;
      tipologie?: string[];
      codice?: string;
      tipologia?: string;
      scorta_minima?: number;
      quantita_riordino?: number;
    };
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query(
        `UPDATE spare_parts
         SET name = COALESCE($1, name),
             description = COALESCE($2, description),
             codice = COALESCE($3, codice),
             tipologia = COALESCE($4, tipologia),
             scorta_minima = COALESCE($5, scorta_minima),
             quantita_riordino = COALESCE($6, quantita_riordino)
         WHERE id = $7 RETURNING *`,
        [name?.trim() ?? null, description?.trim() ?? null, codice?.trim() ?? null,
         tipologia?.trim() ?? null, scorta_minima ?? null, quantita_riordino ?? null, id]
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

// ── PATCH: RETTIFICA MANUALE ±
sparepartsRoutes.patch('/spare-parts/:id/rettifica', authMiddleware, requireRole('admin', 'magazziniere'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { delta, note } = req.body as { delta?: number; note?: string };
    if (typeof delta !== 'number' || !Number.isInteger(delta) || delta === 0) {
      return res.status(400).json({ error: 'delta deve essere un intero diverso da zero' });
    }
    if (!note || note.trim() === '') {
      return res.status(400).json({ error: 'La nota è obbligatoria per la rettifica manuale' });
    }
    const check = await pool.query('SELECT id FROM spare_parts WHERE id = $1', [id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Ricambio non trovato' });

    const { rows } = await pool.query(
      `UPDATE spare_parts SET quantita = quantita + $1, updated_at = now() WHERE id = $2 RETURNING quantita`,
      [delta, id]
    );
    await pool.query(
      `INSERT INTO spare_parts_movimenti
         (spare_part_id, tipo, delta, quantita_dopo, riferimento_tipo, note, actor_id)
       VALUES ($1, 'rettifica_manuale', $2, $3, 'manuale', $4, $5)`,
      [id, delta, rows[0].quantita, note.trim(), req.user!.id]
    );
    res.json({ ok: true, quantita: rows[0].quantita });
  } catch (e) { next(e); }
});

// ── PATCH: SCALA GIACENZA dopo manutenzione (chiamato alla chiusura caso)
sparepartsRoutes.patch('/spare-parts/:id/scalare', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { quantita = 1, case_id } = req.body as { quantita?: number; case_id?: string };
    const qty = typeof quantita === 'number' && quantita > 0 ? quantita : 1;

    const check = await pool.query('SELECT id FROM spare_parts WHERE id = $1', [id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Ricambio non trovato' });

    const { rows } = await pool.query(
      `UPDATE spare_parts SET quantita = quantita - $1, updated_at = now() WHERE id = $2 RETURNING quantita`,
      [qty, id]
    );
    await pool.query(
      `INSERT INTO spare_parts_movimenti
         (spare_part_id, tipo, delta, quantita_dopo, riferimento_id, riferimento_tipo, actor_id)
       VALUES ($1, 'scarico_manutenzione', $2, $3, $4, 'case', $5)`,
      [id, -qty, rows[0].quantita, case_id ?? null, req.user!.id]
    );
    // Ritorna alert per pezzi sotto scorta / giacenza negativa
    const alertR = await pool.query(
      `SELECT id, name, codice, quantita, scorta_minima,
              (quantita < 0) AS giacenza_negativa,
              (quantita >= 0 AND quantita <= scorta_minima) AS sotto_scorta,
              EXISTS (
                SELECT 1 FROM reorders ro
                WHERE ro.spare_part_id = spare_parts.id
                  AND ro.status IN ('in_lavorazione','partial')
              ) AS ordine_aperto
       FROM spare_parts
       WHERE id = ANY(
         SELECT spare_part_id FROM case_spare_parts WHERE case_id = $1
       ) AND (quantita < 0 OR quantita <= scorta_minima)`,
      [case_id ?? null]
    );
    res.json({ ok: true, quantita: rows[0].quantita, alert_pezzi: alertR.rows });
  } catch (e) { next(e); }
});

// ── GET: STORICO MOVIMENTI
sparepartsRoutes.get('/spare-parts/:id/movimenti', authMiddleware, requireRole('admin', 'magazziniere'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { tipo, from, to, actor_id, page = '1', limit = '20' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions: string[] = ['m.spare_part_id = $1'];
    const values: any[] = [id];

    if (tipo) { values.push(tipo); conditions.push(`m.tipo = $${values.length}`); }
    if (from) { values.push(from); conditions.push(`m.created_at >= $${values.length}`); }
    if (to) { values.push(to); conditions.push(`m.created_at <= $${values.length}`); }
    if (actor_id) { values.push(actor_id); conditions.push(`m.actor_id = $${values.length}`); }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const r = await pool.query(
      `SELECT m.id, m.tipo, m.delta, m.quantita_dopo, m.riferimento_id,
              m.riferimento_tipo, m.note, m.created_at,
              u.username AS actor_username,
              CASE
                WHEN m.riferimento_tipo = 'reorder' THEN
                  (SELECT ro.numero_ordine::text FROM reorders ro WHERE ro.id = m.riferimento_id)
                WHEN m.riferimento_tipo = 'case' THEN
                  LEFT(m.riferimento_id::text, 8)
                ELSE NULL
              END AS riferimento_numero,
              COUNT(*) OVER() AS total_count
       FROM spare_parts_movimenti m
       LEFT JOIN users u ON u.id = m.actor_id
       ${where}
       ORDER BY m.created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limitNum, offset]
    );

    const total = r.rows[0]?.total_count ?? 0;
    res.json({ items: r.rows, total, page: pageNum, limit: limitNum });
  } catch (e) { next(e); }
});

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

// ── SOLUZIONI APPLICATE ────────────────────────────────────────────────────

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
