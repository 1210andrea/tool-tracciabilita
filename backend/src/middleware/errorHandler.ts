import type { NextFunction, Request, Response } from 'express';
import { logger } from '../config/logger';

function isPgError(err: unknown): err is { code?: string; message?: string } {
  return typeof err === 'object' && err !== null && 'code' in err;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const anyErr = err as any;
  logger.error({
    err,
    message: anyErr?.message,
    stack: anyErr?.stack,
    name: anyErr?.name,
    code: anyErr?.code
  });

  if (isPgError(err)) {
    if (err.code === '42P01') {
      return res.status(503).json({
        error: 'Errore nel caricamento dati dal database. Schema incompleto: eseguire scripts/migrate-refinement.sql sul database.'
      });
    }
    if (err.code === '42703') {
      return res.status(503).json({
        error: 'Errore nel caricamento dati dal database. Colonne mancanti: eseguire scripts/migrate-refinement.sql sul database.'
      });
    }
  }

  res.status(500).json({ error: 'Internal server error' });
}
