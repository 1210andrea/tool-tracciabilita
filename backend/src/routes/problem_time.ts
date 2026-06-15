import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../db';

export const problemTimeRoutes = Router();

// GET /api/stats/problems-by-time?days=30&...filters
problemTimeRoutes.get('/problems-by-time', authMiddleware, async (req, res, next) => {
  try {
    const {
      days = '30',
      month,
      year,
      machine_id,
      problem_id,
      cause_id,
      line,
      date_from,
      date_to,
      time_from,
      time_to
    } = req.query as Record<string, string>;

    const daysNum = Math.min(365, Math.max(1, Number(days) || 30));

    // filters come in Dashboard/Case list
    const conditions: string[] = [];
    const values: Array<string | number | string[]> = [];

    // base: ultimo N giorni
    conditions.push(`c.created_at >= (now() - $${values.length + 1}::interval)`);
    values.push(`${daysNum} days`);

    if (month) {
      values.push(Number(month));
      conditions.push(`EXTRACT(MONTH FROM c.created_at)::int = $${values.length}`);
    }
    if (year) {
      values.push(Number(year));
      conditions.push(`EXTRACT(YEAR FROM c.created_at)::int = $${values.length}`);
    }
    if (machine_id) {
      values.push(machine_id);
      conditions.push(`c.machine_id = $${values.length}`);
    }
    if (problem_id) {
      values.push(problem_id);
      conditions.push(`c.problem_id = $${values.length}`);
    }
    if (cause_id) {
      values.push(cause_id);
      conditions.push(`c.cause_id = $${values.length}`);
    }
    if (line) {
      values.push(line);
      conditions.push(`m.line = $${values.length}`);
    }
    if (date_from) {
      values.push(date_from);
      conditions.push(`c.created_at::date >= $${values.length}`);
    }
    if (date_to) {
      values.push(date_to);
      conditions.push(`c.created_at::date <= $${values.length}`);
    }
    if (time_from) {
      values.push(time_from);
      conditions.push(`TO_CHAR(c.created_at, 'HH24:MI') >= $${values.length}`);
    }
    if (time_to) {
      values.push(time_to);
      conditions.push(`TO_CHAR(c.created_at, 'HH24:MI') <= $${values.length}`);
    }

    // Nota: tempo_impiego NON esiste ancora nel DB in init.sql corrente.
    // Qui stimiamo “tempo impiego” come differenza tra created_at e updated_at, se presente.
    // Se updated_at è uguale a created_at, i valori saranno 0.
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const r = await pool.query(
      `SELECT
          prob.name AS problem,
          AVG(EXTRACT(EPOCH FROM (c.updated_at - c.created_at)))/60.0 AS avg_minutes,
          COUNT(*)::int AS count
       FROM cases c
       JOIN machines m ON m.id = c.machine_id
       LEFT JOIN categories prob ON prob.id = c.problem_id
       ${whereClause}
       GROUP BY prob.name
       ORDER BY avg_minutes DESC NULLS LAST
       LIMIT 20`,
      values
    );

    res.json({ items: r.rows });
  } catch (e) {
    next(e);
  }
});

