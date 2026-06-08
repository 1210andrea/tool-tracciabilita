import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../db';

export const usersRoutes = Router();

usersRoutes.get('/', authMiddleware, async (req, res, next) => {
  try {
    const r = await pool.query('SELECT id, username, email, role, ldap_managed, created_at FROM users ORDER BY created_at DESC');
    res.json({ items: r.rows });
  } catch (e) {
    next(e);
  }
});

usersRoutes.post('/', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    const { username, email, password, role } = req.body as { username: string; email?: string; password: string; role?: string };
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });

    const password_hash = await bcrypt.hash(password, 10);
    const r = await pool.query(
      'INSERT INTO users(username,email,password_hash,role,ldap_managed) VALUES($1,$2,$3,$4,false) RETURNING id, username, email, role, ldap_managed, created_at',
      [username, email ?? null, password_hash, role ?? 'user']
    );
    res.json({ item: r.rows[0] });
  } catch (e) {
    next(e);
  }
});

usersRoutes.put('/:id', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    const { id } = req.params;
    const { email, role, password } = req.body as { email?: string; role?: string; password?: string };
    let password_hash = null;

    if (password) {
      password_hash = await bcrypt.hash(password, 10);
    }

    const r = await pool.query(
      `UPDATE users SET email = COALESCE($1, email), role = COALESCE($2, role), password_hash = COALESCE($3, password_hash)
       WHERE id = $4 RETURNING id, username, email, role, ldap_managed, created_at`,
      [email ?? null, role ?? null, password_hash, id]
    );

    if (!r.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ item: r.rows[0] });
  } catch (e) {
    next(e);
  }
});

usersRoutes.delete('/:id', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    const { id } = req.params;
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
