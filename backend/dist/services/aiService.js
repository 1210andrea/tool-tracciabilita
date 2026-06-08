"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pingOllama = pingOllama;
exports.generateAiSolution = generateAiSolution;
const env_1 = require("../config/env");
const AI_PROMPT_TEMPLATE = ({ machine, operator, problem, cause, description }) => `Genera una soluzione tecnica per un problema di manutenzione su una macchina industriale.

Macchina: ${machine}
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
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), env_1.env.AI_TIMEOUT);
    const prompt = AI_PROMPT_TEMPLATE(data);
    try {
        if (env_1.env.AI_PROVIDER === 'ollama') {
            const resp = await fetch(`${env_1.env.AI_API_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: env_1.env.AI_MODEL,
                    messages: [
                        { role: 'system', content: 'Sei un assistente tecnico di manutenzione industriale.' },
                        { role: 'user', content: prompt }
                    ]
                }),
                signal: controller.signal
            });
            if (!resp.ok)
                throw new Error('AI generation failed');
            const payload = (await resp.json());
            const output = payload?.output?.[0]?.content || payload?.choices?.[0]?.message?.content;
            if (output)
                return output;
        }
    }
    catch {
        // fallback to local generation if Ollama fails
    }
    finally {
        clearTimeout(t);
    }
    return `Fallback AI solution: controlla i parametri e verifica la macchina. Operatore: ${data.operator}, Problema: ${data.problem}, Causa: ${data.cause}.`;
}
