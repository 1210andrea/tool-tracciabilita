import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../db';
import { emitEvent } from '../services/socketService';

export const categoriesRoutes = Router();

categoriesRoutes.get('/', authMiddleware, async (_req, res, next) => {
  try {
    // usage_count = numero casi che la usano come problema o causa + utenti collegati (per operatori)
    const r = await pool.query(`
      SELECT
        cat.id, cat.type, cat.name, cat.description, cat.created_at,
        (
          COALESCE((SELECT COUNT(*)::int FROM cases c WHERE c.problem_id = cat.id), 0) +
          COALESCE((SELECT COUNT(*)::int FROM cases c WHERE c.cause_id   = cat.id), 0) +
          COALESCE((SELECT COUNT(*)::int FROM users u WHERE u.operator_category_id = cat.id), 0)
        ) AS usage_count
      FROM categories cat
      ORDER BY cat.type, cat.created_at DESC
    `);
    res.json({ items: r.rows });
  } catch (e) {
    next(e);
  }
});

categoriesRoutes.get('/:type', authMiddleware, async (req, res, next) => {
  try {
    const { type } = req.params;
    const r = await pool.query('SELECT id, type, name, description FROM categories WHERE type = $1 ORDER BY name', [type]);
    res.json({ items: r.rows });
  } catch (e) {
    next(e);
  }
});

categoriesRoutes.post('/', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    const { type, name, description } = req.body as { type: string; name: string; description?: string };
    if (!type || !name) return res.status(400).json({ error: 'type and name are required' });

    const r = await pool.query(
      'INSERT INTO categories(type,name,description) VALUES($1,$2,$3) RETURNING *',
      [type, name, description ?? null]
    );
    emitEvent('categories_updated', { type });
    res.json({ item: r.rows[0] });
  } catch (e) {
    next(e);
  }
});

categoriesRoutes.put('/:id', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    const { id } = req.params;
    const { name, description } = req.body as { name?: string; description?: string };
    const r = await pool.query(
      'UPDATE categories SET name = COALESCE($1, name), description = COALESCE($2, description) WHERE id = $3 RETURNING *',
      [name ?? null, description ?? null, id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Category not found' });
    emitEvent('categories_updated', { type: r.rows[0].type });
    res.json({ item: r.rows[0] });
  } catch (e) {
    next(e);
  }
});

categoriesRoutes.delete('/:id', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    const { id } = req.params;

    // Verifica referenzialità
    const probCountR  = await pool.query('SELECT COUNT(*)::int as count FROM cases WHERE problem_id = $1', [id]);
    const causeCountR = await pool.query('SELECT COUNT(*)::int as count FROM cases WHERE cause_id = $1', [id]);
    const userCountR  = await pool.query('SELECT COUNT(*)::int as count FROM users WHERE operator_category_id = $1', [id]);

    const problemCount = probCountR.rows[0]?.count ?? 0;
    const causeCount   = causeCountR.rows[0]?.count ?? 0;
    const userCount    = userCountR.rows[0]?.count ?? 0;
    const totalUsed    = problemCount + causeCount + userCount;

    if (totalUsed > 0) {
      const parts: string[] = [];
      if (problemCount) parts.push(`${problemCount} casi come problema`);
      if (causeCount)   parts.push(`${causeCount} casi come causa`);
      if (userCount)    parts.push(`${userCount} utenti collegati`);
      return res.status(400).json({ error: `Non eliminabile: in uso (${parts.join(', ')})`, usage_count: totalUsed });
    }

    const r = await pool.query('DELETE FROM categories WHERE id = $1 RETURNING type', [id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Category not found' });
    emitEvent('categories_updated', { type: r.rows[0]?.type ?? 'all' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
