import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../db';

export const usersRoutes = Router();

usersRoutes.get('/', authMiddleware, async (req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT u.id, u.username, u.email, u.role, u.ldap_managed, u.operator_category_id, u.created_at,
              c.name AS operator_name
       FROM users u
       LEFT JOIN categories c ON c.id = u.operator_category_id
       ORDER BY u.created_at DESC`
    );
    res.json({ items: r.rows });
  } catch (e) {
    next(e);
  }
});

usersRoutes.post('/', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    const { username, email, password, role, operator_category_id } = req.body as {
      username: string;
      email?: string;
      password: string;
      role?: string;
      operator_category_id?: string | null;
    };
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });

    const password_hash = await bcrypt.hash(password, 10);
    const r = await pool.query(
      `INSERT INTO users(username,email,password_hash,role,ldap_managed,operator_category_id)
       VALUES($1,$2,$3,$4,false,$5)
       RETURNING id, username, email, role, ldap_managed, operator_category_id, created_at`,
      [username, email ?? null, password_hash, role ?? 'user', operator_category_id ?? null]
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
    const { email, role, password, operator_category_id } = req.body as {
      email?: string;
      role?: string;
      password?: string;
      operator_category_id?: string | null;
    };
    let password_hash = null;

    if (password) {
      password_hash = await bcrypt.hash(password, 10);
    }

    const r = await pool.query(
      `UPDATE users SET email = COALESCE($1, email), role = COALESCE($2, role),
              password_hash = COALESCE($3, password_hash),
              operator_category_id = COALESCE($4, operator_category_id)
       WHERE id = $5 RETURNING id, username, email, role, ldap_managed, operator_category_id, created_at`,
      [email ?? null, role ?? null, password_hash, operator_category_id ?? null, id]
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
    if (id === req.user!.id) {
      return res.status(400).json({ error: 'Non puoi eliminare il tuo account mentre sei connesso' });
    }
    const usedR = await pool.query(
      `SELECT COUNT(*)::int AS count FROM cases
       WHERE created_by = $1 OR assigned_to = $1`,
      [id]
    );
    if ((usedR.rows[0]?.count ?? 0) > 0) {
      return res.status(400).json({ error: `Non eliminabile: utente collegato a ${usedR.rows[0].count} casi` });
    }
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
