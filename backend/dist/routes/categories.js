"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.categoriesRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const dbService_1 = require("../services/dbService");
exports.categoriesRoutes = (0, express_1.Router)();
exports.categoriesRoutes.get('/', auth_1.authMiddleware, async (_req, res, next) => {
    try {
        const r = await dbService_1.pool.query('SELECT id, name, description, created_at FROM categories ORDER BY created_at DESC');
        res.json({ items: r.rows });
    }
    catch (e) {
        next(e);
    }
});
