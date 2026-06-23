import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../db';
import { emitEvent } from '../services/socketService';

export const categoriesRoutes = Router();

// GET /categories - tutti (cause includono problem_id e problem_name)
categoriesRoutes.get('/', authMiddleware, async (_req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT c.id,
              c.type,
              c.name,
              c.description,
              c.problem_id,
              p.name AS problem_name,
              c.created_at,
              (
                SELECT COUNT(*)
                FROM cases
                WHERE problem_id = c.id OR cause_id = c.id
              )::int AS usage_count
       FROM categories c
       LEFT JOIN categories p ON p.id = c.problem_id AND p.type = 'problem'
       ORDER BY c.type, c.name ASC`
    );
    res.json({ items: r.rows });
  } catch (e) {
    next(e);
  }
});

// GET /categories/:type
categoriesRoutes.get('/:type', authMiddleware, async (req, res, next) => {
  try {
    const { type } = req.params;
    const r = await pool.query(
      `SELECT c.id,
              c.type,
              c.name,
              c.description,
              c.problem_id,
              p.name AS problem_name,
              (
                SELECT COUNT(*)
                FROM cases
                WHERE problem_id = c.id OR cause_id = c.id
              )::int AS usage_count
       FROM categories c
       LEFT JOIN categories p ON p.id = c.problem_id AND p.type = 'problem'
       WHERE c.type = $1
       ORDER BY c.name ASC`,
      [type]
    );
    res.json({ items: r.rows });
  } catch (e) {
    next(e);
  }
});

// POST /categories
categoriesRoutes.post('/', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    const { type, name, description, problem_id } = req.body as {
      type: string;
      name: string;
      description?: string;
      problem_id?: string | null;
    };
    if (!type || !name) return res.status(400).json({ error: 'type and name are required' });
    if (type === 'cause' && !problem_id) {
      return res.status(400).json({ error: 'problem_id è obbligatorio per le cause' });
    }

    const r = await pool.query(
      'INSERT INTO categories(type, name, description, problem_id) VALUES($1,$2,$3,$4) RETURNING *',
      [type, name, description ?? null, type === 'cause' ? (problem_id ?? null) : null]
    );
    emitEvent('categories_updated', { type });
    res.json({ item: r.rows[0] });
  } catch (e) {
    next(e);
  }
});

// PUT /categories/:id
categoriesRoutes.put('/:id', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    const { id } = req.params;
    const { name, description, problem_id } = req.body as {
      name?: string;
      description?: string;
      problem_id?: string | null;
    };

    // Controlla il tipo corrente per validare problem_id
    const existing = await pool.query('SELECT type FROM categories WHERE id = $1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Category not found' });
    const isCause = existing.rows[0].type === 'cause';

    if (isCause && problem_id === null) {
      return res.status(400).json({ error: 'problem_id è obbligatorio per le cause' });
    }

    const r = await pool.query(
      `UPDATE categories
       SET name        = COALESCE($1, name),
           description = COALESCE($2, description),
           problem_id  = CASE WHEN $3::boolean THEN $4::uuid ELSE problem_id END
       WHERE id = $5
       RETURNING *`,
      [
        name ?? null,
        description ?? null,
        problem_id !== undefined,   // $3: aggiorna problem_id solo se passato
        problem_id ?? null,          // $4: il valore
        id                           // $5
      ]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Category not found' });
    emitEvent('categories_updated', { type: r.rows[0].type });
    res.json({ item: r.rows[0] });
  } catch (e) {
    next(e);
  }
});

// DELETE /categories/:id
categoriesRoutes.delete('/:id', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    const { id } = req.params;

    const probCountR  = await pool.query('SELECT COUNT(*)::int as count FROM cases WHERE problem_id = $1', [id]);
    const causeCountR = await pool.query('SELECT COUNT(*)::int as count FROM cases WHERE cause_id = $1', [id]);

    const problemCount = probCountR.rows[0]?.count ?? 0;
    const causeCount   = causeCountR.rows[0]?.count ?? 0;
    const totalUsed    = problemCount + causeCount;

    if (totalUsed > 0) {
      const parts: string[] = [];
      if (problemCount) parts.push(`${problemCount} casi come problema`);
      if (causeCount)   parts.push(`${causeCount} casi come causa`);
      return res.status(400).json({
        error: `Non eliminabile: in uso (${parts.join(', ')})`,
        usage_count: totalUsed
      });
    }

    const r = await pool.query('DELETE FROM categories WHERE id = $1 RETURNING type', [id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Category not found' });
    emitEvent('categories_updated', { type: r.rows[0]?.type ?? 'all' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
