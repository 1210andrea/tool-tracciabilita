import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../db';
import { formatOllamaUnavailableMessage, generateCaseInsights } from '../services/aiService';

export const aiRoutes = Router();

aiRoutes.post('/suggest-solution', authMiddleware, async (req, res, next) => {
  try {
    const { machine_id, problem_id, cause_id, description, spare_part_id, notes } = req.body as {
      machine_id?: string;
      problem_id?: string | null;
      cause_id?: string | null;
      description?: string;
      spare_part_id?: string | null;
      notes?: string;
    };

    if (!machine_id) return res.status(400).json({ error: 'machine_id è obbligatorio' });

    const [machineR, problemR, causeR, spareR] = await Promise.all([
      pool.query('SELECT code, name, line, tipologia FROM machines WHERE id = $1', [machine_id]),
      problem_id ? pool.query('SELECT name FROM categories WHERE id = $1', [problem_id]) : Promise.resolve({ rows: [] }),
      cause_id ? pool.query('SELECT name FROM categories WHERE id = $1', [cause_id]) : Promise.resolve({ rows: [] }),
      spare_part_id ? pool.query('SELECT name FROM spare_parts WHERE id = $1', [spare_part_id]) : Promise.resolve({ rows: [] })
    ]);

    const machine = machineR.rows[0];
    if (!machine) return res.status(400).json({ error: 'Macchina non trovata' });

    const problemName = problemR.rows[0]?.name ?? 'N/D';
    const causeName = causeR.rows[0]?.name ?? 'N/D';
    const sparePartName = spareR.rows[0]?.name ?? 'N/D';
    const desc = description?.trim() ? description.trim() : 'N/D';

    // Usa lo stesso generatore esistente (quick suggestion) senza bloccare DB
    const { generateAiSolution } = await import('../services/aiService');
    const suggestion = await generateAiSolution({
      machine: `${machine.name}`,
      line: machine.line ?? 'N/A',
      problem: problemName,
      cause: causeName,
      sparePart: sparePartName,
      description: desc,
      notes: notes?.trim() || undefined
    });

    res.json({ suggestion, insufficient: false });
  } catch (e) {
    next(e);
  }
});

aiRoutes.post('/analyze', authMiddleware, async (req, res, next) => {

  try {
    const { machine_id, problem_id, cause_id } = req.body as {
      machine_id?: string;
      problem_id?: string;
      cause_id?: string;
    };

    if (!machine_id) {
      return res.status(400).json({ error: 'machine_id è obbligatorio' });
    }

    const machineR = await pool.query('SELECT code, name, line FROM machines WHERE id = $1', [machine_id]);
    const machine = machineR.rows[0];
    if (!machine) return res.status(400).json({ error: 'Macchina non trovata' });

    const problemName = problem_id
      ? (await pool.query('SELECT name FROM categories WHERE id = $1', [problem_id])).rows[0]?.name ?? 'N/D'
      : 'N/D';
    const causeName = cause_id
      ? (await pool.query('SELECT name FROM categories WHERE id = $1', [cause_id])).rows[0]?.name ?? 'N/D'
      : 'N/D';

    const filterConditions = ['c.machine_id = $1'];
    const filterValues: Array<string | null> = [machine_id];

    if (problem_id) {
      filterValues.push(problem_id);
      filterConditions.push(`c.problem_id = $${filterValues.length}`);
    }
    if (cause_id) {
      filterValues.push(cause_id);
      filterConditions.push(`c.cause_id = $${filterValues.length}`);
    }

    const whereClause = filterConditions.join(' AND ');

    const similarR = await pool.query(
      `SELECT c.solution, c.status, c.created_at, c.notes,
              m.code as machine_code, m.line, prob.name as problem_name, cause.name as cause_name,
              sp.name as spare_part_name
       FROM cases c
       JOIN machines m ON m.id = c.machine_id
       LEFT JOIN categories prob ON prob.id = c.problem_id
       LEFT JOIN categories cause ON cause.id = c.cause_id
       LEFT JOIN spare_parts sp ON sp.id = c.spare_part_id
       WHERE ${whereClause}
       ORDER BY c.created_at DESC
       LIMIT 15`,
      filterValues
    );

    const problemParam = problem_id ?? null;
    const countR = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE c.machine_id = $1 AND ($${filterValues.length + 1}::uuid IS NULL OR c.problem_id = $${filterValues.length + 1}))::int AS same_machine_problem,
         COUNT(*) FILTER (WHERE $${filterValues.length + 1}::uuid IS NOT NULL AND c.problem_id = $${filterValues.length + 1} AND m.line IS NOT DISTINCT FROM $${filterValues.length + 2})::int AS same_problem_line,
         COUNT(*)::int AS total_similar
       FROM cases c
       JOIN machines m ON m.id = c.machine_id
       WHERE ${whereClause}`,
      [...filterValues, problemParam, machine.line]
    );

    const counts = countR.rows[0];
    const similarCases = similarR.rows;

    if (!similarCases.length) {
      return res.json({
        insufficient: true,
        message: problem_id
          ? `Non ho abbastanza dati storici per la macchina ${machine.code} e il problema "${problemName}".`
          : `Non ho abbastanza dati storici per la macchina ${machine.code}.`
      });
    }

    const withSolution = similarCases.filter((r: { solution?: string | null }) => r.solution?.trim());
    if (withSolution.length === 0 && similarCases.length < 2) {
      return res.json({
        insufficient: true,
        message: `Non ho abbastanza dati per spiegare come è stato risolto in passato. Ci sono ${similarCases.length} caso/i ma senza soluzioni documentate.`,
        stats: {
          same_machine_problem: counts.same_machine_problem,
          same_problem_line: counts.same_problem_line,
          total_similar: counts.total_similar
        }
      });
    }

    const analysis = await generateCaseInsights({
      machine: `${machine.code} - ${machine.name}`,
      line: machine.line ?? 'N/D',
      operator: 'N/D',
      problem: problemName,
      cause: causeName,
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
        message: formatOllamaUnavailableMessage(),
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
