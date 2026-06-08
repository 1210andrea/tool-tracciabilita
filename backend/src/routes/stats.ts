import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../db';

export const statsRoutes = Router();

statsRoutes.get('/top-machines', authMiddleware, async (req, res, next) => {
  try {
    const limit = Math.min(50, Math.max(5, Number(req.query.limit) || 5));
    const isAdmin = req.user!.role === 'admin';
    const r = await pool.query(
      `SELECT m.code AS machine, m.code AS code, COUNT(*)::int AS problem_count, COUNT(*)::int AS open_cases
       FROM cases c
       JOIN machines m ON m.id = c.machine_id
       WHERE 1=1
       ${isAdmin ? '' : 'AND c.created_by = $2'}
       GROUP BY m.code
       HAVING COUNT(*) > 0
       ORDER BY problem_count DESC
       LIMIT $1`,
      isAdmin ? [limit] : [limit, req.user!.id]
    );
    res.json({ items: r.rows.map((row) => ({ ...row, problem_count: Number(row.problem_count) })) });
  } catch (e) {
    next(e);
  }
});

statsRoutes.get('/top-spare-parts', authMiddleware, async (req, res, next) => {
  try {
    const limit = Math.min(50, Math.max(5, Number(req.query.limit) || 5));
    const isAdmin = req.user!.role === 'admin';
    const r = await pool.query(
      `SELECT sp.name AS spare_part, COUNT(*)::int AS usage_count
       FROM cases c
       JOIN categories sp ON sp.id = c.spare_part_id
       WHERE c.spare_part_id IS NOT NULL
       ${isAdmin ? '' : 'AND c.created_by = $2'}
       GROUP BY sp.name
       HAVING COUNT(*) > 0
       ORDER BY usage_count DESC
       LIMIT $1`,
      isAdmin ? [limit] : [limit, req.user!.id]
    );
    res.json({ items: r.rows.map((row) => ({ ...row, usage_count: Number(row.usage_count) })) });
  } catch (e) {
    next(e);
  }
});

statsRoutes.get('/trend-cases', authMiddleware, async (req, res, next) => {
  try {
    const days = Math.min(90, Math.max(7, Number(req.query.days) || 30));
    const r = await pool.query(
      `SELECT to_char(d::date, 'YYYY-MM-DD') AS date, COUNT(c.id)::int AS count
       FROM generate_series(current_date - ($1::int - 1) * interval '1 day', current_date, interval '1 day') AS d
       LEFT JOIN cases c ON c.created_at::date = d::date
       GROUP BY d
       ORDER BY d`,
      [days]
    );
    res.json({ items: r.rows });
  } catch (e) {
    next(e);
  }
});

