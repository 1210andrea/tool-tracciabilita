"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const dbService_1 = require("../services/dbService");
exports.dashboardRoutes = (0, express_1.Router)();
exports.dashboardRoutes.get('/', auth_1.authMiddleware, async (_req, res, next) => {
    try {
        const r = await dbService_1.pool.query(`SELECT status, COUNT(*)::int as count
       FROM cases
       GROUP BY status
       ORDER BY count DESC`);
        res.json({ breakdown: r.rows });
    }
    catch (e) {
        next(e);
    }
});
