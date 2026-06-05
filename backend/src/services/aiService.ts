import { env } from '../config/env';

export async function pingOllama() {
  // Ollama usually has /api/tags
  // Node 18+ provides global fetch/AbortController; keep this function minimal.
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

