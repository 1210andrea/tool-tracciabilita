import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../services/dbService';
import { emitEvent } from '../services/socketService';
import { generateAiSolution } from '../services/aiService';

export const casesRoutes = Router();

casesRoutes.get('/', authMiddleware, async (req, res, next) => {
  try {
    const { status, machine_id, assigned_to, page = '1', limit = '25' } = req.query as Record<string, string>;
    const pageNumber = Math.max(1, Number(page) || 1);
    const limitNumber = Math.min(100, Math.max(1, Number(limit) || 25));
    const offset = (pageNumber - 1) * limitNumber;
    const conditions: string[] = [];
    const values: Array<string | number> = [];

    if (status) {
      values.push(status);
      conditions.push(`c.status = $${values.length}`);
    }
    if (machine_id) {
      values.push(machine_id);
      conditions.push(`c.machine_id = $${values.length}`);
    }
    if (assigned_to) {
      values.push(assigned_to);
      conditions.push(`c.assigned_to = $${values.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const r = await pool.query(
      `SELECT c.*, m.code as machine_code, m.name as machine_name, u.username as created_by_username,
              op.name as operator_name, prob.name as problem_name, cause.name as cause_name,
              COUNT(*) OVER() AS total_count
       FROM cases c
       JOIN machines m ON m.id = c.machine_id
       LEFT JOIN users u ON u.id = c.created_by
       LEFT JOIN categories op ON op.id = c.operator_id
       LEFT JOIN categories prob ON prob.id = c.problem_id
       LEFT JOIN categories cause ON cause.id = c.cause_id
       ${whereClause}
       ORDER BY c.created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limitNumber, offset]
    );

    const total = r.rows[0]?.total_count ?? 0;
    res.json({ items: r.rows, total });
  } catch (e) {
    next(e);
  }
});

casesRoutes.post('/', authMiddleware, async (req, res, next) => {
  try {
    const body = req.body as {
      machine_id: string;
      operator_id?: string;
      problem_id?: string;
      cause_id?: string;
      title: string;
      description?: string;
      priority?: string;
      status?: string;
      assigned_to?: string | null;
    };

    const machineQuery = await pool.query('SELECT code, name FROM machines WHERE id = $1', [body.machine_id]);
    const machineName = machineQuery.rows[0]?.name ?? body.machine_id;

    const categoryIds = [body.operator_id, body.problem_id, body.cause_id];
    const categoryLabels = ['operator', 'problem', 'cause'] as const;
    const categoryValues = await Promise.all(
      categoryIds.map(async (id, idx) => {
        if (!id) return `${categoryLabels[idx]}: N/A`;
        const cat = await pool.query('SELECT name FROM categories WHERE id = $1', [id]);
        return cat.rows[0]?.name ?? `${categoryLabels[idx]}: N/A`;
      })
    );

    const ai_solution = await generateAiSolution({
      machine: `${machineName} (${body.machine_id})`,
      operator: categoryValues[0],
      problem: categoryValues[1],
      cause: categoryValues[2],
      description: body.description ?? ''
    });

    const r = await pool.query(
      `INSERT INTO cases(machine_id, operator_id, problem_id, cause_id, title, description, ai_solution,
                        priority, status, created_by, assigned_to)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        body.machine_id,
        body.operator_id ?? null,
        body.problem_id ?? null,
        body.cause_id ?? null,
        body.title,
        body.description ?? null,
        ai_solution,
        body.priority ?? 'medium',
        body.status ?? 'open',
        req.user!.id,
        body.assigned_to ?? null
      ]
    );

    await pool.query(
      `INSERT INTO case_events(case_id,event_type,message,actor_id)
       VALUES($1,'system','case created',$2)`,
      [r.rows[0].id, req.user!.id]
    );

    emitEvent('case-updated', { caseId: r.rows[0].id, title: r.rows[0].title });

    res.json({ item: r.rows[0] });
  } catch (e) {
    next(e);
  }
});

