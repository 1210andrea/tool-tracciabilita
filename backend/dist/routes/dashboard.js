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
exports.dashboardRoutes.get('/problemi-tempo', auth_1.authMiddleware, async (req, res, next) => {
    try {
        const { startDate, endDate, date_from, date_to, month, year, machine_id, line, problem_id, cause_id, limit = '10' } = req.query;
        const limitNum = Math.min(Math.max(parseInt(String(limit), 10) || 10, 1), 50);
        // Costruisci le condizioni WHERE
        const conditions = ["c.status IN ('closed', 'completato')"];
        const params = [];
        // Gestione date (supporta sia date_from che startDate)
        const effectiveStartDate = startDate || date_from;
        const effectiveEndDate = endDate || date_to;
        if (effectiveStartDate) {
            conditions.push(`c.created_at >= $${params.length + 1}`);
            params.push(effectiveStartDate);
        }
        if (effectiveEndDate) {
            conditions.push(`c.created_at <= $${params.length + 1}`);
            params.push(effectiveEndDate);
        }
        // Filtro mese/anno (se presenti)
        if (month) {
            conditions.push(`EXTRACT(MONTH FROM c.created_at) = $${params.length + 1}`);
            params.push(parseInt(String(month), 10));
        }
        if (year) {
            conditions.push(`EXTRACT(YEAR FROM c.created_at) = $${params.length + 1}`);
            params.push(parseInt(String(year), 10));
        }
        // Filtro macchina
        if (machine_id) {
            conditions.push(`c.machine_id = $${params.length + 1}`);
            params.push(machine_id);
        }
        // Filtro linea
        if (line) {
            conditions.push(`m.line = $${params.length + 1}`);
            params.push(line);
        }
        // Filtro problema
        if (problem_id) {
            conditions.push(`c.problem_id = $${params.length + 1}`);
            params.push(problem_id);
        }
        // Filtro causa
        if (cause_id) {
            conditions.push(`c.cause_id = $${params.length + 1}`);
            params.push(cause_id);
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        // Query con join a machines per il filtro linea
        params.push(limitNum);
        const query = `
      SELECT prob.name AS nome, COALESCE(SUM(c.tempo_impiego)::float, 0) AS tempo_totale
      FROM cases c
      JOIN categories prob ON c.problem_id = prob.id
      LEFT JOIN machines m ON c.machine_id = m.id
      ${whereClause}
      GROUP BY prob.id, prob.name
      ORDER BY tempo_totale DESC
      LIMIT $${params.length}
    `;
        const r = await db_1.pool.query(query, params);
        res.json({ data: r.rows });
    }
    catch (e) {
        next(e);
    }
});
