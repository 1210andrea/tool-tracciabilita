import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export type AuthUser = { id: string; role: string; username?: string };

export function authMiddleware(req: Request & { user?: AuthUser }, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });

  const token = header.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthUser;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Middleware riutilizzabile per il controllo del ruolo.
 * Ruoli validi: 'admin' | 'magazziniere' | 'user'
 *
 * Uso:
 *   router.get('/route', authMiddleware, requireRole('admin', 'magazziniere'), handler)
 */
export const requireRole = (...roles: string[]) =>
  (req: Request & { user?: AuthUser }, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user?.role ?? '')) {
      return res.status(403).json({ error: 'Accesso non autorizzato' });
    }
    next();
  };
