"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.statsRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const db_1 = require("../db");
exports.statsRoutes = (0, express_1.Router)();
exports.statsRoutes.get('/top-machines', auth_1.authMiddleware, async (req, res, next) => {
    try {
        const limit = Math.min(50, Math.max(5, Number(req.query.limit) || 5));
        const isAdmin = req.user.role === 'admin';
        const r = await db_1.pool.query(`SELECT m.code AS machine, m.code AS code, COUNT(*)::int AS problem_count, COUNT(*)::int AS open_cases
       FROM cases c
       JOIN machines m ON m.id = c.machine_id
       WHERE c.status IN ('open', 'in_progress')
       ${isAdmin ? '' : 'AND c.created_by = $2'}
       GROUP BY m.code
       HAVING COUNT(*) > 0
       ORDER BY problem_count DESC
       LIMIT $1`, isAdmin ? [limit] : [limit, req.user.id]);
        res.json({ items: r.rows.map((row) => ({ ...row, problem_count: Number(row.problem_count) })) });
    }
    catch (e) {
        next(e);
    }
});
exports.statsRoutes.get('/trend-cases', auth_1.authMiddleware, async (req, res, next) => {
    try {
        const days = Math.min(90, Math.max(7, Number(req.query.days) || 30));
        const r = await db_1.pool.query(`SELECT to_char(d::date, 'YYYY-MM-DD') AS date, COUNT(c.id)::int AS count
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
