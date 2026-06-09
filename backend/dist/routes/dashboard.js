"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const db_1 = require("../db");
exports.dashboardRoutes = (0, express_1.Router)();
exports.dashboardRoutes.get('/', auth_1.authMiddleware, async (req, res, next) => {
    try {
        const isAdmin = req.user.role === 'admin';
        const filter = isAdmin ? '' : 'WHERE created_by = $1';
        const params = isAdmin ? [] : [req.user.id];
        const monthFilter = isAdmin
            ? `WHERE EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM now())
         AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM now())`
            : `WHERE created_by = $1
         AND EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM now())
         AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM now())`;
        const [totalR, monthR] = await Promise.all([
            db_1.pool.query(`SELECT COUNT(*)::int AS total FROM cases ${filter}`, params),
            db_1.pool.query(`SELECT COUNT(*)::int AS count FROM cases ${monthFilter}`, params)
        ]);
        res.json({
            total: totalR.rows[0]?.total ?? 0,
            this_month: monthR.rows[0]?.count ?? 0
        });
    }
    catch (e) {
        next(e);
    }
});
