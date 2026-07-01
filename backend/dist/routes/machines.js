"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.machinesRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const db_1 = require("../db");
const socketService_1 = require("../services/socketService");
exports.machinesRoutes = (0, express_1.Router)();
exports.machinesRoutes.get('/', auth_1.authMiddleware, async (_req, res, next) => {
    try {
        const r = await db_1.pool.query(`SELECT m.id, m.code, m.name, m.line, m.location, m.tipologia, m.type, m.posizione, m.created_at,
        (SELECT COUNT(*) FROM cases WHERE machine_id = m.id) AS usage_count
       FROM machines m
       ORDER BY m.created_at DESC`);
        res.json(r.rows);
    }
    catch (e) {
        next(e);
    }
});
exports.machinesRoutes.get('/tipologie', auth_1.authMiddleware, async (_req, res, next) => {
    try {
        const r = await db_1.pool.query(`SELECT DISTINCT tipologia
       FROM machines
       WHERE tipologia IS NOT NULL AND tipologia <> ''
       ORDER BY tipologia`);
        const tipologie = r.rows.map((row) => row.tipologia);
        res.json(tipologie);
    }
    catch (e) {
        next(e);
    }
});
exports.machinesRoutes.post('/', auth_1.authMiddleware, async (req, res, next) => {
    try {
        if (req.user?.role !== 'admin')
            return res.status(403).json({ error: 'Forbidden' });
        const { code, name, line, location, tipologia, type, posizione } = req.body;
        if (!code || !name)
            return res.status(400).json({ error: 'code and name are required' });
        const resolvedTipologia = (tipologia ?? type ?? posizione ?? null);
        const r = await db_1.pool.query('INSERT INTO machines(code,name,line,location,tipologia) VALUES($1,$2,$3,$4,$5) RETURNING id, code, name, line, location, tipologia, created_at', [code, name, line ?? null, location ?? null, resolvedTipologia]);
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
        const { name, line, location, tipologia } = req.body;
        const r = await db_1.pool.query(`UPDATE machines SET name = COALESCE($1, name), line = COALESCE($2, line), location = COALESCE($3, location), tipologia = COALESCE($4, tipologia)
       WHERE id = $5 RETURNING id, code, name, line, location, tipologia, created_at`, [name ?? null, line ?? null, location ?? null, tipologia ?? null, id]);
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
        const usedR = await db_1.pool.query('SELECT COUNT(*)::int AS count FROM cases WHERE machine_id = $1', [id]);
        if ((usedR.rows[0]?.count ?? 0) > 0) {
            return res.status(400).json({ error: `Non eliminabile: macchina usata in ${usedR.rows[0].count} casi` });
        }
        await db_1.pool.query('DELETE FROM machines WHERE id = $1', [id]);
        (0, socketService_1.emitEvent)('machine_updated', { machineId: id, action: 'deleted' });
        res.json({ ok: true });
    }
    catch (e) {
        next(e);
    }
});
