import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../db';
import { emitEvent } from '../services/socketService';
import { generateAiSolution } from '../services/aiService';

export const casesRoutes = Router();

const CASE_FIELDS = `c.id, c.machine_id, c.problem_id, c.cause_id, c.category_id,
  c.description, c.solution, c.ai_solution, c.status, c.created_by, c.assigned_to,
  c.notes, c.created_at, c.updated_at, c.tempo_impiego,
  COALESCE(
    (SELECT string_agg(sp.name, ', ')
     FROM case_spare_parts csp
     JOIN spare_parts sp ON sp.id = csp.spare_part_id
     WHERE csp.case_id = c.id),
    'N.D.'
  ) AS spare_part_name,
  COALESCE(
    (SELECT string_agg(sa.name, ', ')
     FROM case_solutions_applied csa
     JOIN solutions_applied sa ON sa.id = csa.solution_id
     WHERE csa.case_id = c.id),
    'N.D.'
  ) AS solution_applied_name,
  COALESCE(
    (SELECT json_agg(json_build_object('id', sa.id, 'name', sa.name))
     FROM case_solutions_tried cst
     JOIN solutions_applied sa ON sa.id = cst.solution_id
     WHERE cst.case_id = c.id),
    '[]'::json
  ) AS soluzioni_provate,
  COALESCE(
    (SELECT json_agg(json_build_object('id', sa.id, 'name', sa.name))
     FROM case_solutions_applied csa
     JOIN solutions_applied sa ON sa.id = csa.solution_id
     WHERE csa.case_id = c.id),
    '[]'::json
  ) AS soluzioni_applicate,
  COALESCE(
    (SELECT json_agg(json_build_object('id', sp.id, 'name', sp.name))
     FROM case_spare_parts csp
     JOIN spare_parts sp ON sp.id = csp.spare_part_id
     WHERE csp.case_id = c.id),
    '[]'::json
  ) AS pezzi_ricambio`;


