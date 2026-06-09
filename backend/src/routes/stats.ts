import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../db';

export const statsRoutes = Router();

type FilterQuery = Record<string, string | undefined>;

function buildFilterClause(query: FilterQuery, userId: string, role: string) {
  const conditions: string[] = [];
  const values: Array<string | number> = [];

  if (role !== 'admin') {
    values.push(userId);
    conditions.push(`c.created_by = $${values.length}`);
  }

  const add = (value: string | number | undefined, sql: string) => {
    if (value === undefined || value === '') return;
    values.push(value);
    conditions.push(sql.replace('$$', `$${values.length}`));
  };

  add(query.machine_id, 'c.machine_id = $$');
  add(query.problem_id, 'c.problem_id = $$');
  add(query.cause_id, 'c.cause_id = $$');
  add(query.line, 'm.line = $$');
  add(query.date_from, 'c.created_at::date >= $$::date');
  add(query.date_to, 'c.created_at::date <= $$::date');
  add(query.time_from, `TO_CHAR(c.created_at, 'HH24:MI') >= $$`);
  add(query.time_to, `TO_CHAR(c.created_at, 'HH24:MI') <= $$`);

  if (query.month) {
    values.push(Number(query.month));
    conditions.push(`EXTRACT(MONTH FROM c.created_at)::int = $${values.length}`);
  }
  if (query.year) {
    values.push(Number(query.year));
    conditions.push(`EXTRACT(YEAR FROM c.created_at)::int = $${values.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, values };
}

statsRoutes.get('/trend-cases', authMiddleware, async (req, res, next) => {
  try {
    const query = req.query as FilterQuery;
    const days = Math.min(90, Math.max(7, Number(query.days) || 30));
    const { whereClause, values } = buildFilterClause(query, req.user!.id, req.user!.role);

    const matchFilters = whereClause ? whereClause.replace(/^WHERE /, '') : 'TRUE';
    const startParam = values.length + 1;
    const endParam = values.length + 2;
    const daysParam = values.length + 3;

    const r = await pool.query(
      `SELECT to_char(d::date, 'YYYY-MM-DD') AS date, COUNT(c.id)::int AS count
       FROM generate_series(
         COALESCE($${startParam}::date, current_date - ($${daysParam}::int - 1) * interval '1 day'),
         COALESCE($${endParam}::date, current_date),
         interval '1 day'
       ) AS d
       LEFT JOIN cases c ON c.created_at::date = d::date
       LEFT JOIN machines m ON m.id = c.machine_id
         AND (${matchFilters})
       GROUP BY d
       ORDER BY d`,
      [...values, query.date_from || null, query.date_to || null, days]
    );

    res.json({ items: r.rows });
  } catch (e) {
    next(e);
  }
});

statsRoutes.get('/problems-by-line', authMiddleware, async (req, res, next) => {
  try {
    const { whereClause, values } = buildFilterClause(req.query as FilterQuery, req.user!.id, req.user!.role);
    const r = await pool.query(
      `SELECT COALESCE(m.line, 'N/D') AS line, COUNT(*)::int AS problem_count
       FROM cases c
       JOIN machines m ON m.id = c.machine_id
       ${whereClause}
       GROUP BY m.line
       HAVING COUNT(*) > 0
       ORDER BY problem_count DESC`,
      values
    );
    res.json({ items: r.rows });
  } catch (e) {
    next(e);
  }
});

statsRoutes.get('/top-problems', authMiddleware, async (req, res, next) => {
  try {
    const limit = [5, 10, 15].includes(Number(req.query.limit)) ? Number(req.query.limit) : 5;
    const { whereClause, values } = buildFilterClause(req.query as FilterQuery, req.user!.id, req.user!.role);
    const r = await pool.query(
      `SELECT COALESCE(prob.name, 'N/D') AS problem, COUNT(*)::int AS count
       FROM cases c
       JOIN machines m ON m.id = c.machine_id
       LEFT JOIN categories prob ON prob.id = c.problem_id
       ${whereClause}
       GROUP BY prob.name
       HAVING COUNT(*) > 0
       ORDER BY count DESC
       LIMIT $${values.length + 1}`,
      [...values, limit]
    );
    res.json({ items: r.rows });
  } catch (e) {
    next(e);
  }
});

statsRoutes.get('/top-causes', authMiddleware, async (req, res, next) => {
  try {
    const limit = [5, 10, 15].includes(Number(req.query.limit)) ? Number(req.query.limit) : 5;
    const { whereClause, values } = buildFilterClause(req.query as FilterQuery, req.user!.id, req.user!.role);
    const r = await pool.query(
      `SELECT COALESCE(cause.name, 'N/D') AS cause, COUNT(*)::int AS count
       FROM cases c
       JOIN machines m ON m.id = c.machine_id
       LEFT JOIN categories cause ON cause.id = c.cause_id
       ${whereClause}
       GROUP BY cause.name
       HAVING COUNT(*) > 0
       ORDER BY count DESC
       LIMIT $${values.length + 1}`,
      [...values, limit]
    );
    res.json({ items: r.rows });
  } catch (e) {
    next(e);
  }
});

statsRoutes.get('/top-machines', authMiddleware, async (req, res, next) => {
  try {
    const limit = [5, 10, 15].includes(Number(req.query.limit)) ? Number(req.query.limit) : 5;
    const { whereClause, values } = buildFilterClause(req.query as FilterQuery, req.user!.id, req.user!.role);
    const r = await pool.query(
      `SELECT m.code AS machine, COUNT(*)::int AS count
       FROM cases c
       JOIN machines m ON m.id = c.machine_id
       ${whereClause}
       GROUP BY m.code
       HAVING COUNT(*) > 0
       ORDER BY count DESC
       LIMIT $${values.length + 1}`,
      [...values, limit]
    );
    res.json({ items: r.rows });
  } catch (e) {
    next(e);
  }
});

statsRoutes.get('/top-spare-parts', authMiddleware, async (req, res, next) => {
  try {
    const limit = [5, 10, 15].includes(Number(req.query.limit)) ? Number(req.query.limit) : 5;
    const { whereClause, values } = buildFilterClause(req.query as FilterQuery, req.user!.id, req.user!.role);
    const extra = whereClause ? `${whereClause} AND c.spare_part_id IS NOT NULL` : 'WHERE c.spare_part_id IS NOT NULL';
    const r = await pool.query(
      `SELECT sp.name AS spare_part, COUNT(*)::int AS usage_count
       FROM cases c
       JOIN machines m ON m.id = c.machine_id
       JOIN spare_parts sp ON sp.id = c.spare_part_id
       ${extra}
       GROUP BY sp.name
       HAVING COUNT(*) > 0
       ORDER BY usage_count DESC
       LIMIT $${values.length + 1}`,
      [...values, limit]
    );
    res.json({ items: r.rows.map((row) => ({ ...row, usage_count: Number(row.usage_count) })) });
  } catch (e) {
    next(e);
  }
});
