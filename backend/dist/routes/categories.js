"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.categoriesRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const db_1 = require("../db");
const socketService_1 = require("../services/socketService");
exports.categoriesRoutes = (0, express_1.Router)();
async function ensureCauseProblemsTable() {
    await db_1.pool.query(`
    CREATE TABLE IF NOT EXISTS cause_problems (
      cause_id   UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      problem_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      PRIMARY KEY (cause_id, problem_id)
    )
  `);
}
ensureCauseProblemsTable().catch(console.error);
// GET /categories
exports.categoriesRoutes.get('/', auth_1.authMiddleware, async (_req, res, next) => {
    try {
        const r = await db_1.pool.query(`SELECT c.id,
              c.type,
              c.name,
              c.description,
              c.problem_id,
              p.name AS problem_name,
              c.created_at,
              COALESCE(
                (SELECT array_agg(cp.problem_id::text ORDER BY prob.name)
                 FROM cause_problems cp
                 JOIN categories prob ON prob.id = cp.problem_id
                 WHERE cp.cause_id = c.id),
                ARRAY[]::text[]
              ) AS problem_ids,
              COALESCE(
                (SELECT array_agg(prob.name ORDER BY prob.name)
                 FROM cause_problems cp
                 JOIN categories prob ON prob.id = cp.problem_id
                 WHERE cp.cause_id = c.id),
                ARRAY[]::text[]
              ) AS problem_names,
              (
                SELECT COUNT(*)
                FROM cases
                WHERE problem_id = c.id OR cause_id = c.id
              )::int AS usage_count
       FROM categories c
       LEFT JOIN categories p ON p.id = c.problem_id AND p.type = 'problem'
       ORDER BY c.type, c.name ASC`);
        res.json(r.rows);
    }
    catch (e) {
        next(e);
    }
});
// GET /categories/causes-by-problem/:problemId
exports.categoriesRoutes.get('/causes-by-problem/:problemId', auth_1.authMiddleware, async (req, res, next) => {
    try {
        const { problemId } = req.params;
        const r = await db_1.pool.query(`SELECT DISTINCT c.id, c.type, c.name, c.description, c.problem_id
       FROM categories c
       LEFT JOIN cause_problems cp ON cp.cause_id = c.id
       WHERE c.type = 'cause'
         AND (c.problem_id = $1 OR cp.problem_id = $1)
       ORDER BY c.name ASC`, [problemId]);
        res.json({ items: r.rows });
    }
    catch (e) {
        next(e);
    }
});
// GET /categories/solutions-by-problem/:problemId
exports.categoriesRoutes.get('/solutions-by-problem/:problemId', auth_1.authMiddleware, async (req, res, next) => {
    try {
        const { problemId } = req.params;
        const r = await db_1.pool.query(`SELECT sa.id, sa.name, sa.description
       FROM solutions_applied sa
       JOIN solution_problems sp ON sp.solution_id = sa.id
       WHERE sp.problem_id = $1
       ORDER BY sa.name ASC`, [problemId]);
        res.json({ items: r.rows });
    }
    catch (e) {
        next(e);
    }
});
// GET /categories/:type
exports.categoriesRoutes.get('/:type', auth_1.authMiddleware, async (req, res, next) => {
    try {
        const { type } = req.params;
        const r = await db_1.pool.query(`SELECT c.id,
              c.type,
              c.name,
              c.description,
              c.problem_id,
              p.name AS problem_name,
              COALESCE(
                (SELECT array_agg(cp.problem_id::text ORDER BY prob.name)
                 FROM cause_problems cp
                 JOIN categories prob ON prob.id = cp.problem_id
                 WHERE cp.cause_id = c.id),
                ARRAY[]::text[]
              ) AS problem_ids,
              COALESCE(
                (SELECT array_agg(prob.name ORDER BY prob.name)
                 FROM cause_problems cp
                 JOIN categories prob ON prob.id = cp.problem_id
                 WHERE cp.cause_id = c.id),
                ARRAY[]::text[]
              ) AS problem_names,
              (
                SELECT COUNT(*)
                FROM cases
                WHERE problem_id = c.id OR cause_id = c.id
              )::int AS usage_count
       FROM categories c
       LEFT JOIN categories p ON p.id = c.problem_id AND p.type = 'problem'
       WHERE c.type = $1
       ORDER BY c.name ASC`, [type]);
        res.json({ items: r.rows });
    }
    catch (e) {
        next(e);
    }
});
// POST /categories
exports.categoriesRoutes.post('/', auth_1.authMiddleware, async (req, res, next) => {
    const client = await db_1.pool.connect();
    try {
        if (req.user?.role !== 'admin')
            return res.status(403).json({ error: 'Forbidden' });
        const { type, name, description, problem_id, problem_ids } = req.body;
        if (!type || !name)
            return res.status(400).json({ error: 'type and name are required' });
        const effectiveProblemId = type === 'cause' ? (problem_id ?? (problem_ids?.[0] ?? null)) : null;
        if (type === 'cause' && !effectiveProblemId && (!problem_ids || problem_ids.length === 0)) {
            return res.status(400).json({ error: 'Almeno un problema è obbligatorio per le cause' });
        }
        await client.query('BEGIN');
        const r = await client.query('INSERT INTO categories(type, name, description, problem_id) VALUES($1,$2,$3,$4) RETURNING *', [type, name, description ?? null, effectiveProblemId]);
        const newCause = r.rows[0];
        if (type === 'cause' && problem_ids && problem_ids.length > 0) {
            for (const pid of problem_ids) {
                await client.query('INSERT INTO cause_problems(cause_id, problem_id) VALUES($1, $2) ON CONFLICT DO NOTHING', [newCause.id, pid]);
            }
        }
        else if (type === 'cause' && effectiveProblemId) {
            await client.query('INSERT INTO cause_problems(cause_id, problem_id) VALUES($1, $2) ON CONFLICT DO NOTHING', [newCause.id, effectiveProblemId]);
        }
        await client.query('COMMIT');
        (0, socketService_1.emitEvent)('categories_updated', { type });
        res.json({ item: newCause });
    }
    catch (e) {
        await client.query('ROLLBACK');
        next(e);
    }
    finally {
        client.release();
    }
});
// PUT /categories/:id
exports.categoriesRoutes.put('/:id', auth_1.authMiddleware, async (req, res, next) => {
    const client = await db_1.pool.connect();
    try {
        if (req.user?.role !== 'admin')
            return res.status(403).json({ error: 'Forbidden' });
        const { id } = req.params;
        const { name, description, problem_id, problem_ids } = req.body;
        const existing = await client.query('SELECT type FROM categories WHERE id = $1', [id]);
        if (!existing.rows.length)
            return res.status(404).json({ error: 'Category not found' });
        const isCause = existing.rows[0].type === 'cause';
        const effectiveProblemId = isCause
            ? (problem_id !== undefined ? problem_id : (problem_ids?.[0] ?? null))
            : undefined;
        await client.query('BEGIN');
        const r = await client.query(`UPDATE categories
       SET name        = COALESCE($1, name),
           description = COALESCE($2, description),
           problem_id  = CASE WHEN $3::boolean THEN $4::uuid ELSE problem_id END
       WHERE id = $5
       RETURNING *`, [
            name ?? null,
            description ?? null,
            effectiveProblemId !== undefined,
            effectiveProblemId ?? null,
            id
        ]);
        if (!r.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Category not found' });
        }
        if (isCause && problem_ids !== undefined) {
            await client.query('DELETE FROM cause_problems WHERE cause_id = $1', [id]);
            for (const pid of problem_ids) {
                await client.query('INSERT INTO cause_problems(cause_id, problem_id) VALUES($1, $2) ON CONFLICT DO NOTHING', [id, pid]);
            }
            if (problem_ids.length > 0) {
                await client.query('UPDATE categories SET problem_id = $1 WHERE id = $2 AND problem_id IS NULL', [problem_ids[0], id]);
            }
        }
        await client.query('COMMIT');
        (0, socketService_1.emitEvent)('categories_updated', { type: r.rows[0].type });
        res.json({ item: r.rows[0] });
    }
    catch (e) {
        await client.query('ROLLBACK');
        next(e);
    }
    finally {
        client.release();
    }
});
// DELETE /categories/:id
exports.categoriesRoutes.delete('/:id', auth_1.authMiddleware, async (req, res, next) => {
    try {
        if (req.user?.role !== 'admin')
            return res.status(403).json({ error: 'Forbidden' });
        const { id } = req.params;
        const probCountR = await db_1.pool.query('SELECT COUNT(*)::int as count FROM cases WHERE problem_id = $1', [id]);
        const causeCountR = await db_1.pool.query('SELECT COUNT(*)::int as count FROM cases WHERE cause_id = $1', [id]);
        const problemCount = probCountR.rows[0]?.count ?? 0;
        const causeCount = causeCountR.rows[0]?.count ?? 0;
        const totalUsed = problemCount + causeCount;
        if (totalUsed > 0) {
            const parts = [];
            if (problemCount)
                parts.push(`${problemCount} casi come problema`);
            if (causeCount)
                parts.push(`${causeCount} casi come causa`);
            return res.status(400).json({
                error: `Non eliminabile: in uso (${parts.join(', ')})`,
                usage_count: totalUsed
            });
        }
        const r = await db_1.pool.query('DELETE FROM categories WHERE id = $1 RETURNING type', [id]);
        if (!r.rows.length)
            return res.status(404).json({ error: 'Category not found' });
        (0, socketService_1.emitEvent)('categories_updated', { type: r.rows[0]?.type ?? 'all' });
        res.json({ ok: true });
    }
    catch (e) {
        next(e);
    }
});
