import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Server as SocketIOServer } from 'socket.io';
import { createClient } from 'redis';

import { env } from './config/env';
import { logger } from './config/logger';
import { registerRoutes } from './routes';
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth';
import { setSocketServer } from './services/socketService';

const app = express();
// Behind a reverse proxy (nginx) - trust first proxy so express-rate-limit
// can correctly use X-Forwarded-For headers.
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '1mb' }));

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true
  })
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.use((req, _res, next) => {
  logger.info({ req: { method: req.method, path: req.path, ip: req.ip } });
  next();
});

// Health & metrics
app.get('/health', async (_req, res) => {
  const health = { status: 'OK', timestamp: new Date().toISOString(), database: 'checking...', redis: 'checking...', ai: 'checking...' };
  try {
    const { pool } = await import('./db');
    await pool.query('SELECT 1');
    health.database = 'OK';
  } catch {
    health.database = 'FAILED';
  }

  try {
    const redis = createClient({ url: env.REDIS_URL });
    await redis.connect();
    await redis.ping();
    await redis.disconnect();
    health.redis = 'OK';
  } catch {
    health.redis = 'FAILED';
  }

  try {
    const { pingOllama } = await import('./services/aiService');
    await pingOllama();
    health.ai = 'OK';
  } catch {
    health.ai = 'FAILED';
  }

  const statusCode = health.database === 'OK' ? 200 : 503;
  res.status(statusCode).json(health);
});

app.get('/metrics', async (_req, res) => {
  const { register } = await import('prom-client');
  res.setHeader('Content-Type', register.contentType);
  res.end(await register.metrics());
});

registerRoutes(app);

// Example protected ping
app.get('/api/me', authMiddleware, (_req, res) => {
  res.json({ ok: true });
});

app.use(errorHandler);

const server = http.createServer(app);

const io = new SocketIOServer(server, {
  path: '/socket.io',
  cors: { origin: env.CORS_ORIGIN, credentials: true }
});

io.on('connection', (socket) => {
  logger.info({ socket: { connected: true, id: socket.id } });
  socket.on('join-room', ({ room }) => {
    if (room) socket.join(room);
  });
});

setSocketServer(io);
app.set('io', io);

server.listen(env.PORT, () => {
  logger.info({ server: `listening:${env.PORT}` });
});

