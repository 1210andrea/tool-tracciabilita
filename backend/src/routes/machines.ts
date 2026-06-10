import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../db';
import { emitEvent } from '../services/socketService';

export const machinesRoutes = Router();

machinesRoutes.get('/', authMiddleware, async (_req, res, next) => {
  try {
    const r = await pool.query(
      'SELECT id, code, name, line, location, tipologia, type, posizione, created_at FROM machines ORDER BY created_at DESC'
    );
    res.json({ items: r.rows });
  } catch (e) {
    next(e);
  }
});

machinesRoutes.get('/tipologie', authMiddleware, async (_req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT DISTINCT tipologia
       FROM machines
       WHERE tipologia IS NOT NULL AND tipologia <> ''
       ORDER BY tipologia`
    );
    const tipologie = r.rows.map((row) => row.tipologia);
    res.json({ items: tipologie });
  } catch (e) {
    next(e);
  }
});


machinesRoutes.post('/', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    const { code, name, line, location, tipologia, type, posizione } = req.body as {
      code: string;
      name: string;
      line?: string;
      location?: string;
      tipologia?: string;
      type?: string;
      posizione?: string;
    };

    if (!code || !name) return res.status(400).json({ error: 'code and name are required' });

    const resolvedTipologia = (tipologia ?? type ?? posizione ?? null) as string | null;

    const r = await pool.query(
      'INSERT INTO machines(code,name,line,location,tipologia) VALUES($1,$2,$3,$4,$5) RETURNING id, code, name, line, location, tipologia, created_at',
      [code, name, line ?? null, location ?? null, resolvedTipologia]
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
    const { name, line, location, tipologia } = req.body as { name?: string; line?: string; location?: string; tipologia?: string };
    const r = await pool.query(
      `UPDATE machines SET name = COALESCE($1, name), line = COALESCE($2, line), location = COALESCE($3, location), tipologia = COALESCE($4, tipologia)
       WHERE id = $5 RETURNING id, code, name, line, location, tipologia, created_at`,
      [name ?? null, line ?? null, location ?? null, tipologia ?? null, id]
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

