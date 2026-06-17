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

async function fetchCasesByMachineAndProblem(machineId: string, problemId: string): Promise<HistoricalCaseRow[]> {
  const r = await pool.query(
    `${HISTORICAL_CASES_SQL}
     WHERE c.machine_id = $1 AND c.problem_id = $2
     ORDER BY c.created_at DESC
     LIMIT 15`,
    [machineId, problemId]
  );
  return r.rows as HistoricalCaseRow[];
}

async function fetchCasesByProblem(problemId: string): Promise<HistoricalCaseRow[]> {
  const r = await pool.query(
    `${HISTORICAL_CASES_SQL}
     WHERE c.problem_id = $1
     ORDER BY c.created_at DESC
     LIMIT 15`,
    [problemId]
  );
  return r.rows as HistoricalCaseRow[];
}

// 🔥 MODIFICA: Nuova funzione per ricerca per linea + problema
async function fetchCasesByLineAndProblem(line: string, problemId: string): Promise<HistoricalCaseRow[]> {
  const r = await pool.query(
    `${HISTORICAL_CASES_SQL}
     WHERE m.line = $1 AND c.problem_id = $2
     ORDER BY c.created_at DESC
     LIMIT 15`,
    [line, problemId]
  );
  return r.rows as HistoricalCaseRow[];
}

function uniqueFromCases(cases: HistoricalCaseRow[], field: 'solutions_tried' | 'solutions_applied' | 'spare_parts'): string[] {
  const values = cases.flatMap((c) => (c[field] ?? '').split(', ').filter((v) => v && v !== 'N.D.'));
  return [...new Set(values)];
}

function buildSyntheticAnalysisPrompt(data: {
  machine: string;
  line: string;
  problem: string;
  cause: string;
  searchLevel: 'machine_problem' | 'line_problem' | 'none'; // 🔥 MODIFICA: aggiunto 'line_problem' e 'none'
  cases: HistoricalCaseRow[];
}): string {
  const tried = uniqueFromCases(data.cases, 'solutions_tried');
  const applied = uniqueFromCases(data.cases, 'solutions_applied');
  const spareParts = uniqueFromCases(data.cases, 'spare_parts');
  const notes = data.cases
    .map((c) => c.notes?.trim())
    .filter(Boolean)
    .slice(0, 5);

  // 🔥 MODIFICA: testo descrittivo del livello di ricerca
  const searchLabel = data.searchLevel === 'machine_problem' 
    ? 'stessa macchina + stesso problema' 
    : data.searchLevel === 'line_problem'
    ? 'stessa linea + stesso problema'
    : 'nessun caso simile trovato';

  const historyText = data.cases
    .map((c, i) => {
      const date = new Date(c.created_at).toLocaleDateString('it-IT');
      return `${i + 1}. [${date}] Macchina ${c.machine_code} (${c.line ?? 'N/D'})
   Problema: ${c.problem_name ?? 'N/D'} | Causa: ${c.cause_name ?? 'N/D'}
   Soluzioni provate: ${c.solutions_tried ?? 'N/D'}
   Soluzioni applicate: ${c.solutions_applied ?? 'N.D.'}
   Ricambi: ${c.spare_parts ?? 'N.D.'}
   Nota: ${c.notes?.trim() || 'N/D'}`;
    })
    .join('\n\n');

  return `Analizza i casi storici di manutenzione e rispondi SOLO nel formato indicato, in italiano, massimo 150-200 parole totali.

CASO ATTUALE:
- Macchina: ${data.machine}
- Linea: ${data.line}
- Problema: ${data.problem}
- Causa: ${data.cause}
- Livello ricerca: ${searchLabel}

DATI AGGREGATI (${data.cases.length} casi):
- Soluzioni provate: ${tried.join(', ') || 'nessuna documentata'}
- Soluzioni applicate: ${applied.join(', ') || 'nessuna documentata'}
- Pezzi di ricambio: ${spareParts.join(', ') || 'nessuno documentato'}
- Note: ${notes.join(' | ') || 'nessuna'}

CRONOLOGIA:
${historyText}

FORMATO OBBLIGATORIO (usa esattamente queste righe):
Hai provato: [elenco soluzioni provate] ma non hanno risolto.
Ti consiglio di fare: [elenco soluzioni applicate] che hanno risolto il problema in passato.
Potresti dover sostituire: [elenco pezzi di ricambio] usati nei vari ticket.
Nota: [breve osservazione basata sui casi storici].

Regole: usa SOLO i dati forniti, non inventare nomi o statistiche.`;
}

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

