import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../db';
import { emitEvent } from '../services/socketService';
import { generateAiSolution } from '../services/aiService';

export const casesRoutes = Router();

const CASE_FIELDS = `c.id, c.machine_id, c.problem_id, c.cause_id, c.spare_part_id, c.solution_applied_id, c.category_id,
  c.description, c.solution, c.ai_solution, c.status, c.created_by, c.assigned_to,
  c.created_at, c.updated_at`;


const CASE_JOINS = `
  JOIN machines m ON m.id = c.machine_id
  LEFT JOIN users u ON u.id = c.created_by
  LEFT JOIN categories prob ON prob.id = c.problem_id
  LEFT JOIN categories cause ON cause.id = c.cause_id
  LEFT JOIN spare_parts sp ON sp.id = c.spare_part_id
  LEFT JOIN solutions_applied sa ON sa.id = c.solution_applied_id
  LEFT JOIN categories oper ON oper.id = (SELECT operator_category_id FROM users uu WHERE uu.id = c.created_by)`;




async function getCaseRow(caseId: string) {
  const r = await pool.query('SELECT * FROM cases WHERE id = $1', [caseId]);
  return r.rows[0] ?? null;
}

function canAccessCase(caseRow: { created_by: string | null }, userId: string, role: string) {
  return role === 'admin' || caseRow.created_by === userId;
}

async function lookupName(table: 'categories' | 'spare_parts', id?: string | null) {
  if (!id) return 'N/D';
  const r = await pool.query(`SELECT name FROM ${table} WHERE id = $1`, [id]);
  return r.rows[0]?.name ?? 'N/D';
}

