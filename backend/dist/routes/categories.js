"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.categoriesRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const db_1 = require("../db");
const socketService_1 = require("../services/socketService");
exports.categoriesRoutes = (0, express_1.Router)();
exports.categoriesRoutes.get('/', auth_1.authMiddleware, async (_req, res, next) => {
    try {
        const r = await db_1.pool.query('SELECT id, type, name, description, created_at FROM categories ORDER BY type, created_at DESC');
        res.json({ items: r.rows });
    }
    catch (e) {
        next(e);
    }
});
exports.categoriesRoutes.get('/:type', auth_1.authMiddleware, async (req, res, next) => {
    try {
        const { type } = req.params;
        const r = await db_1.pool.query('SELECT id, type, name, description FROM categories WHERE type = $1 ORDER BY name', [type]);
        res.json({ items: r.rows });
    }
    catch (e) {
        next(e);
    }
});
exports.categoriesRoutes.post('/', auth_1.authMiddleware, async (req, res, next) => {
    try {
        if (req.user?.role !== 'admin')
            return res.status(403).json({ error: 'Forbidden' });
        const { type, name, description } = req.body;
        if (!type || !name)
            return res.status(400).json({ error: 'type and name are required' });
        const r = await db_1.pool.query('INSERT INTO categories(type,name,description) VALUES($1,$2,$3) RETURNING *', [type, name, description ?? null]);
        (0, socketService_1.emitEvent)('categories_updated', { type });
        res.json({ item: r.rows[0] });
    }
    catch (e) {
        next(e);
    }
});
exports.categoriesRoutes.put('/:id', auth_1.authMiddleware, async (req, res, next) => {
    try {
        if (req.user?.role !== 'admin')
            return res.status(403).json({ error: 'Forbidden' });
        const { id } = req.params;
        const { name, description } = req.body;
        const r = await db_1.pool.query('UPDATE categories SET name = COALESCE($1, name), description = COALESCE($2, description) WHERE id = $3 RETURNING *', [name ?? null, description ?? null, id]);
        if (!r.rows.length)
            return res.status(404).json({ error: 'Category not found' });
        (0, socketService_1.emitEvent)('categories_updated', { type: r.rows[0].type });
        res.json({ item: r.rows[0] });
    }
    catch (e) {
        next(e);
    }
});
exports.categoriesRoutes.delete('/:id', auth_1.authMiddleware, async (req, res, next) => {
    try {
        if (req.user?.role !== 'admin')
            return res.status(403).json({ error: 'Forbidden' });
        const { id } = req.params;
        // 1) Verifica referenzialità in cases
        const opCountR = await db_1.pool.query('SELECT COUNT(*)::int as count FROM cases WHERE operator_id = $1', [id]);
        const probCountR = await db_1.pool.query('SELECT COUNT(*)::int as count FROM cases WHERE problem_id = $1', [id]);
        const causeCountR = await db_1.pool.query('SELECT COUNT(*)::int as count FROM cases WHERE cause_id = $1', [id]);
        const spareCountR = await db_1.pool.query('SELECT COUNT(*)::int as count FROM cases WHERE spare_part_id = $1', [id]);
        const userCountR = await db_1.pool.query('SELECT COUNT(*)::int as count FROM users WHERE operator_category_id = $1', [id]);
        const operatorCount = opCountR.rows[0]?.count ?? 0;
        const problemCount = probCountR.rows[0]?.count ?? 0;
        const causeCount = causeCountR.rows[0]?.count ?? 0;
        const spareCount = spareCountR.rows[0]?.count ?? 0;
        const userCount = userCountR.rows[0]?.count ?? 0;
        const totalUsed = operatorCount + problemCount + causeCount + spareCount + userCount;
        if (totalUsed > 0) {
            const parts = [];
            if (operatorCount)
                parts.push(`${operatorCount} casi come operatore`);
            if (problemCount)
                parts.push(`${problemCount} casi come problema`);
            if (causeCount)
                parts.push(`${causeCount} casi come causa`);
            if (spareCount)
                parts.push(`${spareCount} casi come ricambio`);
            if (userCount)
                parts.push(`${userCount} utenti collegati`);
            return res.status(400).json({ error: `Non eliminabile: in uso (${parts.join(', ')})` });
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