// ============================================================
// buildAIPrompt - ULTRA-SINTETICA per risposte pratiche (max 100 parole)
// ============================================================
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

  // Conta le occorrenze delle soluzioni (raggruppa e conta duplicati)
  const countOccurrences = (arr: string[]): { name: string; count: number; operator?: string }[] => {
    const map = new Map<string, { count: number; operator?: string }>();
    arr.forEach(item => {
      const match = item.match(/^(.*?)\s*\(operatore:\s*([^)]+)\)$/);
      const key = match ? match[1].trim() : item.trim();
      const operator = match ? match[2].trim() : undefined;
      if (map.has(key)) {
        const existing = map.get(key)!;
        existing.count++;
        if (operator && !existing.operator) {
          existing.operator = operator;
        }
      } else {
        map.set(key, { count: 1, operator });
      }
    });
    return Array.from(map.entries()).map(([name, data]) => ({ name, count: data.count, operator: data.operator }));
  };

  // Formatta i dati storici in modo ultra-compatto per l'IA
  let historicalText = '';

  const machine = historicalData.machine;
  const machineSuccessCounts = countOccurrences(machine.solutionsSuccess);
  const machineFailedCounts = countOccurrences(machine.solutionsFailed);
  const sparePartsCounts = countOccurrences(machine.spareParts);

  const hasMachineData = machineSuccessCounts.length > 0 || machineFailedCounts.length > 0 || sparePartsCounts.length > 0 || machine.notes.length > 0;

  if (hasMachineData) {
    historicalText += `\nSU QUESTA MACCHINA (${machineName}):\n`;
    if (machineSuccessCounts.length > 0) {
      historicalText += `✅ FUNZIONATE: ${machineSuccessCounts.map(s => `${s.name} (${s.count}x)${s.operator ? ` - ${s.operator}` : ''}`).join(', ')}\n`;
    }
    if (machineFailedCounts.length > 0) {
      historicalText += `❌ FALLITE: ${machineFailedCounts.map(s => `${s.name} (${s.count}x)`).join(', ')}\n`;
    }
    if (sparePartsCounts.length > 0) {
      historicalText += `🔧 PEZZI USATI: ${sparePartsCounts.map(p => `${p.name} (${p.count}x)`).join(', ')}\n`;
    }
    if (machine.notes.length > 0) {
      historicalText += `📝 NOTE: ${machine.notes.join('; ')}\n`;
    }
  }

  // Dati sulla linea (se disponibili e se non ci sono dati sulla macchina)
  if (!hasMachineData && historicalData.line) {
    const line = historicalData.line;
    const lineSuccessCounts = countOccurrences(line.solutionsSuccess);
    const lineFailedCounts = countOccurrences(line.solutionsFailed);
    const lineSparePartsCounts = countOccurrences(line.spareParts);

    const hasLineData = lineSuccessCounts.length > 0 || lineFailedCounts.length > 0 || lineSparePartsCounts.length > 0 || line.notes.length > 0;

    if (hasLineData) {
      historicalText += `\nSULLA LINEA (${lineName}):\n`;
      if (lineSuccessCounts.length > 0) {
        historicalText += `✅ FUNZIONATE: ${lineSuccessCounts.map(s => `${s.name} (${s.count}x)${s.operator ? ` - ${s.operator}` : ''}`).join(', ')}\n`;
      }
      if (lineFailedCounts.length > 0) {
        historicalText += `❌ FALLITE: ${lineFailedCounts.map(s => `${s.name} (${s.count}x)`).join(', ')}\n`;
      }
      if (lineSparePartsCounts.length > 0) {
        historicalText += `🔧 PEZZI USATI: ${lineSparePartsCounts.map(p => `${p.name} (${p.count}x)`).join(', ')}\n`;
      }
      if (line.notes.length > 0) {
        historicalText += `📝 NOTE: ${line.notes.join('; ')}\n`;
      }
    }
  }

  // Se non ci sono dati
  if (!historicalText) {
    historicalText = `\nNESSUN DATO STORICO per ${machineName} o linea ${lineName}.\n`;
  }

  return `
Sei un assistente per la manutenzione industriale. Dai un consiglio pratico.

**Problema:** ${problemName || 'Non specificato'}
**Macchina:** ${machineName}

--- DATI STORICI ---
${historicalText}

--- ISTRUZIONI ---
Rispondi SOLO in questo formato, senza introduzioni o conclusioni:

**Consiglio pratico:**
- Prima scelta: [soluzione che ha funzionato più volte]
  - Azione: [cosa fare]
  - Attenzione: [note se presenti]
- Seconda scelta: [alternativa se disponibile]
- Da evitare: [soluzioni fallite se presenti]

**Pezzi di ricambio usati:** [elenco se presenti]

**Regole:**
- Massimo 100 parole.
- Usa solo i dati forniti.
- Se non ci sono dati: "Nessun dato storico disponibile."
`;
};

