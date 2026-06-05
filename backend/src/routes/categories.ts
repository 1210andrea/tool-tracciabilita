import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../services/dbService';

export const categoriesRoutes = Router();

categoriesRoutes.get('/', authMiddleware, async (_req, res, next) => {
  try {
    const r = await pool.query('SELECT id, name, description, created_at FROM categories ORDER BY created_at DESC');
    res.json({ items: r.rows });
  } catch (e) {
    next(e);
  }
});

