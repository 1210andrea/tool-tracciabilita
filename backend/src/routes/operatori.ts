import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../db';
import { emitEvent } from '../services/socketService';

export const operatoriRoutes = Router();

operatoriRoutes.get('/', authMiddleware, async (req, res, next) => {
  try {
    const showAll = req.query.all === '1' && req.user?.role === 'admin';
    const r = await pool.query(
      `SELECT op.id, op.nome, op.attivo, op.created_at, op.updated_at,
        (SELECT COUNT(*) FROM cases WHERE operatore_id = op.id) AS usage_count
       FROM operatori op
       ${showAll ? '' : 'WHERE op.attivo = true'}
       ORDER BY op.nome ASC`
    );
    res.json({ items: r.rows });
  } catch (e) {
    next(e);
  }
});

operatoriRoutes.post('/', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    const { nome, attivo } = req.body as { nome?: string; attivo?: boolean };
    if (!nome?.trim()) return res.status(400).json({ error: 'nome è obbligatorio' });

    const existing = await pool.query('SELECT id FROM operatori WHERE LOWER(nome) = LOWER($1)', [nome.trim()]);
    if (existing.rows.length) {
      return res.status(400).json({ error: 'Un operatore con questo nome esiste già' });
    }

    const r = await pool.query(
      `INSERT INTO operatori (nome, attivo) VALUES ($1, $2)
       RETURNING id, nome, attivo, created_at, updated_at`,
      [nome.trim(), attivo ?? true]
    );
    emitEvent('operatori_updated', {});
    res.json({ item: r.rows[0] });
  } catch (e) {
    next(e);
  }
});

operatoriRoutes.put('/:id', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    const { id } = req.params;
    const { nome, attivo } = req.body as { nome?: string; attivo?: boolean };

    const existing = await pool.query('SELECT id FROM operatori WHERE id = $1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Operatore non trovato' });

    if (nome?.trim()) {
      const dup = await pool.query(
        'SELECT id FROM operatori WHERE LOWER(nome) = LOWER($1) AND id != $2',
        [nome.trim(), id]
      );
      if (dup.rows.length) {
        return res.status(400).json({ error: 'Un operatore con questo nome esiste già' });
      }
    }

    const r = await pool.query(
      `UPDATE operatori
       SET nome = COALESCE($1, nome),
           attivo = COALESCE($2, attivo),
           updated_at = now()
       WHERE id = $3
       RETURNING id, nome, attivo, created_at, updated_at`,
      [nome?.trim() ?? null, attivo ?? null, id]
    );
    emitEvent('operatori_updated', {});
    res.json({ item: r.rows[0] });
  } catch (e) {
    next(e);
  }
});

operatoriRoutes.delete('/:id', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    const { id } = req.params;
    const existing = await pool.query('SELECT id FROM operatori WHERE id = $1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Operatore non trovato' });

    const usedR = await pool.query('SELECT COUNT(*)::int AS count FROM cases WHERE operatore_id = $1', [id]);
    const count = usedR.rows[0]?.count ?? 0;
    if (count > 0) {
      return res.status(400).json({
        error: `Non eliminabile: operatore collegato a ${count} casi`,
        usage_count: count
      });
    }

    await pool.query('DELETE FROM operatori WHERE id = $1', [id]);
    emitEvent('operatori_updated', {});
    res.json({ success: true, message: 'Operatore eliminato' });
  } catch (e) {
    next(e);
  }
});