import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../db';

export const dashboardRoutes = Router();

dashboardRoutes.get('/', authMiddleware, async (req, res, next) => {
  try {
    const isAdmin = req.user!.role === 'admin';
    const r = await pool.query(
      `SELECT status, COUNT(*)::int as count
       FROM cases
       ${isAdmin ? '' : 'WHERE created_by = $1'}
       GROUP BY status
       ORDER BY count DESC`,
      isAdmin ? [] : [req.user!.id]
    );
    res.json({ breakdown: r.rows });
  } catch (e) {
    next(e);
  }
});

