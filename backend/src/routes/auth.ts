import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

import { env } from '../config/env';
import { pool } from '../db';
import { LDAPService } from '../services/ldapService';
import { authMiddleware } from '../middleware/auth';

export const authRoutes = Router();

authRoutes.post('/auth/register', async (req, res, next) => {
  try {
    const { username, password, role } = req.body as { username: string; password: string; role?: string };
    if (!username || !password) return res.status(400).json({ error: 'username/password required' });

    const password_hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users(username,password_hash,role,ldap_managed) VALUES($1,$2,$3,false) ON CONFLICT(username) DO NOTHING',
      [username, password_hash, role ?? 'user']
    );

    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

authRoutes.post('/auth/login', async (req, res, next) => {
  try {
    const { username, password } = req.body as { username: string; password: string };
    if (!username || !password) return res.status(400).json({ error: 'username/password required' });

    if (env.LDAP_ENABLED) {
      const ldap = new LDAPService();
      try {
        await ldap.authenticate(username, password);
        // get or create user
        const r = await pool.query('SELECT id, role FROM users WHERE username=$1', [username]);
        let userId: string;
        let role: string;
        if (r.rows.length) {
          userId = r.rows[0].id;
          role = r.rows[0].role;
        } else {
          const inserted = await pool.query(
            'INSERT INTO users(username,password_hash,role,ldap_managed) VALUES($1,$2,$3,true) RETURNING id, role',
            [username, await bcrypt.hash('ldap-placeholder', 10), 'user']
          );
          userId = inserted.rows[0].id;
          role = inserted.rows[0].role;
        }
        const token = jwt.sign({ id: userId, role }, env.JWT_SECRET as any, { expiresIn: env.JWT_EXPIRY as any });
        return res.json({ token, role });
      } catch {
        // fallback to local
      }
    }

    const r = await pool.query('SELECT id, role, password_hash FROM users WHERE username=$1', [username]);
    if (!r.rows.length) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, r.rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: r.rows[0].id, role: r.rows[0].role }, env.JWT_SECRET as any, { expiresIn: env.JWT_EXPIRY as any });
    return res.json({ token, role: r.rows[0].role });
  } catch (e) {
    next(e);
  }
});

authRoutes.get('/auth/me', authMiddleware, (req, res) => {
  res.json({ user: (req as any).user });
});

