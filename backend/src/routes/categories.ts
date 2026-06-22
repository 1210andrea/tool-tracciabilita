import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../db';
import { emitEvent } from '../services/socketService';

export const categoriesRoutes = Router();

// GET /categories - tutti
categoriesRoutes.get('/', authMiddleware, async (_req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT c.id, c.type, c.name, c.description, c.created_at,
        (SELECT COUNT(*) FROM cases WHERE problem_id = c.id OR cause_id = c.id) AS usage_count
       FROM categories c
       ORDER BY c.type, c.created_at DESC`
    );
    res.json({ items: r.rows });
  } catch (e) {
    next(e);
  }
});

// GET /categories/causes-by-problem/:problemId
categoriesRoutes.get('/causes-by-problem/:problemId', authMiddleware, async (req, res, next) => {
  try {
    const { problemId } = req.params;
    const r = await pool.query(
      `SELECT c.id, c.type, c.name, c.description
       FROM categories c
       INNER JOIN problem_causes pc ON pc.cause_id = c.id
       WHERE pc.problem_id = $1 AND c.type = 'cause'
       ORDER BY c.name`,
      [problemId]
    );
    res.json({ items: r.rows });
  } catch (e) {
    next(e);
  }
});

// GET /categories/solutions-by-problem/:problemId
categoriesRoutes.get('/solutions-by-problem/:problemId', authMiddleware, async (req, res, next) => {
  try {
    const { problemId } = req.params;
    const r = await pool.query(
      `SELECT s.id, s.name, s.description, s.cause_id
       FROM solutions_applied s
       INNER JOIN problem_solutions ps ON ps.solution_id = s.id
       WHERE ps.problem_id = $1
       ORDER BY s.name`,
      [problemId]
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
    if (['causes-by-problem', 'solutions-by-problem'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type' });
    }
    const r = await pool.query(
      `SELECT c.id, c.type, c.name, c.description,
        (SELECT COUNT(*) FROM cases WHERE problem_id = c.id OR cause_id = c.id) AS usage_count
       FROM categories c
       WHERE c.type = $1
       ORDER BY c.name`,
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

    const { type, name, description, problem_ids } = req.body as {
      type: string;
      name: string;
      description?: string;
      problem_ids?: string[];
    };
    if (!type || !name) return res.status(400).json({ error: 'type and name are required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query(
        'INSERT INTO categories(type,name,description) VALUES($1,$2,$3) RETURNING *',
        [type, name, description ?? null]
      );
      const newItem = r.rows[0];

      if (type === 'cause' && problem_ids && problem_ids.length > 0) {
        for (const pid of problem_ids) {
          await client.query(
            'INSERT INTO problem_causes(problem_id, cause_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
            [pid, newItem.id]
          );
        }
      }

      await client.query('COMMIT');
      emitEvent('categories_updated', { type });
      res.json({ item: newItem });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    next(e);
  }
});

// PUT /categories/:id
categoriesRoutes.put('/:id', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    const { id } = req.params;
    const { name, description, problem_ids } = req.body as {
      name?: string;
      description?: string;
      problem_ids?: string[];
    };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const r = await client.query(
        'UPDATE categories SET name = COALESCE($1, name), description = COALESCE($2, description) WHERE id = $3 RETURNING *',
        [name ?? null, description ?? null, id]
      );
      if (!r.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Category not found' });
      }
      const updated = r.rows[0];

      if (updated.type === 'cause' && problem_ids !== undefined) {
        await client.query('DELETE FROM problem_causes WHERE cause_id = $1', [id]);
        for (const pid of problem_ids) {
          await client.query(
            'INSERT INTO problem_causes(problem_id, cause_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
            [pid, id]
          );
        }
      }

      await client.query('COMMIT');
      emitEvent('categories_updated', { type: updated.type });
      res.json({ item: updated });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    next(e);
  }
});

// DELETE /categories/:id
categoriesRoutes.delete('/:id', authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    const { id } = req.params;

    const probCountR = await pool.query('SELECT COUNT(*)::int as count FROM cases WHERE problem_id = $1', [id]);
    const causeCountR = await pool.query('SELECT COUNT(*)::int as count FROM cases WHERE cause_id = $1', [id]);

    const problemCount = probCountR.rows[0]?.count ?? 0;
    const causeCount = causeCountR.rows[0]?.count ?? 0;
    const totalUsed = problemCount + causeCount;

    if (totalUsed > 0) {
      const parts: string[] = [];
      if (problemCount) parts.push(`${problemCount} casi come problema`);
      if (causeCount) parts.push(`${causeCount} casi come causa`);
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
