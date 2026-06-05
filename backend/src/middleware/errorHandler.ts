import type { NextFunction, Request, Response } from 'express';
import { logger } from '../config/logger';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  logger.error({ err });
  res.status(500).json({ error: 'Internal server error' });
}

