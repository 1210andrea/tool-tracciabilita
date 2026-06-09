import type { NextFunction, Request, Response } from 'express';
import { logger } from '../config/logger';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const anyErr = err as any;
  logger.error({
    err,
    message: anyErr?.message,
    stack: anyErr?.stack,
    name: anyErr?.name
  });

  res.status(500).json({ error: 'Internal server error' });
}

