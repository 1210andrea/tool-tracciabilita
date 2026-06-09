import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../db';
import { formatOllamaUnavailableMessage, generateCaseInsights } from '../services/aiService';

export const aiRoutes = Router();

aiRoutes.post('/analyze', authMiddleware, async (req, res, next) => {
  try {
    const { machine_id, problem_id, cause_id } = req.body as {
      machine_id?: string;
      problem_id?: string;
      cause_id?: string;
    };

    if (!machine_id || !problem_id || !cause_id) {
      return res.status(400).json({ error: 'machine_id, problem_id e cause_id sono obbligatori' });
    }

    const machineR = await pool.query('SELECT code, name, line FROM machines WHERE id = $1', [machine_id]);
    const machine = machineR.rows[0];
    if (!machine) return res.status(400).json({ error: 'Macchina non trovata' });

    const names = await Promise.all(
      [problem_id, cause_id].map(async (id) => {
        if (!id) return 'N/D';
        const r = await pool.query('SELECT name FROM categories WHERE id = $1', [id]);
        return r.rows[0]?.name ?? 'N/D';
      })
    );

    const similarR = await pool.query(
      `SELECT c.solution, c.status, c.created_at,
              m.code as machine_code, m.line, prob.name as problem_name, cause.name as cause_name,
              sp.name as spare_part_name
       FROM cases c
       JOIN machines m ON m.id = c.machine_id
       LEFT JOIN categories prob ON prob.id = c.problem_id
       LEFT JOIN categories cause ON cause.id = c.cause_id
       LEFT JOIN spare_parts sp ON sp.id = c.spare_part_id
       WHERE (
         (c.machine_id = $1 AND c.problem_id = $2)
         OR (c.problem_id = $2 AND m.line IS NOT DISTINCT FROM $3)
         OR (c.machine_id = $1 AND c.cause_id = $4)
       )
       ORDER BY c.created_at DESC
       LIMIT 15`,
      [machine_id, problem_id, machine.line, cause_id]
    );

    const countR = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE c.machine_id = $1 AND c.problem_id = $2)::int AS same_machine_problem,
         COUNT(*) FILTER (WHERE c.problem_id = $2 AND m.line IS NOT DISTINCT FROM $3)::int AS same_problem_line,
         COUNT(*)::int AS total_similar
       FROM cases c
       JOIN machines m ON m.id = c.machine_id
       WHERE (
         (c.machine_id = $1 AND c.problem_id = $2)
         OR (c.problem_id = $2 AND m.line IS NOT DISTINCT FROM $3)
         OR (c.machine_id = $1 AND c.cause_id = $4)
       )`,
      [machine_id, problem_id, machine.line, cause_id]
    );

    const counts = countR.rows[0];
    const similarCases = similarR.rows;

    if (!similarCases.length) {
      return res.json({
        insufficient: true,
        message: `Non ho abbastanza dati storici per la macchina ${machine.code} e il problema "${names[0]}". Non ci sono casi simili nel database.`
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
      machine: `${machine.code} - ${machine.name}`,
      line: machine.line ?? 'N/D',
      operator: 'N/D',
      problem: names[0],
      cause: names[1],
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
