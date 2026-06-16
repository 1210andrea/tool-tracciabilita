"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLastOllamaError = getLastOllamaError;
exports.listOllamaModels = listOllamaModels;
exports.verifyOllamaModel = verifyOllamaModel;
exports.pingOllama = pingOllama;
exports.generateAiSolution = generateAiSolution;
exports.buildHistoricalAnalysisContext = buildHistoricalAnalysisContext;
exports.generateHistoricalAnalysis = generateHistoricalAnalysis;
exports.getOllamaErrorMessage = getOllamaErrorMessage;
exports.generateCaseInsights = generateCaseInsights;
exports.formatOllamaUnavailableMessage = formatOllamaUnavailableMessage;
exports.generateTechnicalAnalysis = generateTechnicalAnalysis;
const env_1 = require("../config/env");
const logger_1 = require("../config/logger");
let lastOllamaError = null;
function getLastOllamaError() {
    return lastOllamaError;
}
function extractOllamaContent(payload) {
    const p = payload;
    const message = p?.message;
    if (message?.content)
        return message.content;
    const output = p?.output;
    if (output?.[0]?.content)
        return output[0].content;
    const choices = p?.choices;
    if (choices?.[0]?.message?.content)
        return choices[0].message.content;
    return null;
}
function modelMatches(available, configured) {
    if (available === configured)
        return true;
    const base = configured.split(':')[0];
    return available === base || available.startsWith(`${base}:`);
}
async function listOllamaModels() {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), env_1.env.AI_TIMEOUT);
    try {
        const resp = await fetch(`${env_1.env.AI_API_URL}/api/tags`, { signal: controller.signal });
        if (!resp.ok)
            return [];
        const payload = (await resp.json());
        return (payload.models ?? []).map((m) => m.name).filter((n) => Boolean(n));
    }
    catch {
        return [];
    }
    finally {
        clearTimeout(t);
    }
}
async function verifyOllamaModel() {
    const models = await listOllamaModels();
    if (!models.length) {
        return {
            ok: false,
            reason: 'network_error',
            detail: `Impossibile contattare Ollama su ${env_1.env.AI_API_URL} o nessun modello installato`
        };
    }
    const found = models.some((name) => modelMatches(name, env_1.env.AI_MODEL));
    if (!found) {
        return {
            ok: false,
            reason: 'model_missing',
            detail: `Modello "${env_1.env.AI_MODEL}" non trovato. Modelli disponibili: ${models.join(', ')}`
        };
    }
    return { ok: true };
}
async function callOllama(messages) {
    lastOllamaError = null;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), env_1.env.AI_TIMEOUT);
    try {
        const resp = await fetch(`${env_1.env.AI_API_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: env_1.env.AI_MODEL, messages, stream: false }),
            signal: controller.signal
        });
        if (!resp.ok) {
            const errBody = await resp.text().catch(() => '');
            lastOllamaError = {
                reason: 'http_error',
                detail: `HTTP ${resp.status}${errBody ? `: ${errBody.slice(0, 300)}` : ''}`
            };
            logger_1.logger.error({ ollama: { status: resp.status, model: env_1.env.AI_MODEL, body: errBody.slice(0, 500) } });
            return null;
        }
        const payload = await resp.json();
        const content = extractOllamaContent(payload);
        if (!content) {
            lastOllamaError = { reason: 'empty_response', detail: 'Risposta Ollama senza contenuto testuale' };
            logger_1.logger.error({ ollama: { model: env_1.env.AI_MODEL, payload } });
            return null;
        }
        return content;
    }
    catch (err) {
        const isAbort = err instanceof Error && err.name === 'AbortError';
        lastOllamaError = {
            reason: isAbort ? 'timeout' : 'network_error',
            detail: isAbort
                ? `Timeout dopo ${env_1.env.AI_TIMEOUT}ms (aumenta AI_TIMEOUT per modelli grandi)`
                : err instanceof Error
                    ? err.message
                    : 'Errore di rete verso Ollama'
        };
        logger_1.logger.error({ ollama: { model: env_1.env.AI_MODEL, error: lastOllamaError } });
        return null;
    }
    finally {
        clearTimeout(t);
    }
}
const AI_PROMPT_TEMPLATE = ({ machine, line, problem, cause, sparePart, description, notes }) => `Genera una soluzione tecnica per un problema di manutenzione su una macchina industriale.

Macchina: ${machine}
Linea: ${line}
Problema: ${problem}
Causa: ${cause}
Pezzo di ricambio: ${sparePart}
Descrizione/Soluzione: ${description}
${notes ? `Note aggiuntive dell'operatore: ${notes}` : ''}

Fornisci una soluzione chiara e pratica, con passaggi operativi e consigli.`;
async function pingOllama() {
    const check = await verifyOllamaModel();
    if (!check.ok)
        throw new Error(check.detail);
    return true;
}
async function generateAiSolution(data) {
    const prompt = AI_PROMPT_TEMPLATE(data);
    if (env_1.env.AI_PROVIDER === 'ollama') {
        const output = await callOllama([
            { role: 'system', content: 'Sei un assistente tecnico di manutenzione industriale.' },
            { role: 'user', content: prompt }
        ]);
        if (output)
            return output;
    }
    return `Fallback AI solution: controlla i parametri e verifica la macchina. Problema: ${data.problem}, Causa: ${data.cause}, Ricambio: ${data.sparePart}.`;
}
function buildHistoricalAnalysisContext(data) {
    const solutionsLines = data.cases.flatMap((c) => {
        const applied = c.solutions_applied?.split(', ').filter(Boolean) ?? [];
        const tried = c.solutions_tried?.split(', ').filter(Boolean) ?? [];
        const lines = [];
        for (const sol of applied) {
            const resolved = c.status === 'closed' ? 'sì' : 'no';
            lines.push(`- ${sol} (Operatore: ${c.operator_name ?? 'N/D'}) → RISOLTIVA? ${resolved}`);
        }
        for (const sol of tried) {
            lines.push(`- ${sol} (Operatore: ${c.operator_name ?? 'N/D'}) → RISOLTIVA? no (provata senza successo)`);
        }
        if (!lines.length && c.solution?.trim()) {
            const resolved = c.status === 'closed' ? 'sì' : 'no';
            lines.push(`- ${c.solution.trim()} (Operatore: ${c.operator_name ?? 'N/D'}) → RISOLTIVA? ${resolved}`);
        }
        return lines;
    });
    const uniqueSolutions = [...new Set(solutionsLines)];
    const sparePartsLines = data.sparePartsHistory.map((sp) => `- ${sp.name}${sp.description ? ` - Note: ${sp.description}` : ''} (usato ${sp.usage_count} volte)`);
    const technicalNotes = data.cases
        .map((c) => c.notes?.trim())
        .filter(Boolean)
        .join('\n');
    return `Database Context per Analisi IA:
Macchina: ${data.machineName} (Linea: ${data.machineLine})
Problema Riportato: ${data.problem}
${data.cause !== 'N/D' ? `Causa: ${data.cause}` : ''}

STORICO SOLUZIONI APPLICATE:
${uniqueSolutions.length ? uniqueSolutions.join('\n') : 'Nessuna soluzione documentata'}

PEZZI DI RICAMBIO USATI STORICAMENTE:
${sparePartsLines.length ? sparePartsLines.join('\n') : 'Nessun pezzo di ricambio documentato'}

NOTE TECNICHE ACCUMULATE:
${technicalNotes || 'Nessuna nota tecnica disponibile'}

ISTRUZIONI: Analizza il problema alla luce di questo storico. Proponi soluzioni basate su
quello che ha funzionato prima. Se una soluzione non ha funzionato, spiega perché potrebbe
non funzionare di nuovo.`;
}
async function generateHistoricalAnalysis(context) {
    if (env_1.env.AI_PROVIDER !== 'ollama')
        return null;
    logger_1.logger.info({ aiAnalysis: { contextLength: context.length } });
    return callOllama([
        {
            role: 'system',
            content: 'Sei un analista di manutenzione industriale. Usi solo i dati forniti nel contesto storico, senza inventare statistiche.'
        },
        {
            role: 'user',
            content: `${context}

Compito:
1. Indica quante volte si è verificato un problema simile e riassumi lo storico.
2. Riassumi come è stato risolto in passato, citando soluzioni e operatori.
3. Suggerisci un approccio pratico basato sulla storia.
4. Se i dati sono insufficienti, dillo chiaramente.

Rispondi in italiano con titoli brevi.`
        }
    ]);
}
function getOllamaErrorMessage() {
    const err = getLastOllamaError();
    if (!err)
        return 'Ollama non risponde, verifica il servizio';
    if (err.reason === 'timeout')
        return 'Ollama non risponde, verifica il servizio';
    if (err.reason === 'empty_response')
        return 'Errore nel parsing della risposta IA';
    return formatOllamaUnavailableMessage();
}
async function generateCaseInsights(data) {
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
    if (env_1.env.AI_PROVIDER !== 'ollama')
        return null;
    return callOllama([
        { role: 'system', content: 'Sei un analista di manutenzione industriale. Usi solo i dati forniti, senza inventare statistiche.' },
        { role: 'user', content: prompt }
    ]);
}
function formatOllamaUnavailableMessage() {
    const err = getLastOllamaError();
    if (!err) {
        return 'Il servizio IA (Ollama) non è al momento disponibile. Verifica che Ollama sia avviato e che il modello sia scaricato.';
    }
    if (err.reason === 'model_missing') {
        return `Il modello IA "${env_1.env.AI_MODEL}" non è installato in Ollama. ${err.detail}`;
    }
    if (err.reason === 'timeout') {
        return `L'analisi IA ha superato il timeout (${env_1.env.AI_TIMEOUT}ms). ${err.detail}`;
    }
    return `Il servizio IA (Ollama) non è disponibile: ${err.detail}. Modello configurato: ${env_1.env.AI_MODEL}, URL: ${env_1.env.AI_API_URL}`;
}
async function generateTechnicalAnalysis(data) {
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
    if (env_1.env.AI_PROVIDER !== 'ollama')
        return null;
    return callOllama([
        { role: 'system', content: 'Sei un analista di manutenzione industriale. Rispondi in modo pratico e tecnico, adatto a un tecnico di manutenzione.' },
        { role: 'user', content: prompt }
    ]);
}
