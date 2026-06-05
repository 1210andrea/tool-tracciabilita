import { Router } from 'express';

export const healthRoutes = Router();

healthRoutes.get('/health', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

