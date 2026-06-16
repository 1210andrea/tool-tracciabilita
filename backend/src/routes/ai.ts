import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool as db, pool } from '../db';
import { logger } from '../config/logger';
import {
  callOllama,
  buildHistoricalAnalysisContext,
  formatOllamaUnavailableMessage,
  generateHistoricalAnalysis,
  getLastOllamaError,
  getOllamaErrorMessage,
  type HistoricalCaseRow,
  type SparePartHistoryRow
} from '../services/aiService';
import { getHistoricalDataForMachine } from '../services/caseService';

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

const buildAIPrompt = (data: {
  machineName: string;
  lineName: string;
  problemName: string;
  causeName: string;
  description: string;
  symptoms: string;
  historicalData: {
    machine: {
      solutionsSuccess: string[];
      solutionsFailed: string[];
      spareParts: string[];
      notes: string[];
    };
    line: {
      solutionsSuccess: string[];
      solutionsFailed: string[];
      spareParts: string[];
      notes: string[];
    } | null;
  };
}) => {
  const { machineName, lineName, problemName, causeName, description, symptoms, historicalData } = data;

  let machineSection = '';
  if (historicalData.machine.solutionsSuccess.length > 0) {
    machineSection += `\n**Soluzioni che hanno FUNZIONATO su questa macchina:**\n- ${historicalData.machine.solutionsSuccess.join('\n- ')}`;
  }
  if (historicalData.machine.solutionsFailed.length > 0) {
    machineSection += `\n\n**Soluzioni che NON hanno funzionato su questa macchina:**\n- ${historicalData.machine.solutionsFailed.join('\n- ')}`;
  }
  if (historicalData.machine.spareParts.length > 0) {
    machineSection += `\n\n**Pezzi di ricambio cambiati su questa macchina:**\n- ${historicalData.machine.spareParts.join('\n- ')}`;
  }
  if (historicalData.machine.notes.length > 0) {
    machineSection += `\n\n**Note degli operatori su questa macchina:**\n- ${historicalData.machine.notes.join('\n- ')}`;
  }

  let lineSection = '';
  if (historicalData.line) {
    lineSection = `\n\n--- DATI DELLA LINEA (${lineName}) ---`;
    if (historicalData.line.solutionsSuccess.length > 0) {
      lineSection += `\n**Soluzioni che hanno FUNZIONATO sulla linea:**\n- ${historicalData.line.solutionsSuccess.join('\n- ')}`;
    }
    if (historicalData.line.solutionsFailed.length > 0) {
      lineSection += `\n\n**Soluzioni che NON hanno funzionato sulla linea:**\n- ${historicalData.line.solutionsFailed.join('\n- ')}`;
    }
    if (historicalData.line.spareParts.length > 0) {
      lineSection += `\n\n**Pezzi di ricambio cambiati sulla linea:**\n- ${historicalData.line.spareParts.join('\n- ')}`;
    }
    if (historicalData.line.notes.length > 0) {
      lineSection += `\n\n**Note degli operatori sulla linea:**\n- ${historicalData.line.notes.join('\n- ')}`;
    }
  }

  return `
Sei un assistente esperto per la manutenzione industriale.
Analizza il seguente problema e fornisci una risposta strutturata e pratica.

**Macchina:** ${machineName}
**Linea:** ${lineName}
**Problema:** ${problemName || 'Non specificato'}
**Causa:** ${causeName || 'Non specificata'}
**Descrizione:** ${description || 'Non fornita'}
**Sintomi:** ${symptoms || 'Non forniti'}

--- DATI STORICI ---
${machineSection || 'Nessun dato storico disponibile per questa macchina.'}
${lineSection || 'Nessun dato storico disponibile per questa linea.'}

**Istruzioni per la risposta:**
1. Analizza i dati storici della macchina e della linea (se disponibili).
2. Suggerisci una soluzione basata su quelle che hanno funzionato in passato.
3. Se ci sono soluzioni che hanno fallito, menzionale come "da evitare".
4. Se sono stati cambiati pezzi di ricambio, segnalalo.
5. Se ci sono note degli operatori, tienile in considerazione.
6. Confronta i dati della macchina con quelli della linea (se disponibili).
7. La risposta deve essere **con**cisa (massimo 200 parole) e strutturata in:
   - **Analisi:** (cosa emerge dai dati storici)
   - **Soluzione suggerita:** (basata sui dati)
   - **Pezzi di ricambio consigliati:** (se applicabile)
   - **Note:** (eventuali avvertenze)

**Risposta:**
`;
};

