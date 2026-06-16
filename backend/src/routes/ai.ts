import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../db';
import { logger } from '../config/logger';
import {
  buildHistoricalAnalysisContext,
  formatOllamaUnavailableMessage,
  generateHistoricalAnalysis,
  getLastOllamaError,
  getOllamaErrorMessage,
  type HistoricalCaseRow,
  type SparePartHistoryRow
} from '../services/aiService';

export const aiRoutes = Router();

const HISTORICAL_CASES_SQL = `
  SELECT c.solution, c.status, c.created_at, c.notes,
         m.code as machine_code, m.name as machine_name, m.line,
         prob.name as problem_name, cause.name as cause_name,
         COALESCE(oper.nome, 'N/D') as operator_name,
         COALESCE(
           (SELECT string_agg(sa.name, ', ')
            FROM case_solutions_tried cst
            JOIN solutions_applied sa ON sa.id = cst.solution_id
            WHERE cst.case_id = c.id),
           'N.D.'
         ) AS solutions_tried,
         COALESCE(
           (SELECT string_agg(sa.name, ', ')
            FROM case_solutions_applied csa
            JOIN solutions_applied sa ON sa.id = csa.solution_id
            WHERE csa.case_id = c.id),
           'N.D.'
         ) AS solutions_applied,
         COALESCE(
           (SELECT string_agg(sp.name, ', ')
            FROM case_spare_parts csp
            JOIN spare_parts sp ON sp.id = csp.spare_part_id
            WHERE csp.case_id = c.id),
           'N.D.'
         ) AS spare_parts
  FROM cases c
  JOIN machines m ON m.id = c.machine_id
  LEFT JOIN categories prob ON prob.id = c.problem_id
  LEFT JOIN categories cause ON cause.id = c.cause_id
  LEFT JOIN operatori oper ON oper.id = c.operatore_id
`;

async function fetchHistoricalCases(
  machineId: string,
  problemId: string | null,
  line: string | null,
  scope: 'machine' | 'line'
): Promise<HistoricalCaseRow[]> {
  const conditions = scope === 'machine'
    ? ['c.machine_id = $1']
    : ['m.line IS NOT DISTINCT FROM $2'];
  const values: Array<string | null> = scope === 'machine' ? [machineId] : [machineId, line];

  if (problemId) {
    values.push(problemId);
    conditions.push(`c.problem_id = $${values.length}`);
  }

  const r = await pool.query(
    `${HISTORICAL_CASES_SQL}
     WHERE ${conditions.join(' AND ')}
     ORDER BY c.created_at DESC
     LIMIT 20`,
    values
  );
  return r.rows as HistoricalCaseRow[];
}

