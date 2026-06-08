"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.statsRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const dbService_1 = require("../services/dbService");
exports.statsRoutes = (0, express_1.Router)();
exports.statsRoutes.get('/top-machines', auth_1.authMiddleware, async (req, res, next) => {
    try {
        const limit = Math.min(50, Math.max(5, Number(req.query.limit) || 5));
        const r = await dbService_1.pool.query(`SELECT m.code AS machine, COUNT(*)::int AS problem_count
       FROM cases c
       JOIN machines m ON m.id=c.machine_id
       WHERE c.status IN ('open','in_progress')
       GROUP BY m.code
       ORDER BY problem_count DESC
       LIMIT $1`, [limit]);
        res.json({ items: r.rows });
    }
    catch (e) {
        next(e);
    }
});
exports.statsRoutes.get('/trend-cases', auth_1.authMiddleware, async (req, res, next) => {
    try {
        const days = Math.min(90, Math.max(7, Number(req.query.days) || 30));
        const r = await dbService_1.pool.query(`SELECT to_char(d::date, 'YYYY-MM-DD') AS date, COUNT(c.id)::int AS count
       FROM generate_series(current_date - ($1::int - 1) * interval '1 day', current_date, interval '1 day') AS d
       LEFT JOIN cases c ON c.created_at::date = d::date
       GROUP BY d
       ORDER BY d`, [days]);
        res.json({ items: r.rows });
    }
    catch (e) {
        next(e);
    }
});
