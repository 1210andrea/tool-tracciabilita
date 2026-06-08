"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.casesRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const db_1 = require("../db");
const socketService_1 = require("../services/socketService");
const aiService_1 = require("../services/aiService");
const operatorService_1 = require("../services/operatorService");
exports.casesRoutes = (0, express_1.Router)();
const CASE_FIELDS = `c.id, c.machine_id, c.operator_id, c.problem_id, c.cause_id, c.spare_part_id, c.category_id,
  c.title, c.description, c.solution, c.ai_solution, c.status, c.created_by, c.assigned_to,
  c.created_at, c.updated_at`;
async function getCaseRow(caseId) {
    const r = await db_1.pool.query('SELECT * FROM cases WHERE id = $1', [caseId]);
    return r.rows[0] ?? null;
}
function canAccessCase(caseRow, userId, role) {
    return role === 'admin' || caseRow.created_by === userId;
}
exports.casesRoutes.get('/', auth_1.authMiddleware, async (req, res, next) => {
    try {
        const { status, machine_id, assigned_to, operator_id, problem_id, cause_id, date_from, date_to, time_from, time_to, line, page = '1', limit = '25' } = req.query;
        const pageNumber = Math.max(1, Number(page) || 1);
        const limitNumber = Math.min(100, Math.max(1, Number(limit) || 25));
        const offset = (pageNumber - 1) * limitNumber;
        const conditions = [];
        const values = [];
        if (req.user.role !== 'admin') {
            values.push(req.user.id);
            conditions.push(`c.created_by = $${values.length}`);
        }
        if (req.query.statuses) {
            const statuses = req.query.statuses.split(',').map((s) => s.trim()).filter(Boolean);
            if (statuses.length) {
                values.push(statuses);
                conditions.push(`c.status = ANY($${values.length})`);
            }
        }
        else if (status) {
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
        const r = await db_1.pool.query(`SELECT ${CASE_FIELDS}, m.code as machine_code, m.name as machine_name, u.username as created_by_username,
              op.name as operator_name, prob.name as problem_name, cause.name as cause_name,
              sp.name as spare_part_name,
              COUNT(*) OVER() AS total_count
       FROM cases c
       JOIN machines m ON m.id = c.machine_id
       LEFT JOIN users u ON u.id = c.created_by
       LEFT JOIN categories op ON op.id = c.operator_id
       LEFT JOIN categories prob ON prob.id = c.problem_id
       LEFT JOIN categories cause ON cause.id = c.cause_id
       LEFT JOIN categories sp ON sp.id = c.spare_part_id
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
exports.casesRoutes.get('/:id', auth_1.authMiddleware, async (req, res, next) => {
    try {
        const caseRow = await getCaseRow(req.params.id);
        if (!caseRow)
            return res.status(404).json({ error: 'Case not found' });
        if (!canAccessCase(caseRow, req.user.id, req.user.role)) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const r = await db_1.pool.query(`SELECT ${CASE_FIELDS}, m.code as machine_code, m.name as machine_name, u.username as created_by_username,
              op.name as operator_name, prob.name as problem_name, cause.name as cause_name,
              sp.name as spare_part_name
       FROM cases c
       JOIN machines m ON m.id = c.machine_id
       LEFT JOIN users u ON u.id = c.created_by
       LEFT JOIN categories op ON op.id = c.operator_id
       LEFT JOIN categories prob ON prob.id = c.problem_id
       LEFT JOIN categories cause ON cause.id = c.cause_id
       LEFT JOIN categories sp ON sp.id = c.spare_part_id
       WHERE c.id = $1`, [req.params.id]);
        res.json({ item: r.rows[0] });
    }
    catch (e) {
        next(e);
    }
});
exports.casesRoutes.post('/', auth_1.authMiddleware, async (req, res, next) => {
    try {
        const body = req.body;
        const solution = (body.solution ?? body.description ?? '').toString();
        const operatorId = await (0, operatorService_1.resolveOperatorIdForUser)(req.user.id, body.operator_id);
        const missing = [];
        if (!body.machine_id)
            missing.push('machine_id');
        if (!operatorId)
            missing.push('operatore (collega l\'utente a un operatore in admin)');
        if (!body.problem_id)
            missing.push('problem_id');
        if (!body.cause_id)
            missing.push('cause_id');
        if (!body.spare_part_id)
            missing.push('spare_part_id');
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
        const r = await db_1.pool.query(`INSERT INTO cases(machine_id, operator_id, problem_id, cause_id, spare_part_id, title, description, solution, ai_solution,
                        status, created_by, assigned_to)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`, [
            body.machine_id,
            operatorId,
            body.problem_id ?? null,
            body.cause_id ?? null,
            body.spare_part_id ?? null,
            body.title,
            body.description ?? null,
            solution,
            ai_solution,
            'closed',
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
exports.casesRoutes.put('/:id', auth_1.authMiddleware, async (req, res, next) => {
    try {
        const caseRow = await getCaseRow(req.params.id);
        if (!caseRow)
            return res.status(404).json({ error: 'Case not found' });
        if (!canAccessCase(caseRow, req.user.id, req.user.role)) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const body = req.body;
        const solution = (body.solution ?? body.description ?? caseRow.solution ?? '').toString();
        const operatorId = req.user.role === 'admin'
            ? await (0, operatorService_1.resolveOperatorIdForUser)(req.user.id, body.operator_id ?? caseRow.operator_id)
            : caseRow.operator_id;
        const missing = [];
        if (!body.machine_id)
            missing.push('machine_id');
        if (!operatorId)
            missing.push('operator_id');
        if (!body.problem_id)
            missing.push('problem_id');
        if (!body.cause_id)
            missing.push('cause_id');
        if (!body.spare_part_id)
            missing.push('spare_part_id');
        if (!body.title)
            missing.push('title');
        if (!solution.trim())
            missing.push('solution');
        if (missing.length) {
            return res.status(400).json({ error: `Campo obbligatorio mancante: ${missing[0]}` });
        }
        if (solution.trim().length < 10) {
            return res.status(400).json({ error: 'solution deve contenere almeno 10 caratteri.' });
        }
        const r = await db_1.pool.query(`UPDATE cases
       SET machine_id = $1, operator_id = $2, problem_id = $3, cause_id = $4, spare_part_id = $5,
           title = $6, description = $7, solution = $8, updated_at = now()
       WHERE id = $9
       RETURNING *`, [
            body.machine_id,
            operatorId,
            body.problem_id,
            body.cause_id,
            body.spare_part_id ?? null,
            body.title,
            body.description ?? null,
            solution,
            req.params.id
        ]);
        await db_1.pool.query(`INSERT INTO case_events(case_id,event_type,message,actor_id)
       VALUES($1,'update','case updated',$2)`, [req.params.id, req.user.id]);
        (0, socketService_1.emitEvent)('case-updated', { caseId: req.params.id, title: r.rows[0].title });
        res.json({ item: r.rows[0] });
    }
    catch (e) {
        next(e);
    }
});
exports.casesRoutes.delete('/:id', auth_1.authMiddleware, async (req, res, next) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Solo gli admin possono eliminare i casi' });
        }
        const caseRow = await getCaseRow(req.params.id);
        if (!caseRow)
            return res.status(404).json({ error: 'Case not found' });
        await db_1.pool.query('DELETE FROM cases WHERE id = $1', [req.params.id]);
        (0, socketService_1.emitEvent)('case-updated', { caseId: req.params.id, action: 'deleted' });
        res.json({ ok: true });
    }
    catch (e) {
        next(e);
    }
});
