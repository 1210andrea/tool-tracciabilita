"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLastOllamaError = getLastOllamaError;
exports.listOllamaModels = listOllamaModels;
exports.verifyOllamaModel = verifyOllamaModel;
exports.pingOllama = pingOllama;
exports.generateAiSolution = generateAiSolution;
exports.generateCaseInsights = generateCaseInsights;
exports.formatOllamaUnavailableMessage = formatOllamaUnavailableMessage;
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
const AI_PROMPT_TEMPLATE = ({ machine, line, operator, problem, cause, description }) => `Genera una soluzione tecnica per un problema di manutenzione su una macchina industriale.

Macchina: ${machine}
Linea: ${line}
Operatore: ${operator}
Problema: ${problem}
Causa: ${cause}
Descrizione utente: ${description}

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
    return `Fallback AI solution: controlla i parametri e verifica la macchina. Operatore: ${data.operator}, Problema: ${data.problem}, Causa: ${data.cause}.`;
}
async function generateCaseInsights(data) {
    const historyText = data.similarCases
        .map((c, i) => {
        const date = new Date(c.created_at).toLocaleDateString('it-IT');
        return `${i + 1}. [${date}] Macchina ${c.machine_code} (${c.line ?? 'N/D'}) - Problema: ${c.problem_name ?? 'N/D'} - Causa: ${c.cause_name ?? 'N/D'}
   Titolo: ${c.title}
   Soluzione: ${c.solution?.trim() || 'non documentata'}`;
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
