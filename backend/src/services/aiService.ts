import { env } from '../config/env';
import { logger } from '../config/logger';

type ChatMessage = { role: string; content: string };

export type OllamaFailureReason = 'timeout' | 'http_error' | 'empty_response' | 'network_error' | 'model_missing';

let lastOllamaError: { reason: OllamaFailureReason; detail: string } | null = null;

export function getLastOllamaError() {
  return lastOllamaError;
}

function extractOllamaContent(payload: unknown): string | null {
  const p = payload as Record<string, unknown>;
  const message = p?.message as { content?: string } | undefined;
  if (message?.content) return message.content;
  const output = p?.output as Array<{ content?: string }> | undefined;
  if (output?.[0]?.content) return output[0].content;
  const choices = p?.choices as Array<{ message?: { content?: string } }> | undefined;
  if (choices?.[0]?.message?.content) return choices[0].message.content;
  return null;
}

function modelMatches(available: string, configured: string): boolean {
  if (available === configured) return true;
  const base = configured.split(':')[0];
  return available === base || available.startsWith(`${base}:`);
}

export async function listOllamaModels(): Promise<string[]> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), env.AI_TIMEOUT);
  try {
    const resp = await fetch(`${env.AI_API_URL}/api/tags`, { signal: controller.signal });
    if (!resp.ok) return [];
    const payload = (await resp.json()) as { models?: Array<{ name?: string }> };
    return (payload.models ?? []).map((m) => m.name).filter((n): n is string => Boolean(n));
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

export async function verifyOllamaModel(): Promise<{ ok: true } | { ok: false; reason: OllamaFailureReason; detail: string }> {
  const models = await listOllamaModels();
  if (!models.length) {
    return {
      ok: false,
      reason: 'network_error',
      detail: `Impossibile contattare Ollama su ${env.AI_API_URL} o nessun modello installato`
    };
  }
  const found = models.some((name) => modelMatches(name, env.AI_MODEL));
  if (!found) {
    return {
      ok: false,
      reason: 'model_missing',
      detail: `Modello "${env.AI_MODEL}" non trovato. Modelli disponibili: ${models.join(', ')}`
    };
  }
  return { ok: true };
}

async function callOllama(messages: ChatMessage[]): Promise<string | null> {
  lastOllamaError = null;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), env.AI_TIMEOUT);
  try {
    const resp = await fetch(`${env.AI_API_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: env.AI_MODEL, messages, stream: false }),
      signal: controller.signal
    });
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      lastOllamaError = {
        reason: 'http_error',
        detail: `HTTP ${resp.status}${errBody ? `: ${errBody.slice(0, 300)}` : ''}`
      };
      logger.error({ ollama: { status: resp.status, model: env.AI_MODEL, body: errBody.slice(0, 500) } });
      return null;
    }
    const payload = await resp.json();
    const content = extractOllamaContent(payload);
    if (!content) {
      lastOllamaError = { reason: 'empty_response', detail: 'Risposta Ollama senza contenuto testuale' };
      logger.error({ ollama: { model: env.AI_MODEL, payload } });
      return null;
    }
    return content;
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    lastOllamaError = {
      reason: isAbort ? 'timeout' : 'network_error',
      detail: isAbort
        ? `Timeout dopo ${env.AI_TIMEOUT}ms (aumenta AI_TIMEOUT per modelli grandi)`
        : err instanceof Error
          ? err.message
          : 'Errore di rete verso Ollama'
    };
    logger.error({ ollama: { model: env.AI_MODEL, error: lastOllamaError } });
    return null;
  } finally {
    clearTimeout(t);
  }
}

const AI_PROMPT_TEMPLATE = ({ machine, line, problem, cause, sparePart, description, notes }: { machine: string; line: string; problem: string; cause: string; sparePart: string; description: string; notes?: string }) =>
  `Genera una soluzione tecnica per un problema di manutenzione su una macchina industriale.

Macchina: ${machine}
Linea: ${line}
Problema: ${problem}
Causa: ${cause}
Pezzo di ricambio: ${sparePart}
Descrizione/Soluzione: ${description}
${notes ? `Note aggiuntive dell'operatore: ${notes}` : ''}

Fornisci una soluzione chiara e pratica, con passaggi operativi e consigli.`;

export async function pingOllama() {
  const check = await verifyOllamaModel();
  if (!check.ok) throw new Error(check.detail);
  return true;
}

export async function generateAiSolution(data: { machine: string; line: string; problem: string; cause: string; sparePart: string; description: string; notes?: string }) {
  const prompt = AI_PROMPT_TEMPLATE(data);

  if (env.AI_PROVIDER === 'ollama') {
    const output = await callOllama([
      { role: 'system', content: 'Sei un assistente tecnico di manutenzione industriale.' },
      { role: 'user', content: prompt }
    ]);
    if (output) return output;
  }

  return `Fallback AI solution: controlla i parametri e verifica la macchina. Problema: ${data.problem}, Causa: ${data.cause}, Ricambio: ${data.sparePart}.`;
}

export type SimilarCaseRow = {
  solution: string | null;
  status: string;
  created_at: string;
  machine_code: string;
  line: string | null;
  problem_name: string | null;
  cause_name: string | null;
  spare_part_name: string | null;
  notes?: string | null;
};

export async function generateCaseInsights(data: {
  machine: string;
  line: string;
  problem: string;
  cause: string;
  operator: string;
  counts: { same_machine_problem: number; same_problem_line: number; total_similar: number };
  similarCases: SimilarCaseRow[];
}): Promise<string | null> {
  const historyText = data.similarCases
    .map((c, i) => {
      const date = new Date(c.created_at).toLocaleDateString('it-IT');
      return `${i + 1}. [${date}] Macchina ${c.machine_code} (${c.line ?? 'N/D'}) - Problema: ${c.problem_name ?? 'N/D'} - Causa: ${c.cause_name ?? 'N/D'} - Ricambio: ${c.spare_part_name ?? 'N/D'}
   Soluzione: ${c.solution?.trim() || 'non documentata'}
   ${c.notes ? `Note operatore: ${c.notes}` : ''}`;
    })
    .join('\n\n');

  const prompt = `Analizza i dati storici di manutenzione e rispondi in italiano.

CASO ATTUALE:
- Macchina: ${data.machine}
- Linea: ${data.line}
- Operatore: ${data.operator}
- Problema: ${data.problem}
- Causa: ${data.cause}

STATISTICHE DAL DATABASE:
- Occorrenze stesso problema sulla stessa macchina: ${data.counts.same_machine_problem}
- Occorrenze stesso problema sulla stessa linea: ${data.counts.same_problem_line}
- Casi simili trovati: ${data.counts.total_similar}

CRONOLOGIA CASI SIMILI:
${historyText}

Compito:
1. Indica quante volte si è verificato un problema simile (usa i numeri sopra).
2. Riassumi come è stato risolto in passato, citando le soluzioni documentate.
3. Suggerisci un approccio pratico per il caso attuale basandoti sulla storia.
4. Se le soluzioni passate sono poche o incomplete, dillo chiaramente.

Rispondi in modo strutturato con titoli brevi.`;

  if (env.AI_PROVIDER !== 'ollama') return null;

  return callOllama([
    { role: 'system', content: 'Sei un analista di manutenzione industriale. Usi solo i dati forniti, senza inventare statistiche.' },
    { role: 'user', content: prompt }
  ]);
}

export function formatOllamaUnavailableMessage(): string {
  const err = getLastOllamaError();
  if (!err) {
    return 'Il servizio IA (Ollama) non è al momento disponibile. Verifica che Ollama sia avviato e che il modello sia scaricato.';
  }
  if (err.reason === 'model_missing') {
    return `Il modello IA "${env.AI_MODEL}" non è installato in Ollama. ${err.detail}`;
  }
  if (err.reason === 'timeout') {
    return `L'analisi IA ha superato il timeout (${env.AI_TIMEOUT}ms). ${err.detail}`;
  }
  return `Il servizio IA (Ollama) non è disponibile: ${err.detail}. Modello configurato: ${env.AI_MODEL}, URL: ${env.AI_API_URL}`;
}