async function fetchSparePartsHistory(
  machineId: string,
  line: string | null,
  scope: 'machine' | 'line'
): Promise<SparePartHistoryRow[]> {
  const conditions = scope === 'machine'
    ? ['c.machine_id = $1']
    : ['m.line IS NOT DISTINCT FROM $2'];
  const values: Array<string | null> = scope === 'machine' ? [machineId] : [machineId, line];

  const r = await pool.query(
    `SELECT sp.name, sp.description, COUNT(*)::int AS usage_count
     FROM case_spare_parts csp
     JOIN spare_parts sp ON sp.id = csp.spare_part_id
     JOIN cases c ON c.id = csp.case_id
     JOIN machines m ON m.id = c.machine_id
     WHERE ${conditions.join(' AND ')}
     GROUP BY sp.id, sp.name, sp.description
     ORDER BY usage_count DESC
     LIMIT 15`,
    values
  );
  return r.rows as SparePartHistoryRow[];
}

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
  const payload = req.body;
  logger.info({ aiAnalyze: { payload: JSON.stringify(payload) } });

  try {
    const { machine_id, problem_id, cause_id } = payload as {
      machine_id?: string;
      problem_id?: string;
      cause_id?: string;
    };

    if (!machine_id) {
      return res.status(400).json({ success: false, error: 'machine_id è obbligatorio' });
    }

    const machineR = await pool.query('SELECT code, name, line FROM machines WHERE id = $1', [machine_id]);
    const machine = machineR.rows[0];
    if (!machine) {
      return res.status(400).json({
        success: false,
        error: 'Nessun storico trovato per questa macchina',
        details: { reason: 'machine_not_found', machine_id }
      });
    }

    const problemName = problem_id
      ? (await pool.query('SELECT name FROM categories WHERE id = $1', [problem_id])).rows[0]?.name ?? 'N/D'
      : 'N/D';
    const causeName = cause_id
      ? (await pool.query('SELECT name FROM categories WHERE id = $1', [cause_id])).rows[0]?.name ?? 'N/D'
      : 'N/D';

    let historicalCases = await fetchHistoricalCases(machine_id, problem_id ?? null, machine.line, 'machine');
    let searchScope: 'machine' | 'line' = 'machine';

    if (!historicalCases.length && problem_id && machine.line) {
      historicalCases = await fetchHistoricalCases(machine_id, problem_id, machine.line, 'line');
      searchScope = 'line';
    }

    if (!historicalCases.length) {
      return res.json({
        success: false,
        insufficient: true,
        error: 'Nessun storico trovato per questa macchina',
        message: problem_id
          ? `Non ho abbastanza dati storici per la macchina ${machine.code} e il problema "${problemName}".`
          : `Non ho abbastanza dati storici per la macchina ${machine.code}.`,
        details: { machine_id, problem_id, searchScope }
      });
    }

    const sparePartsHistory = await fetchSparePartsHistory(machine_id, machine.line, searchScope);

    const context = buildHistoricalAnalysisContext({
      machineName: `${machine.code} - ${machine.name}`,
      machineLine: machine.line ?? 'N/D',
      problem: problemName,
      cause: causeName,
      cases: historicalCases,
      sparePartsHistory
    });

    logger.info({ aiAnalyze: { contextPreview: context.slice(0, 500), casesFound: historicalCases.length, searchScope } });

    const analysis = await generateHistoricalAnalysis(context);

    if (!analysis) {
      const ollamaErr = getLastOllamaError();
      logger.error({ aiAnalyze: { ollamaError: ollamaErr } });
      return res.json({
        success: false,
        insufficient: true,
        error: getOllamaErrorMessage(),
        message: formatOllamaUnavailableMessage(),
        details: { ollama: ollamaErr, casesFound: historicalCases.length, searchScope }
      });
    }

    logger.info({ aiAnalyze: { responseLength: analysis.length } });

    const sameMachineProblem = historicalCases.filter(
      (c) => c.machine_code === machine.code && (!problem_id || c.problem_name === problemName)
    ).length;
    const sameProblemLine = searchScope === 'line' ? historicalCases.length : 0;

    res.json({
      success: true,
      insufficient: false,
      stats: {
        same_machine_problem: sameMachineProblem,
        same_problem_line: sameProblemLine,
        total_similar: historicalCases.length
      },
      analysis,
      details: { searchScope }
    });
  } catch (e) {
    logger.error({ aiAnalyze: { error: e instanceof Error ? e.message : String(e) } });

    if (e && typeof e === 'object' && 'code' in e) {
      return res.status(500).json({
        success: false,
        error: 'Errore nel caricamento dati dal database',
        details: { dbError: (e as { code?: string }).code }
      });
    }

    const errMsg = e instanceof Error ? e.message : 'Errore sconosciuto';
    if (errMsg.includes('parse') || errMsg.includes('JSON')) {
      return res.status(500).json({
        success: false,
        error: 'Errore nel parsing della risposta IA',
        details: { message: errMsg }
      });
    }

    next(e);
  }
});

aiRoutes.post('/analisi-ia', authMiddleware, async (req, res, next) => {
  try {
    const {
      problem_name,
      problem_description,
      solutions_tried,
      solutions_applied,
      spare_parts_used,
      tempo_impiego,
      notes
    } = req.body as {
      problem_name?: string;
      problem_description?: string;
      solutions_tried?: string[];
      solutions_applied?: string[];
      spare_parts_used?: string[];
      tempo_impiego?: number;
      notes?: string;
    };

    if (!problem_name) {
      return res.status(400).json({ error: 'Il nome del problema è obbligatorio' });
    }

    const { generateTechnicalAnalysis, formatOllamaUnavailableMessage } = await import('../services/aiService');
    const analysis = await generateTechnicalAnalysis({
      problem_name,
      problem_description,
      solutions_tried: solutions_tried || [],
      solutions_applied: solutions_applied || [],
      spare_parts_used: spare_parts_used || [],
      tempo_impiego: tempo_impiego || 0.5,
      notes
    });

    if (!analysis) {
      return res.status(503).json({ error: formatOllamaUnavailableMessage() });
    }

    res.json({ analysis });
  } catch (e) {
    next(e);
  }
});
