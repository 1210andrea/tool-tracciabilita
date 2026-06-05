import { createClient } from 'redis';
import { env } from '../config/env';

const client = createClient({ url: env.REDIS_URL });
let ready: Promise<unknown> | null = null;

async function ensureReady() {
  if (!ready) ready = client.connect();
  return ready;
}

export async function ioEmit(_event: string, _payload: unknown): Promise<void> {
  // Minimal placeholder: in production you'd use socket.io rooms directly.
  // Kept for future expansion with Redis pub/sub.
  try {
    await ensureReady();
  } catch {
    // ignore
  }
}


