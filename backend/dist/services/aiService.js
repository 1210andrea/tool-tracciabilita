"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pingOllama = pingOllama;
exports.generateAiSolution = generateAiSolution;
exports.generateCaseInsights = generateCaseInsights;
const env_1 = require("../config/env");
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
async function callOllama(messages) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), env_1.env.AI_TIMEOUT);
    try {
        const resp = await fetch(`${env_1.env.AI_API_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: env_1.env.AI_MODEL, messages, stream: false }),
            signal: controller.signal
        });
        if (!resp.ok)
            return null;
        const payload = await resp.json();
        return extractOllamaContent(payload);
    }
    catch {
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
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), env_1.env.AI_TIMEOUT);
    try {
        const resp = await fetch(`${env_1.env.AI_API_URL}/api/tags`, { signal: controller.signal });
        if (!resp.ok)
            throw new Error('AI ping failed');
        return true;
    }
    finally {
        clearTimeout(t);
    }
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
        return `${i + 1}. [${date}] Macchina ${c.machine_code} (${c.line ?? 'N/D'}) - Problema: ${c.problem_name ?? 'N/D'} - Causa: ${c.cause_name ?? 'N/D'} - Stato: ${c.status}
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
