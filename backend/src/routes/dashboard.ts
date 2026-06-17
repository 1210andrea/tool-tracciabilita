import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../db';

export const dashboardRoutes = Router();

dashboardRoutes.get('/', authMiddleware, async (req, res, next) => {
  try {
    const isAdmin = req.user!.role === 'admin';
    const filter = isAdmin ? '' : 'WHERE created_by = $1';
    const params = isAdmin ? [] : [req.user!.id];

    const monthFilter = isAdmin
      ? `WHERE EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM now())
         AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM now())`
      : `WHERE created_by = $1
         AND EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM now())
         AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM now())`;

    const [totalR, monthR] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM cases ${filter}`, params),
      pool.query(`SELECT COUNT(*)::int AS count FROM cases ${monthFilter}`, params)
    ]);

    res.json({
      total: totalR.rows[0]?.total ?? 0,
      this_month: monthR.rows[0]?.count ?? 0
    });
  } catch (e) {
    next(e);
  }
});

dashboardRoutes.get('/problemi-tempo', authMiddleware, async (req, res, next) => {
  try {
    const { startDate, endDate, machineId, limit = '10' } = req.query;
    const limitNum = Math.min(Math.max(parseInt(String(limit), 10) || 10, 1), 50);

    let whereConditions = ["c.status IN ('closed', 'completato')"];
    const params: any[] = [];

    if (startDate) {
      whereConditions.push(`c.created_at >= $${params.length + 1}`);
      params.push(startDate);
    }

    if (endDate) {
      whereConditions.push(`c.created_at <= $${params.length + 1}`);
      params.push(endDate);
    }

    if (machineId) {
      whereConditions.push(`c.machine_id = $${params.length + 1}`);
      params.push(machineId);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    params.push(limitNum);
    const query = `SELECT prob.name AS nome, COALESCE(SUM(c.tempo_impiego)::float, 0) AS tempo_totale
       FROM cases c
       JOIN categories prob ON c.problem_id = prob.id
       ${whereClause}
       GROUP BY prob.id, prob.name
       ORDER BY tempo_totale DESC
       LIMIT $${params.length}`;

    const r = await pool.query(query, params);
    res.json({ data: r.rows });
  } catch (e) {
    next(e);
  }
});

