import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../db';
import { emitEvent } from '../services/socketService';
import { generateAiSolution, generateCaseInsights } from '../services/aiService';

export const casesRoutes = Router();

const CASE_FIELDS = `c.id, c.machine_id, c.operator_id, c.problem_id, c.cause_id, c.category_id,
  c.title, c.description, c.solution, c.ai_solution, c.status, c.created_by, c.assigned_to,
  c.created_at, c.updated_at`;

async function getCaseRow(caseId: string) {
  const r = await pool.query('SELECT * FROM cases WHERE id = $1', [caseId]);
  return r.rows[0] ?? null;
}

function canAccessCase(caseRow: { created_by: string | null }, userId: string, role: string) {
  return role === 'admin' || caseRow.created_by === userId;
}

casesRoutes.get('/', authMiddleware, async (req, res, next) => {
  try {
    const {
      status,
      machine_id,
      assigned_to,
      operator_id,
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
    if (operator_id) {
      values.push(operator_id as string);
      conditions.push(`c.operator_id = $${values.length}`);
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

casesRoutes.get('/:id/ai-insights', authMiddleware, async (req, res, next) => {
  try {
    const caseRow = await getCaseRow(req.params.id);
    if (!caseRow) return res.status(404).json({ error: 'Case not found' });
    if (!canAccessCase(caseRow, req.user!.id, req.user!.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const detail = await pool.query(
      `SELECT ${CASE_FIELDS}, m.code as machine_code, m.name as machine_name, m.line,
              op.name as operator_name, prob.name as problem_name, cause.name as cause_name
       FROM cases c
       JOIN machines m ON m.id = c.machine_id
       LEFT JOIN categories op ON op.id = c.operator_id
       LEFT JOIN categories prob ON prob.id = c.problem_id
       LEFT JOIN categories cause ON cause.id = c.cause_id
       WHERE c.id = $1`,
      [req.params.id]
    );
    const current = detail.rows[0];

    const similarR = await pool.query(
      `SELECT c.title, c.solution, c.status, c.created_at,
              m.code as machine_code, m.line, prob.name as problem_name, cause.name as cause_name
       FROM cases c
       JOIN machines m ON m.id = c.machine_id
       LEFT JOIN categories prob ON prob.id = c.problem_id
       LEFT JOIN categories cause ON cause.id = c.cause_id
       WHERE c.id != $1
         AND (
           (c.machine_id = $2 AND c.problem_id = $3)
           OR (c.problem_id = $3 AND m.line IS NOT DISTINCT FROM $4)
           OR (c.machine_id = $2 AND c.cause_id = $5)
         )
       ORDER BY c.created_at DESC
       LIMIT 15`,
      [req.params.id, current.machine_id, current.problem_id, current.line, current.cause_id]
    );

    const countR = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE c.machine_id = $2 AND c.problem_id = $3)::int AS same_machine_problem,
         COUNT(*) FILTER (WHERE c.problem_id = $3 AND m.line IS NOT DISTINCT FROM $4)::int AS same_problem_line,
         COUNT(*)::int AS total_similar
       FROM cases c
       JOIN machines m ON m.id = c.machine_id
       WHERE c.id != $1
         AND (
           (c.machine_id = $2 AND c.problem_id = $3)
           OR (c.problem_id = $3 AND m.line IS NOT DISTINCT FROM $4)
           OR (c.machine_id = $2 AND c.cause_id = $5)
         )`,
      [req.params.id, current.machine_id, current.problem_id, current.line, current.cause_id]
    );

    const counts = countR.rows[0];
    const similarCases = similarR.rows;

    if (!similarCases.length) {
      return res.json({
        insufficient: true,
        message: `Non ho abbastanza dati storici per la macchina ${current.machine_code} e il problema "${current.problem_name ?? 'N/D'}". Non ci sono casi simili nel database.`
      });
    }

    const withSolution = similarCases.filter((r: { solution?: string | null }) => r.solution?.trim());
    if (withSolution.length === 0 && similarCases.length < 2) {
      return res.json({
        insufficient: true,
        message: `Non ho abbastanza dati per spiegare come è stato risolto questo problema in passato. Ci sono ${similarCases.length} caso/i simile/i ma senza soluzioni documentate.`,
        stats: {
          same_machine_problem: counts.same_machine_problem,
          same_problem_line: counts.same_problem_line,
          total_similar: counts.total_similar
        }
      });
    }

    const analysis = await generateCaseInsights({
      machine: `${current.machine_code} - ${current.machine_name}`,
      line: current.line ?? 'N/D',
      operator: current.operator_name ?? 'N/D',
      problem: current.problem_name ?? 'N/D',
      cause: current.cause_name ?? 'N/D',
      counts: {
        same_machine_problem: counts.same_machine_problem,
        same_problem_line: counts.same_problem_line,
        total_similar: counts.total_similar
      },
      similarCases
    });

    if (!analysis) {
      return res.json({
        insufficient: true,
        message: 'Il servizio IA (Ollama) non è al momento disponibile. Riprova più tardi.',
        stats: {
          same_machine_problem: counts.same_machine_problem,
          same_problem_line: counts.same_problem_line,
          total_similar: counts.total_similar
        }
      });
    }

    res.json({
      insufficient: false,
      stats: {
        same_machine_problem: counts.same_machine_problem,
        same_problem_line: counts.same_problem_line,
        total_similar: counts.total_similar
      },
      analysis
    });
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
              op.name as operator_name, prob.name as problem_name, cause.name as cause_name
       FROM cases c
       JOIN machines m ON m.id = c.machine_id
       LEFT JOIN users u ON u.id = c.created_by
       LEFT JOIN categories op ON op.id = c.operator_id
       LEFT JOIN categories prob ON prob.id = c.problem_id
       LEFT JOIN categories cause ON cause.id = c.cause_id
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
      operator_id?: string;
      problem_id?: string;
      cause_id?: string;
      title?: string;
      description?: string;
      solution?: string;
      status?: string;
      assigned_to?: string | null;
    };

    const solution = (body.solution ?? body.description ?? '').toString();

    const missing: string[] = [];
    if (!body.machine_id) missing.push('machine_id');
    if (!body.operator_id) missing.push('operator_id');
    if (!body.problem_id) missing.push('problem_id');
    if (!body.cause_id) missing.push('cause_id');
    if (!body.title) missing.push('title');
    if (!solution.trim()) missing.push('solution (o description)');

    if (missing.length) {
      return res.status(400).json({ error: `Campo obbligatorio mancante: ${missing[0]}` });
    }

    if (solution.trim().length < 10) {
      return res.status(400).json({ error: 'solution deve contenere almeno 10 caratteri.' });
    }

    const machineQuery = await pool.query('SELECT code, name, line FROM machines WHERE id = $1', [body.machine_id]);
    const machineRecord = machineQuery.rows[0];
    const machineName = machineRecord?.name ?? body.machine_id;
    const machineLine = machineRecord?.line ?? 'N/A';

    const categoryNames = await Promise.all(
      ['operator_id', 'problem_id', 'cause_id'].map(async (key) => {
        const id = body[key as 'operator_id' | 'problem_id' | 'cause_id'] as string | undefined;
        if (!id) return 'N/A';
        const cat = await pool.query('SELECT name FROM categories WHERE id = $1', [id]);
        return cat.rows[0]?.name ?? 'N/A';
      })
    );

    const ai_solution = await generateAiSolution({
      machine: `${machineName}`,
      line: machineLine,
      operator: categoryNames[0],
      problem: categoryNames[1],
      cause: categoryNames[2],
      description: solution
    });

    const r = await pool.query(
      `INSERT INTO cases(machine_id, operator_id, problem_id, cause_id, title, description, solution, ai_solution,
                        status, created_by, assigned_to)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        body.machine_id,
        body.operator_id ?? null,
        body.problem_id ?? null,
        body.cause_id ?? null,
        body.title,
        body.description ?? null,
        solution,
        ai_solution,
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

    emitEvent('case_created', { caseId: r.rows[0].id, title: r.rows[0].title });
    emitEvent('case-updated', { caseId: r.rows[0].id, title: r.rows[0].title });

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
      operator_id?: string;
      problem_id?: string;
      cause_id?: string;
      title?: string;
      description?: string;
      solution?: string;
      status?: string;
    };

    const solution = (body.solution ?? body.description ?? caseRow.solution ?? '').toString();

    const missing: string[] = [];
    if (!body.machine_id) missing.push('machine_id');
    if (!body.operator_id) missing.push('operator_id');
    if (!body.problem_id) missing.push('problem_id');
    if (!body.cause_id) missing.push('cause_id');
    if (!body.title) missing.push('title');
    if (!solution.trim()) missing.push('solution');

    if (missing.length) {
      return res.status(400).json({ error: `Campo obbligatorio mancante: ${missing[0]}` });
    }

    if (solution.trim().length < 10) {
      return res.status(400).json({ error: 'solution deve contenere almeno 10 caratteri.' });
    }

    const r = await pool.query(
      `UPDATE cases
       SET machine_id = $1, operator_id = $2, problem_id = $3, cause_id = $4,
           title = $5, description = $6, solution = $7, status = $8, updated_at = now()
       WHERE id = $9
       RETURNING *`,
      [
        body.machine_id,
        body.operator_id,
        body.problem_id,
        body.cause_id,
        body.title,
        body.description ?? null,
        solution,
        body.status ?? caseRow.status,
        req.params.id
      ]
    );

    await pool.query(
      `INSERT INTO case_events(case_id,event_type,message,actor_id)
       VALUES($1,'update','case updated',$2)`,
      [req.params.id, req.user!.id]
    );

    emitEvent('case-updated', { caseId: req.params.id, title: r.rows[0].title });

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
