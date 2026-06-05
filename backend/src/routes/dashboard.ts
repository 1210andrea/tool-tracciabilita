import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../services/dbService';

export const dashboardRoutes = Router();

dashboardRoutes.get('/', authMiddleware, async (_req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT status, COUNT(*)::int as count
       FROM cases
       GROUP BY status
       ORDER BY count DESC`
    );
    res.json({ breakdown: r.rows });
  } catch (e) {
    next(e);
  }
});

