"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.statsRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const dbService_1 = require("../services/dbService");
exports.statsRoutes = (0, express_1.Router)();
exports.statsRoutes.get('/top-machines', auth_1.authMiddleware, async (_req, res, next) => {
    try {
        const r = await dbService_1.pool.query(`SELECT m.code, m.name, COUNT(*)::int AS open_cases
       FROM cases c
       JOIN machines m ON m.id=c.machine_id
       WHERE c.status IN ('open','in_progress')
       GROUP BY m.code, m.name
       ORDER BY open_cases DESC
       LIMIT 5`);
        res.json({ items: r.rows });
    }
    catch (e) {
        next(e);
    }
});
