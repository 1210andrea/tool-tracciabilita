"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.machinesRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const dbService_1 = require("../services/dbService");
const socketService_1 = require("../services/socketService");
exports.machinesRoutes = (0, express_1.Router)();
exports.machinesRoutes.get('/', auth_1.authMiddleware, async (_req, res, next) => {
    try {
        const r = await dbService_1.pool.query('SELECT id, code, name, line, location, created_at FROM machines ORDER BY created_at DESC');
        res.json({ items: r.rows });
    }
    catch (e) {
        next(e);
    }
});
exports.machinesRoutes.post('/', auth_1.authMiddleware, async (req, res, next) => {
    try {
        if (req.user?.role !== 'admin')
            return res.status(403).json({ error: 'Forbidden' });
        const { code, name, line, location } = req.body;
        if (!code || !name)
            return res.status(400).json({ error: 'code and name are required' });
        const r = await dbService_1.pool.query('INSERT INTO machines(code,name,line,location) VALUES($1,$2,$3,$4) RETURNING id, code, name, line, location, created_at', [code, name, line ?? null, location ?? null]);
        (0, socketService_1.emitEvent)('machine_updated', { machineId: r.rows[0].id, action: 'created' });
        res.json({ item: r.rows[0] });
    }
    catch (e) {
        next(e);
    }
});
exports.machinesRoutes.put('/:id', auth_1.authMiddleware, async (req, res, next) => {
    try {
        if (req.user?.role !== 'admin')
            return res.status(403).json({ error: 'Forbidden' });
        const { id } = req.params;
        const { name, line, location } = req.body;
        const r = await dbService_1.pool.query(`UPDATE machines SET name = COALESCE($1, name), line = COALESCE($2, line), location = COALESCE($3, location)
       WHERE id = $4 RETURNING id, code, name, line, location, created_at`, [name ?? null, line ?? null, location ?? null, id]);
        if (!r.rows.length)
            return res.status(404).json({ error: 'Machine not found' });
        (0, socketService_1.emitEvent)('machine_updated', { machineId: id, action: 'updated' });
        res.json({ item: r.rows[0] });
    }
    catch (e) {
        next(e);
    }
});
exports.machinesRoutes.delete('/:id', auth_1.authMiddleware, async (req, res, next) => {
    try {
        if (req.user?.role !== 'admin')
            return res.status(403).json({ error: 'Forbidden' });
        const { id } = req.params;
        await dbService_1.pool.query('DELETE FROM machines WHERE id = $1', [id]);
        (0, socketService_1.emitEvent)('machine_updated', { machineId: id, action: 'deleted' });
        res.json({ ok: true });
    }
    catch (e) {
        next(e);
    }
});
