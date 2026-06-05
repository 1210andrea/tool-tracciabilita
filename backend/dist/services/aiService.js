"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pingOllama = pingOllama;
const env_1 = require("../config/env");
async function pingOllama() {
    // Ollama usually has /api/tags
    // Node 18+ provides global fetch/AbortController; keep this function minimal.
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
