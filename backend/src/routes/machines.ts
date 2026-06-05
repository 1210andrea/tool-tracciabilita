import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../services/dbService';

export const machinesRoutes = Router();

machinesRoutes.get('/', authMiddleware, async (_req, res, next) => {
  try {
    const r = await pool.query('SELECT id, code, name, location, created_at FROM machines ORDER BY created_at DESC');
    res.json({ items: r.rows });
  } catch (e) {
    next(e);
  }
});