aiRoutes.post('/suggest-solution', authMiddleware, async (req, res, next) => {
  try {
    const machineId = req.body.machineId || req.body.machine_id;
    const problemId = req.body.problemId || req.body.problem_id;
    const causeId = req.body.causeId || req.body.cause_id;
    const description = req.body.description;
    const symptoms = req.body.symptoms || req.body.notes;

    // Verifica che machineId sia presente (obbligatorio)
    if (!machineId) {
      return res.status(400).json({ 
        solution: '⚠️ Seleziona una macchina per l\'analisi IA.',
        suggestion: '⚠️ Seleziona una macchina per l\'analisi IA.'
      });
    }

    // Recupera dati storici (problemId può essere undefined)
    const historicalData = await getHistoricalDataForMachine(machineId, problemId);

    // Recupera machine, problem e cause names
    const machine = await db.query('SELECT name, line FROM machines WHERE id = $1', [machineId]);
    const problem = problemId ? await db.query('SELECT name FROM categories WHERE id = $1', [problemId]) : null;
    const cause = causeId ? await db.query('SELECT name FROM categories WHERE id = $1', [causeId]) : null;

    // Costruisci il prompt
    const prompt = buildAIPrompt({
      machineName: machine.rows[0]?.name || 'Sconosciuta',
      lineName: machine.rows[0]?.line || 'Sconosciuta',
      problemName: problem?.rows[0]?.name || '',
      causeName: cause?.rows[0]?.name || '',
      description: description || '',
      symptoms: symptoms || '',
      historicalData,
    });

    // Chiamata a Ollama (con timeout 15s)
    const response = await callOllama(prompt, 15_000);

    let finalResponse = response || '⚠️ Analisi IA non disponibile al momento.';
    const words = finalResponse.trim().split(/\s+/);
    if (words.length > 200) {
      finalResponse = words.slice(0, 200).join(' ') + '...';
    }

    res.json({
      solution: finalResponse,
      suggestion: finalResponse,
      insufficient: false
    });
  } catch (error) {
    console.error('AI suggest error:', error);
    res.status(500).json({ 
      solution: '⚠️ Analisi IA non disponibile al momento. Riprova più tardi.',
      suggestion: '⚠️ Analisi IA non disponibile al momento. Riprova più tardi.'
    });
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
    let searchScope: 'machine' | 'line' | 'all' = 'machine';

    if (!historicalCases.length && machine.line) {
      historicalCases = await fetchHistoricalCases(machine_id, problem_id ?? null, machine.line, 'line');
      searchScope = 'line';
    }

    if (!historicalCases.length) {
      const r = await pool.query(
        `${HISTORICAL_CASES_SQL}
         ORDER BY c.created_at DESC
         LIMIT 20`
      );
      historicalCases = r.rows as HistoricalCaseRow[];
      searchScope = 'all';
    }

    if (!historicalCases.length) {
      return res.json({
        success: false,
        insufficient: true,
        error: 'Nessun storico trovato',
        message: 'Non ho abbastanza dati storici nel database.',
        details: { machine_id, problem_id, searchScope }
      });
    }

    const sparePartsHistory = await fetchSparePartsHistory(
      machine_id,
      machine.line,
      searchScope === 'all' ? 'line' : searchScope
    );

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

    let machineCount = 0;
    let lineCount = 0;

    if (problem_id) {
      const mc = await pool.query(
        'SELECT COUNT(*)::int FROM cases WHERE machine_id = $1 AND problem_id = $2',
        [machine_id, problem_id]
      );
      machineCount = mc.rows[0]?.count ?? 0;

      if (machine.line) {
        const lc = await pool.query(
          `SELECT COUNT(*)::int FROM cases c
           JOIN machines m ON c.machine_id = m.id
           WHERE m.line = $1 AND c.machine_id != $2 AND c.problem_id = $3`,
          [machine.line, machine_id, problem_id]
        );
        lineCount = lc.rows[0]?.count ?? 0;
      }
    } else {
      const mc = await pool.query(
        'SELECT COUNT(*)::int FROM cases WHERE machine_id = $1',
        [machine_id]
      );
      machineCount = mc.rows[0]?.count ?? 0;

      if (machine.line) {
        const lc = await pool.query(
          `SELECT COUNT(*)::int FROM cases c
           JOIN machines m ON c.machine_id = m.id
           WHERE m.line = $1 AND c.machine_id != $2`,
          [machine.line, machine_id]
        );
        lineCount = lc.rows[0]?.count ?? 0;
      }
    }

    const totalCount = machineCount + lineCount;

    const machineLabel = problem_id
      ? "Casi con stesso problema su questa macchina"
      : "Casi su questa macchina";
    const lineLabel = problem_id
      ? "Casi con stesso problema sulla linea"
      : "Casi sulla linea";
    const totalLabel = "Casi simili totali";

    res.json({
      success: true,
      insufficient: false,
      stats: {
        machine: {
          count: machineCount,
          label: machineLabel
        },
        line: {
          count: lineCount,
          label: lineLabel
        },
        total: {
          count: totalCount,
          label: totalLabel
        },
        same_machine_problem: machineCount,
        same_problem_line: lineCount,
        total_similar: totalCount
      },
      analysis,
      solution: analysis,
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
