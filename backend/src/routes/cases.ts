import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../services/dbService';
import { ioEmit } from '../services/redisService';

export const casesRoutes = Router();

casesRoutes.get('/', authMiddleware, async (_req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT c.*, m.code as machine_code, m.name as machine_name,
              cat.name as category_name
       FROM cases c
       JOIN machines m ON m.id=c.machine_id
       LEFT JOIN categories cat ON cat.id=c.category_id
       ORDER BY c.created_at DESC
       LIMIT 50`
    );
    res.json({ items: r.rows });
  } catch (e) {
    next(e);
  }
});

casesRoutes.post('/', authMiddleware, async (req, res, next) => {
  try {
    const body = req.body as {
      machine_id: string;
      category_id?: string;
      title: string;
      description?: string;
      priority?: string;
      status?: string;
      assigned_to?: string | null;
    };

    const r = await pool.query(
      `INSERT INTO cases(machine_id, category_id, title, description, priority, status, created_by, assigned_to)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        body.machine_id,
        body.category_id ?? null,
        body.title,
        body.description ?? null,
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

    // Emit realtime (room example)
    ioEmit('case-updated', { caseId: r.rows[0].id });

    res.json({ item: r.rows[0] });
  } catch (e) {
    next(e);
  }
});

