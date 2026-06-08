"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.casesRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const db_1 = require("../db");
const socketService_1 = require("../services/socketService");
const aiService_1 = require("../services/aiService");
exports.casesRoutes = (0, express_1.Router)();
exports.casesRoutes.get('/', auth_1.authMiddleware, async (req, res, next) => {
    try {
        const { status, machine_id, assigned_to, operator_id, problem_id, cause_id, date_from, date_to, time_from, time_to, line, page = '1', limit = '25' } = req.query;
        const pageNumber = Math.max(1, Number(page) || 1);
        const limitNumber = Math.min(100, Math.max(1, Number(limit) || 25));
        const offset = (pageNumber - 1) * limitNumber;
        const conditions = [];
        const values = [];
        if (status) {
            values.push(status);
            conditions.push(`c.status = $${values.length}`);
        }
        if (machine_id) {
            values.push(machine_id);
            conditions.push(`c.machine_id = $${values.length}`);
        }
        if (assigned_to) {
            values.push(assigned_to);
            conditions.push(`c.assigned_to = $${values.length}`);
        }
        if (req.query.month) {
            values.push(Number(req.query.month));
            conditions.push(`EXTRACT(MONTH FROM c.created_at)::int = $${values.length}`);
        }
        if (req.query.year) {
            values.push(Number(req.query.year));
            conditions.push(`EXTRACT(YEAR FROM c.created_at)::int = $${values.length}`);
        }
        if (operator_id) {
            values.push(operator_id);
            conditions.push(`c.operator_id = $${values.length}`);
        }
        if (problem_id) {
            values.push(problem_id);
            conditions.push(`c.problem_id = $${values.length}`);
        }
        if (cause_id) {
            values.push(cause_id);
            conditions.push(`c.cause_id = $${values.length}`);
        }
        if (date_from) {
            values.push(date_from);
            conditions.push(`c.created_at::date >= $${values.length}`);
        }
        if (date_to) {
            values.push(date_to);
            conditions.push(`c.created_at::date <= $${values.length}`);
        }
        if (time_from) {
            values.push(time_from);
            conditions.push(`TO_CHAR(c.created_at, 'HH24:MI') >= $${values.length}`);
        }
        if (time_to) {
            values.push(time_to);
            conditions.push(`TO_CHAR(c.created_at, 'HH24:MI') <= $${values.length}`);
        }
        if (line) {
            values.push(line);
            conditions.push(`m.line = $${values.length}`);
        }
        const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const r = await db_1.pool.query(`SELECT c.*, m.code as machine_code, m.name as machine_name, u.username as created_by_username,
              op.name as operator_name, prob.name as problem_name, cause.name as cause_name,
              COUNT(*) OVER() AS total_count
       FROM cases c
       JOIN machines m ON m.id = c.machine_id
       LEFT JOIN users u ON u.id = c.created_by
       LEFT JOIN categories op ON op.id = c.operator_id
       LEFT JOIN categories prob ON prob.id = c.problem_id
       LEFT JOIN categories cause ON cause.id = c.cause_id
       ${whereClause}
       ORDER BY c.created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, limitNumber, offset]);
        const total = r.rows[0]?.total_count ?? 0;
        res.json({ items: r.rows, total });
    }
    catch (e) {
        next(e);
    }
});
exports.casesRoutes.post('/', auth_1.authMiddleware, async (req, res, next) => {
    try {
        const body = req.body;
        const solution = (body.solution ?? body.description ?? '').toString();
        const missing = [];
        if (!body.machine_id)
            missing.push('machine_id');
        if (!body.operator_id)
            missing.push('operator_id');
        if (!body.problem_id)
            missing.push('problem_id');
        if (!body.cause_id)
            missing.push('cause_id');
        if (!body.title)
            missing.push('title');
        if (!solution.trim())
            missing.push('solution (o description)');
        if (missing.length) {
            return res.status(400).json({ error: `Campo obbligatorio mancante: ${missing[0]}` });
        }
        if (solution.trim().length < 10) {
            return res.status(400).json({ error: 'solution deve contenere almeno 10 caratteri.' });
        }
        const machineQuery = await db_1.pool.query('SELECT code, name, line FROM machines WHERE id = $1', [body.machine_id]);
        const machineRecord = machineQuery.rows[0];
        const machineName = machineRecord?.name ?? body.machine_id;
        const machineLine = machineRecord?.line ?? 'N/A';
        const categoryNames = await Promise.all(['operator_id', 'problem_id', 'cause_id'].map(async (key) => {
            const id = body[key];
            if (!id)
                return 'N/A';
            const cat = await db_1.pool.query('SELECT name FROM categories WHERE id = $1', [id]);
            return cat.rows[0]?.name ?? 'N/A';
        }));
        const ai_solution = await (0, aiService_1.generateAiSolution)({
            machine: `${machineName}`,
            line: machineLine,
            operator: categoryNames[0],
            problem: categoryNames[1],
            cause: categoryNames[2],
            description: solution
        });
        const r = await db_1.pool.query(`INSERT INTO cases(machine_id, operator_id, problem_id, cause_id, title, description, solution, ai_solution,
                        priority, status, created_by, assigned_to)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`, [
            body.machine_id,
            body.operator_id ?? null,
            body.problem_id ?? null,
            body.cause_id ?? null,
            body.title,
            body.description ?? null,
            solution,
            ai_solution,
            body.priority ?? 'medium',
            body.status ?? 'open',
            req.user.id,
            body.assigned_to ?? null
        ]);
        await db_1.pool.query(`INSERT INTO case_events(case_id,event_type,message,actor_id)
       VALUES($1,'system','case created',$2)`, [r.rows[0].id, req.user.id]);
        (0, socketService_1.emitEvent)('case_created', { caseId: r.rows[0].id, title: r.rows[0].title });
        (0, socketService_1.emitEvent)('case-updated', { caseId: r.rows[0].id, title: r.rows[0].title });
        res.json({ item: r.rows[0] });
    }
    catch (e) {
        next(e);
    }
});