const CASE_JOINS = `
  JOIN machines m ON m.id = c.machine_id
  LEFT JOIN users u ON u.id = c.created_by
  LEFT JOIN categories prob ON prob.id = c.problem_id
  LEFT JOIN categories cause ON cause.id = c.cause_id
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
              COALESCE(oper.name, u.username) as operator_name,
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

casesRoutes.get('/export-csv', authMiddleware, async (req, res, next) => {
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
      line
    } = req.query as Record<string, string>;

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
      `SELECT c.id, m.code as machine_code, m.name as machine_name, u.username as created_by_username,
              COALESCE(oper.name, u.username) as operator_name,
              prob.name as problem_name, cause.name as cause_name,
              COALESCE(
                (SELECT string_agg(sp.name, ', ')
                 FROM case_spare_parts csp
                 JOIN spare_parts sp ON sp.id = csp.spare_part_id
                 WHERE csp.case_id = c.id),
                'N.D.'
              ) AS spare_part_name,
              COALESCE(
                (SELECT string_agg(sa.name, ', ')
                 FROM case_solutions_applied csa
                 JOIN solutions_applied sa ON sa.id = csa.solution_id
                 WHERE csa.case_id = c.id),
                'N.D.'
              ) AS solution_applied_name,
              c.description, c.solution, c.notes, c.ai_solution, c.status, c.created_at
       FROM cases c
       ${CASE_JOINS}
       ${whereClause}
       ORDER BY c.created_at DESC`,
      values
    );

    const headers = [
      'ID Caso',
      'Codice Macchina',
      'Nome Macchina',
      'Operatore',
      'Problema',
      'Causa',
      'Ricambio Usato',
      'Soluzione Applicata',
      'Descrizione',
      'Note',
      'Soluzione AI',
      'Stato',
      'Data Creazione'
    ];

    const escapeCSV = (val: any) => {
      if (val === null || val === undefined) return '';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    let csvContent = headers.join(',') + '\n';
    for (const row of r.rows) {
      const lineData = [
        row.id,
        row.machine_code,
        row.machine_name,
        row.operator_name,
        row.problem_name,
        row.cause_name,
        row.spare_part_name,
        row.solution_applied_name,
        row.description || row.solution,
        row.notes,
        row.ai_solution,
        row.status,
        row.created_at ? new Date(row.created_at).toISOString() : ''
      ];
      csvContent += lineData.map(escapeCSV).join(',') + '\n';
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="casi_esportati.csv"');
    return res.status(200).send(csvContent);
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
              COALESCE(oper.name, u.username) as operator_name,
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
      macchina_id?: string;
      problem_id?: string | null;
      cause_id?: string | null;
      soluzioni_provate?: string[];
      soluzioni_applicate?: string[];
      pezzi_ricambio?: string[];
      tempo_impiego?: number;
      utente_id?: string;
      notes?: string | null;
      note_aggiuntive?: string | null;
    };

    const finalMachineId = body.machine_id || body.macchina_id;
    const finalUtenteId = body.utente_id || req.user!.id;
    const finalNotes = body.notes || body.note_aggiuntive;

    const missing: string[] = [];
    if (!finalMachineId) missing.push('macchina');
    if (!body.problem_id) missing.push('problema');
    if (!body.cause_id) missing.push('causa');
    if (!body.soluzioni_applicate || !body.soluzioni_applicate.length) missing.push('soluzione applicata');
    if (body.tempo_impiego === undefined || body.tempo_impiego < 0.5) {
      return res.status(400).json({ error: 'Tempo impiego deve essere maggiore o uguale a 0.5 ore' });
    }

    if (missing.length) {
      return res.status(400).json({ error: `Campo obbligatorio mancante: ${missing[0]}` });
    }

    if (finalNotes && finalNotes.length > 1000) {
      return res.status(400).json({ error: 'Le note non possono superare i 1000 caratteri.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const machineQuery = await client.query('SELECT code, name, line, type FROM machines WHERE id = $1', [finalMachineId]);
      const machineRecord = machineQuery.rows[0];
      if (!machineRecord) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Macchina non trovata' });
      }

      let solutionAppliedDesc = '';
      if (body.soluzioni_applicate && body.soluzioni_applicate.length > 0) {
        const saR = await client.query(
          `SELECT name, description FROM solutions_applied WHERE id = ANY($1::uuid[])`,
          [body.soluzioni_applicate]
        );
        solutionAppliedDesc = saR.rows
          .map((row) => row.description ?? row.name)
          .filter(Boolean)
          .join(', ');
      }

      const r = await client.query(
        `INSERT INTO cases(machine_id, problem_id, cause_id, description, solution, ai_solution,
                          status, created_by, assigned_to, notes, tempo_impiego)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          finalMachineId,
          body.problem_id ?? null,
          body.cause_id ?? null,
          solutionAppliedDesc || null,
          solutionAppliedDesc || null,
          null,
          'closed',
          finalUtenteId,
          null,
          finalNotes?.trim() || null,
          body.tempo_impiego
        ]
      );

      const caseId = r.rows[0].id;

      // Insert junction tables
      if (body.soluzioni_provate && body.soluzioni_provate.length > 0) {
        for (const solId of body.soluzioni_provate) {
          if (solId) {
            await client.query(
              `INSERT INTO case_solutions_tried(case_id, solution_id) VALUES($1, $2) ON CONFLICT DO NOTHING`,
              [caseId, solId]
            );
          }
        }
      }

      if (body.soluzioni_applicate && body.soluzioni_applicate.length > 0) {
        for (const solId of body.soluzioni_applicate) {
          if (solId) {
            await client.query(
              `INSERT INTO case_solutions_applied(case_id, solution_id) VALUES($1, $2) ON CONFLICT DO NOTHING`,
              [caseId, solId]
            );
          }
        }
      }

      if (body.pezzi_ricambio && body.pezzi_ricambio.length > 0) {
        for (const spId of body.pezzi_ricambio) {
          if (spId) {
            await client.query(
              `INSERT INTO case_spare_parts(case_id, spare_part_id) VALUES($1, $2) ON CONFLICT DO NOTHING`,
              [caseId, spId]
            );
          }
        }
      }

      await client.query(
        `INSERT INTO case_events(case_id,event_type,message,actor_id)
         VALUES($1,'system','case created',$2)`,
        [caseId, finalUtenteId]
      );

      await client.query('COMMIT');

      emitEvent('case_created', { caseId });
      emitEvent('case-updated', { caseId });

      res.json({ success: true, case_id: caseId, message: 'Caso creato con successo', item: r.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
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
      macchina_id?: string;
      problem_id?: string | null;
      cause_id?: string | null;
      soluzioni_provate?: string[];
      soluzioni_applicate?: string[];
      pezzi_ricambio?: string[];
      tempo_impiego?: number;
      notes?: string | null;
      note_aggiuntive?: string | null;
    };

    const finalMachineId = body.machine_id || body.macchina_id;
    const finalNotes = body.notes || body.note_aggiuntive;

    const missing: string[] = [];
    if (!finalMachineId) missing.push('macchina');
    if (!body.problem_id) missing.push('problema');
    if (!body.cause_id) missing.push('causa');
    if (!body.soluzioni_applicate || !body.soluzioni_applicate.length) missing.push('soluzione applicata');
    if (body.tempo_impiego === undefined || body.tempo_impiego < 0.5) {
      return res.status(400).json({ error: 'Tempo impiego deve essere maggiore o uguale a 0.5 ore' });
    }

    if (missing.length) {
      return res.status(400).json({ error: `Campo obbligatorio mancante: ${missing[0]}` });
    }

    if (finalNotes && finalNotes.length > 1000) {
      return res.status(400).json({ error: 'Le note non possono superare i 1000 caratteri.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let solutionAppliedDesc = '';
      if (body.soluzioni_applicate && body.soluzioni_applicate.length > 0) {
        const saR = await client.query(
          `SELECT name, description FROM solutions_applied WHERE id = ANY($1::uuid[])`,
          [body.soluzioni_applicate]
        );
        solutionAppliedDesc = saR.rows
          .map((row) => row.description ?? row.name)
          .filter(Boolean)
          .join(', ');
      }

      const r = await client.query(
        `UPDATE cases
         SET machine_id = $1, problem_id = $2, cause_id = $3, description = $4, solution = $5,
             notes = $6, tempo_impiego = $7, updated_at = now()
         WHERE id = $8
         RETURNING *`,
        [
          finalMachineId,
          body.problem_id ?? null,
          body.cause_id ?? null,
          solutionAppliedDesc || null,
          solutionAppliedDesc || null,
          finalNotes?.trim() || null,
          body.tempo_impiego,
          req.params.id
        ]
      );

      // Update solutions tried
      await client.query(`DELETE FROM case_solutions_tried WHERE case_id = $1`, [req.params.id]);
      if (body.soluzioni_provate && body.soluzioni_provate.length > 0) {
        for (const solId of body.soluzioni_provate) {
          if (solId) {
            await client.query(
              `INSERT INTO case_solutions_tried(case_id, solution_id) VALUES($1, $2) ON CONFLICT DO NOTHING`,
              [req.params.id, solId]
            );
          }
        }
      }

      // Update solutions applied
      await client.query(`DELETE FROM case_solutions_applied WHERE case_id = $1`, [req.params.id]);
      if (body.soluzioni_applicate && body.soluzioni_applicate.length > 0) {
        for (const solId of body.soluzioni_applicate) {
          if (solId) {
            await client.query(
              `INSERT INTO case_solutions_applied(case_id, solution_id) VALUES($1, $2) ON CONFLICT DO NOTHING`,
              [req.params.id, solId]
            );
          }
        }
      }

      // Update spare parts
      await client.query(`DELETE FROM case_spare_parts WHERE case_id = $1`, [req.params.id]);
      if (body.pezzi_ricambio && body.pezzi_ricambio.length > 0) {
        for (const spId of body.pezzi_ricambio) {
          if (spId) {
            await client.query(
              `INSERT INTO case_spare_parts(case_id, spare_part_id) VALUES($1, $2) ON CONFLICT DO NOTHING`,
              [req.params.id, spId]
            );
          }
        }
      }

      await client.query(
        `INSERT INTO case_events(case_id,event_type,message,actor_id)
         VALUES($1,'update','case updated',$2)`,
        [req.params.id, req.user!.id]
      );

      await client.query('COMMIT');

      emitEvent('case-updated', { caseId: req.params.id });

      res.json({ item: r.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
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
