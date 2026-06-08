import { env } from '../config/env';

const AI_PROMPT_TEMPLATE = ({ machine, operator, problem, cause, description }: { machine: string; operator: string; problem: string; cause: string; description: string }) =>
  `Genera una soluzione tecnica per un problema di manutenzione su una macchina industriale.

Macchina: ${machine}
Operatore: ${operator}
Problema: ${problem}
Causa: ${cause}
Descrizione utente: ${description}

Fornisci una soluzione chiara e pratica, con passaggi operativi e consigli.`;

export async function pingOllama() {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), env.AI_TIMEOUT);
  try {
    const resp = await fetch(`${env.AI_API_URL}/api/tags`, { signal: controller.signal });
    if (!resp.ok) throw new Error('AI ping failed');
    return true;
  } finally {
    clearTimeout(t);
  }
}

export async function generateAiSolution(data: { machine: string; operator: string; problem: string; cause: string; description: string }) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), env.AI_TIMEOUT);
  const prompt = AI_PROMPT_TEMPLATE(data);

  try {
    if (env.AI_PROVIDER === 'ollama') {
      const resp = await fetch(`${env.AI_API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: env.AI_MODEL,
          messages: [
            { role: 'system', content: 'Sei un assistente tecnico di manutenzione industriale.' },
            { role: 'user', content: prompt }
          ]
        }),
        signal: controller.signal
      });

      if (!resp.ok) throw new Error('AI generation failed');
      const payload = (await resp.json()) as any;
      const output = payload?.output?.[0]?.content || payload?.choices?.[0]?.message?.content;
      if (output) return output;
    }
  } catch {
    // fallback to local generation if Ollama fails
  } finally {
    clearTimeout(t);
  }

  return `Fallback AI solution: controlla i parametri e verifica la macchina. Operatore: ${data.operator}, Problema: ${data.problem}, Causa: ${data.cause}.`; 
}

