"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.machinesRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const dbService_1 = require("../services/dbService");
exports.machinesRoutes = (0, express_1.Router)();
exports.machinesRoutes.get('/', auth_1.authMiddleware, async (_req, res, next) => {
    try {
        const r = await dbService_1.pool.query('SELECT id, code, name, location, created_at FROM machines ORDER BY created_at DESC');
        res.json({ items: r.rows });
    }
    catch (e) {
        next(e);
    }
});
