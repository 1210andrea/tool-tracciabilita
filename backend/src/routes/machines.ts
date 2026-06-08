import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../db';
import { emitEvent } from '../services/socketService';

export const machinesRoutes = Router();

machinesRoutes.get('/', authMiddleware, async (_req, res, next) => {
  try {
    const r = await pool.query('SELECT id, code, name, line, location, created_at FROM machines ORDER BY created_at DESC');
    res.json({ items: r.rows });
  } catch (e) {
    next(e);
  }
});

machinesRoutes.post('/', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    const { code, name, line, location } = req.body as {
      code: string;
      name: string;
      line?: string;
      location?: string;
    };

    if (!code || !name) return res.status(400).json({ error: 'code and name are required' });

    const r = await pool.query(
      'INSERT INTO machines(code,name,line,location) VALUES($1,$2,$3,$4) RETURNING id, code, name, line, location, created_at',
      [code, name, line ?? null, location ?? null]
    );
    emitEvent('machine_updated', { machineId: r.rows[0].id, action: 'created' });
    res.json({ item: r.rows[0] });
  } catch (e) {
    next(e);
  }
});

machinesRoutes.put('/:id', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    const { id } = req.params;
    const { name, line, location } = req.body as { name?: string; line?: string; location?: string };
    const r = await pool.query(
      `UPDATE machines SET name = COALESCE($1, name), line = COALESCE($2, line), location = COALESCE($3, location)
       WHERE id = $4 RETURNING id, code, name, line, location, created_at`,
      [name ?? null, line ?? null, location ?? null, id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Machine not found' });
    emitEvent('machine_updated', { machineId: id, action: 'updated' });
    res.json({ item: r.rows[0] });
  } catch (e) {
    next(e);
  }
});

machinesRoutes.delete('/:id', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    const { id } = req.params;
    const usedR = await pool.query('SELECT COUNT(*)::int AS count FROM cases WHERE machine_id = $1', [id]);
    if ((usedR.rows[0]?.count ?? 0) > 0) {
      return res.status(400).json({ error: `Non eliminabile: macchina usata in ${usedR.rows[0].count} casi` });
    }
    await pool.query('DELETE FROM machines WHERE id = $1', [id]);
    emitEvent('machine_updated', { machineId: id, action: 'deleted' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