export async function generateTechnicalAnalysis(data: {
  problem_name: string;
  problem_description?: string;
  solutions_tried: string[];
  solutions_applied: string[];
  spare_parts_used: string[];
  tempo_impiego: number;
  notes?: string;
}): Promise<string | null> {
  const prompt = `Analizza il seguente caso di manutenzione della macchina industriale:
PROBLEMA: ${data.problem_name}

${data.problem_description || ''}
SOLUZIONI PROVATE (NON hanno risolto):
${data.solutions_tried && data.solutions_tried.length ? data.solutions_tried.map(s => `- ${s}`).join('\n') : 'Nessuna'}

SOLUZIONE/I APPLICATA/E (HA/HANNO risolto):
${data.solutions_applied && data.solutions_applied.length ? data.solutions_applied.map(s => `- ${s}`).join('\n') : 'Nessuna'}

PEZZI DI RICAMBIO UTILIZZATI:
${data.spare_parts_used && data.spare_parts_used.length ? data.spare_parts_used.map(p => `- ${p}`).join('\n') : 'Nessuno'}

TEMPO IMPIEGO: ${data.tempo_impiego} ore
NOTE AGGIUNTIVE: ${data.notes || 'Nessuna'}
TASK:
- Analizza perché le soluzioni provate non hanno funzionato
- Spiega il motivo del successo della/e soluzione/i applicata/e
- Valuta se i pezzi di ricambio utilizzati erano appropriati
- Suggerisci miglioramenti per ridurre il tempo di risoluzione in futuro
- Identifica pattern o correlazioni con casi simili (basato su dati storici)

Rispondi in modo pratico e tecnico, adatto a un tecnico di manutenzione.`;

  if (env.AI_PROVIDER !== 'ollama') return null;

  return callOllama([
    { role: 'system', content: 'Sei un analista di manutenzione industriale. Rispondi in modo pratico e tecnico, adatto a un tecnico di manutenzione.' },
    { role: 'user', content: prompt }
  ]);
}