// ============================================================
// ROTTE
// ============================================================

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
    
    // 🔥 Troncamento a 100 parole (non 200)
    const words = finalResponse.trim().split(/\s+/);
    if (words.length > 100) {
      finalResponse = words.slice(0, 100).join(' ') + '...';
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
  try {
    const { machine_id, problem_id, cause_id } = req.body as {
      machine_id?: string;
      problem_id?: string;
      cause_id?: string;
    };

    if (!machine_id) {
      return res.status(400).json({ success: false, error: 'machine_id è obbligatorio' });
    }
    if (!problem_id) {
      return res.status(400).json({ success: false, error: 'problem_id è obbligatorio' });
    }

    const machineR = await pool.query('SELECT code, name, line FROM machines WHERE id = $1', [machine_id]);
    const machine = machineR.rows[0];
    if (!machine) {
      return res.status(400).json({ success: false, error: 'Macchina non trovata' });
    }

    const problemName = (await pool.query('SELECT name FROM categories WHERE id = $1', [problem_id])).rows[0]?.name ?? 'N/D';
    const causeName = cause_id
      ? (await pool.query('SELECT name FROM categories WHERE id = $1', [cause_id])).rows[0]?.name ?? 'N/D'
      : 'N/D';

    // 🔥 MODIFICA: logica di ricerca a 3 livelli
    let searchLevel: 'machine_problem' | 'line_problem' | 'none' = 'machine_problem';
    let similarCases = await fetchCasesByMachineAndProblem(machine_id, problem_id);

    if (!similarCases.length && machine.line) {
      searchLevel = 'line_problem';
      similarCases = await fetchCasesByLineAndProblem(machine.line, problem_id);
    }

    if (!similarCases.length) {
      searchLevel = 'none';
    }

    // 🔥 MODIFICA: se non ci sono casi, restituisci messaggio di fallback
    if (!similarCases.length) {
      return res.json({
        success: false,
        insufficient: true,
        message: 'Nessun caso storico trovato per questo problema sulla macchina o sulla linea. Ti consiglio di documentare accuratamente la soluzione che adotterai.'
      });
    }

    const prompt = buildSyntheticAnalysisPrompt({
      machine: `${machine.code} - ${machine.name}`,
      line: machine.line ?? 'N/D',
      problem: problemName,
      cause: causeName,
      searchLevel,
      cases: similarCases
    });

    const analysis = await callOllama(
      [
        {
          role: 'system',
          content: 'Sei un assistente di manutenzione industriale. Rispondi sempre nel formato richiesto, in italiano, massimo 200 parole, usando solo i dati forniti.'
        },
        { role: 'user', content: prompt }
      ],
      120_000
    );

    if (!analysis) {
      const ollamaErr = getLastOllamaError();
      const isTimeout = ollamaErr?.reason === 'timeout';
      return res.status(isTimeout ? 408 : 503).json({
        success: false,
        insufficient: true,
        error: isTimeout
          ? "L'analisi sta richiedendo più tempo, riprova più tardi"
          : getOllamaErrorMessage(),
        message: formatOllamaUnavailableMessage(),
        details: { ollama: ollamaErr }
      });
    }

    // 🔥 MODIFICA: statistiche aggiornate per includere linea
    res.json({
      success: true,
      insufficient: false,
      stats: {
        machine: {
          count: searchLevel === 'machine_problem' ? similarCases.length : 0,
          label: 'Stessa macchina + problema'
        },
        line: {
          count: searchLevel === 'line_problem' ? similarCases.length : 0,
          label: 'Stessa linea + problema'
        },
        total: {
          count: similarCases.length,
          label: 'Casi simili totali'
        },
        same_machine_problem: searchLevel === 'machine_problem' ? similarCases.length : 0,
        same_problem_line: searchLevel === 'line_problem' ? similarCases.length : 0,
        total_similar: similarCases.length
      },
      analysis,
      solution: analysis,
      details: { searchLevel }
    });
  } catch (e) {
    logger.error({ aiAnalyze: { error: e instanceof Error ? e.message : String(e) } });
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