"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.categoriesRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const dbService_1 = require("../services/dbService");
const socketService_1 = require("../services/socketService");
exports.categoriesRoutes = (0, express_1.Router)();
exports.categoriesRoutes.get('/', auth_1.authMiddleware, async (_req, res, next) => {
    try {
        const r = await dbService_1.pool.query('SELECT id, type, name, description, created_at FROM categories ORDER BY type, created_at DESC');
        res.json({ items: r.rows });
    }
    catch (e) {
        next(e);
    }
});
exports.categoriesRoutes.get('/:type', auth_1.authMiddleware, async (req, res, next) => {
    try {
        const { type } = req.params;
        const r = await dbService_1.pool.query('SELECT id, type, name, description FROM categories WHERE type = $1 ORDER BY name', [type]);
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
        const r = await dbService_1.pool.query('INSERT INTO categories(type,name,description) VALUES($1,$2,$3) RETURNING *', [type, name, description ?? null]);
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
        const r = await dbService_1.pool.query('UPDATE categories SET name = COALESCE($1, name), description = COALESCE($2, description) WHERE id = $3 RETURNING *', [name ?? null, description ?? null, id]);
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
        const r = await dbService_1.pool.query('DELETE FROM categories WHERE id = $1 RETURNING type', [id]);
        (0, socketService_1.emitEvent)('categories_updated', { type: r.rows[0]?.type ?? 'all' });
        res.json({ ok: true });
    }
    catch (e) {
        next(e);
    }
});
