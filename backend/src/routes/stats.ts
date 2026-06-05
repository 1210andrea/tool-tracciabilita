import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../services/dbService';

export const statsRoutes = Router();

statsRoutes.get('/top-machines', authMiddleware, async (_req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT m.code, m.name, COUNT(*)::int AS open_cases
       FROM cases c
       JOIN machines m ON m.id=c.machine_id
       WHERE c.status IN ('open','in_progress')
       GROUP BY m.code, m.name
       ORDER BY open_cases DESC
       LIMIT 5`
    );
    res.json({ items: r.rows });
  } catch (e) {
    next(e);
  }
});

