import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../services/dbService';

export const categoriesRoutes = Router();

categoriesRoutes.get('/', authMiddleware, async (_req, res, next) => {
  try {
    const r = await pool.query('SELECT id, type, name, description, created_at FROM categories ORDER BY type, created_at DESC');
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
    res.json({ item: r.rows[0] });
  } catch (e) {
    next(e);
  }
});

categoriesRoutes.delete('/:id', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    const { id } = req.params;
    await pool.query('DELETE FROM categories WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