casesRoutes.get('/', authMiddleware, async (req, res, next) => {
  try {
    const {
      status,
      machine_id,
      assigned_to,
      problem_id,
      cause_id,
      date_from,
      date_to,
      time_from,
      time_to,
      line,
      page = '1',
      limit = '25'
    } = req.query as Record<string, string>;

    const pageNumber = Math.max(1, Number(page) || 1);
    const limitNumber = Math.min(100, Math.max(1, Number(limit) || 25));
    const offset = (pageNumber - 1) * limitNumber;
    const conditions: string[] = [];
    const values: Array<string | number | string[]> = [];

    if (req.user!.role !== 'admin') {
      values.push(req.user!.id);
      conditions.push(`c.created_by = $${values.length}`);
    }

    if (req.query.statuses) {
      const statuses = (req.query.statuses as string).split(',').map((s) => s.trim()).filter(Boolean);
      if (statuses.length) {
        values.push(statuses);
        conditions.push(`c.status = ANY($${values.length})`);
      }
    } else if (status) {
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
    if (req.query.month) {
      values.push(Number(req.query.month));
      conditions.push(`EXTRACT(MONTH FROM c.created_at)::int = $${values.length}`);
    }
    if (req.query.year) {
      values.push(Number(req.query.year));
      conditions.push(`EXTRACT(YEAR FROM c.created_at)::int = $${values.length}`);
    }
    if (problem_id) {
      values.push(problem_id as string);
      conditions.push(`c.problem_id = $${values.length}`);
    }
    if (cause_id) {
      values.push(cause_id as string);
      conditions.push(`c.cause_id = $${values.length}`);
    }
    if (date_from) {
      values.push(date_from as string);
      conditions.push(`c.created_at::date >= $${values.length}`);
    }
    if (date_to) {
      values.push(date_to as string);
      conditions.push(`c.created_at::date <= $${values.length}`);
    }
    if (time_from) {
      values.push(time_from as string);
      conditions.push(`TO_CHAR(c.created_at, 'HH24:MI') >= $${values.length}`);
    }
    if (time_to) {
      values.push(time_to as string);
      conditions.push(`TO_CHAR(c.created_at, 'HH24:MI') <= $${values.length}`);
    }
    if (line) {
      values.push(line as string);
      conditions.push(`m.line = $${values.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const r = await pool.query(
      `SELECT ${CASE_FIELDS}, m.code as machine_code, m.name as machine_name, u.username as created_by_username,
              prob.name as problem_name, cause.name as cause_name,
              sp.name as spare_part_name, sa.name as solution_applied_name,
              COUNT(*) OVER() AS total_count
       FROM cases c
       ${CASE_JOINS}
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

casesRoutes.get('/:id', authMiddleware, async (req, res, next) => {
  try {
    const caseRow = await getCaseRow(req.params.id);
    if (!caseRow) return res.status(404).json({ error: 'Case not found' });
    if (!canAccessCase(caseRow, req.user!.id, req.user!.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const r = await pool.query(
      `SELECT ${CASE_FIELDS}, m.code as machine_code, m.name as machine_name, u.username as created_by_username,
              prob.name as problem_name, cause.name as cause_name,
              sp.name as spare_part_name, sa.name as solution_applied_name
       FROM cases c
       ${CASE_JOINS}
       WHERE c.id = $1`,
      [req.params.id]
    );

    res.json({ item: r.rows[0] });
  } catch (e) {
    next(e);
  }
});

casesRoutes.post('/', authMiddleware, async (req, res, next) => {
  try {
    const body = req.body as {
      machine_id?: string;
      problem_id?: string | null;
      cause_id?: string | null;
      spare_part_id?: string | null;
      solution_applied_id?: string | null;
      description?: string;
      solution?: string;
      assigned_to?: string | null;
    };

    const missing: string[] = [];
    if (!body.machine_id) missing.push('macchina');
    if (!body.problem_id) missing.push('problema');
    if (!body.cause_id) missing.push('causa');
    if (!body.spare_part_id) missing.push('pezzo di ricambio');
    if (!body.solution_applied_id) missing.push('soluzione applicata');
    if (missing.length) {
      return res.status(400).json({ error: `Campo obbligatorio mancante: ${missing[0]}` });
    }

    const machineQuery = await pool.query('SELECT code, name, line, type FROM machines WHERE id = $1', [body.machine_id]);
    const machineRecord = machineQuery.rows[0];
    if (!machineRecord) {
      return res.status(400).json({ error: 'Macchina non trovata' });
    }

    const problemName = await lookupName('categories', body.problem_id);
    const causeName = await lookupName('categories', body.cause_id);
    const sparePartName = await lookupName('spare_parts', body.spare_part_id);

    let solutionAppliedDesc = '';
    if (body.solution_applied_id) {
      const saR = await pool.query('SELECT name, description FROM solutions_applied WHERE id = $1', [body.solution_applied_id]);
      solutionAppliedDesc = saR.rows[0]?.description ?? saR.rows[0]?.name ?? '';
    }

    const combinedDescription = solutionAppliedDesc || 'N/D';

    // Creazione caso: ritorna subito, generazione AI in background
    const r = await pool.query(
      `INSERT INTO cases(machine_id, problem_id, cause_id, spare_part_id, solution_applied_id, description, solution, ai_solution,
                        status, created_by, assigned_to)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        body.machine_id,
        body.problem_id ?? null,
        body.cause_id ?? null,
        body.spare_part_id ?? null,
        body.solution_applied_id ?? null,
        solutionAppliedDesc || null,
        solutionAppliedDesc || null,
        null,
        'closed',
        req.user!.id,
        body.assigned_to ?? null
      ]
    );

    // Kick off async AI generation (senza bloccare la risposta)
    generateAiSolution({
      machine: `${machineRecord.name}`,
      line: machineRecord.line ?? 'N/A',
      problem: problemName,
      cause: causeName,
      sparePart: sparePartName,
      description: combinedDescription
    })
      .then(async (ai_solution) => {
        await pool.query('UPDATE cases SET ai_solution = $1, updated_at = now() WHERE id = $2', [ai_solution, r.rows[0].id]);
        emitEvent('case-updated', { caseId: r.rows[0].id });
      })
      .catch((err) => {
        // non blocchiamo l'utente: log/gestione errori in background
        // eslint-disable-next-line no-console
        console.error('AI generation failed', err);
      });



    await pool.query(
      `INSERT INTO case_events(case_id,event_type,message,actor_id)
       VALUES($1,'system','case created',$2)`,
      [r.rows[0].id, req.user!.id]
    );

    emitEvent('case_created', { caseId: r.rows[0].id });
    emitEvent('case-updated', { caseId: r.rows[0].id });

    res.json({ item: r.rows[0] });
  } catch (e) {
    next(e);
  }
});

casesRoutes.put('/:id', authMiddleware, async (req, res, next) => {
  try {
    const caseRow = await getCaseRow(req.params.id);
    if (!caseRow) return res.status(404).json({ error: 'Case not found' });
    if (!canAccessCase(caseRow, req.user!.id, req.user!.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const body = req.body as {
      machine_id?: string;
      problem_id?: string | null;
      cause_id?: string | null;
      spare_part_id?: string | null;
      solution_applied_id?: string | null;
      description?: string;
      solution?: string;
    };

    const missing: string[] = [];
    if (!body.machine_id) missing.push('macchina');
    if (!body.problem_id) missing.push('problema');
    if (!body.cause_id) missing.push('causa');
    if (!body.spare_part_id) missing.push('pezzo di ricambio');
    if (!body.solution_applied_id) missing.push('soluzione applicata');
    if (missing.length) {
      return res.status(400).json({ error: `Campo obbligatorio mancante: ${missing[0]}` });
    }

    let solutionAppliedDesc = '';
    const saR = await pool.query('SELECT name, description FROM solutions_applied WHERE id = $1', [body.solution_applied_id]);
    solutionAppliedDesc = saR.rows[0]?.description ?? saR.rows[0]?.name ?? '';

    const r = await pool.query(
      `UPDATE cases
       SET machine_id = $1, problem_id = $2, cause_id = $3, spare_part_id = $4, solution_applied_id = $5,
           description = $6, solution = $7, updated_at = now()
       WHERE id = $8
       RETURNING *`,
      [
        body.machine_id,
        body.problem_id ?? null,
        body.cause_id ?? null,
        body.spare_part_id ?? null,
        body.solution_applied_id ?? null,
        solutionAppliedDesc || null,
        solutionAppliedDesc || null,
        req.params.id
      ]
    );

    await pool.query(
      `INSERT INTO case_events(case_id,event_type,message,actor_id)
       VALUES($1,'update','case updated',$2)`,
      [req.params.id, req.user!.id]
    );

    emitEvent('case-updated', { caseId: req.params.id });

    res.json({ item: r.rows[0] });
  } catch (e) {
    next(e);
  }
});

casesRoutes.delete('/:id', authMiddleware, async (req, res, next) => {
  try {
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Solo gli admin possono eliminare i casi' });
    }

    const caseRow = await getCaseRow(req.params.id);
    if (!caseRow) return res.status(404).json({ error: 'Case not found' });

    await pool.query('DELETE FROM cases WHERE id = $1', [req.params.id]);
    emitEvent('case-updated', { caseId: req.params.id, action: 'deleted' });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
