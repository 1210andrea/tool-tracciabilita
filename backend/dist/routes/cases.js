"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.casesRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const db_1 = require("../db");
const socketService_1 = require("../services/socketService");
const aiService_1 = require("../services/aiService");
exports.casesRoutes = (0, express_1.Router)();
const CASE_FIELDS = `c.id, c.machine_id, c.problem_id, c.cause_id, c.spare_part_id, c.solution_applied_id, c.category_id,
  c.description, c.solution, c.ai_solution, c.status, c.created_by, c.assigned_to,
  c.notes, c.created_at, c.updated_at`;
const CASE_JOINS = `
  JOIN machines m ON m.id = c.machine_id
  LEFT JOIN users u ON u.id = c.created_by
  LEFT JOIN categories prob ON prob.id = c.problem_id
  LEFT JOIN categories cause ON cause.id = c.cause_id
  LEFT JOIN spare_parts sp ON sp.id = c.spare_part_id
  LEFT JOIN solutions_applied sa ON sa.id = c.solution_applied_id
  LEFT JOIN categories oper ON oper.id = (SELECT operator_category_id FROM users uu WHERE uu.id = c.created_by)`;
async function getCaseRow(caseId) {
    const r = await db_1.pool.query('SELECT * FROM cases WHERE id = $1', [caseId]);
    return r.rows[0] ?? null;
}
function canAccessCase(caseRow, userId, role) {
    return role === 'admin' || caseRow.created_by === userId;
}
async function lookupName(table, id) {
    if (!id)
        return 'N/D';
    const r = await db_1.pool.query(`SELECT name FROM ${table} WHERE id = $1`, [id]);
    return r.rows[0]?.name ?? 'N/D';
}
exports.casesRoutes.get('/', auth_1.authMiddleware, async (req, res, next) => {
    try {
        const { status, machine_id, assigned_to, problem_id, cause_id, date_from, date_to, time_from, time_to, line, page = '1', limit = '25' } = req.query;
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
              COALESCE(oper.name, u.username) as operator_name,
              prob.name as problem_name, cause.name as cause_name,
              sp.name as spare_part_name, sa.name as solution_applied_name,
              COUNT(*) OVER() AS total_count
       FROM cases c
       ${CASE_JOINS}
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
exports.casesRoutes.get('/export-csv', auth_1.authMiddleware, async (req, res, next) => {
    try {
        const { status, machine_id, assigned_to, problem_id, cause_id, date_from, date_to, time_from, time_to, line } = req.query;
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
        const r = await db_1.pool.query(`SELECT c.id, m.code as machine_code, m.name as machine_name, u.username as created_by_username,
              COALESCE(oper.name, u.username) as operator_name,
              prob.name as problem_name, cause.name as cause_name,
              sp.name as spare_part_name, sa.name as solution_applied_name,
              c.description, c.solution, c.notes, c.ai_solution, c.status, c.created_at
       FROM cases c
       ${CASE_JOINS}
       ${whereClause}
       ORDER BY c.created_at DESC`, values);
        const headers = [
            'ID Caso',
            'Codice Macchina',
            'Nome Macchina',
            'Operatore',
            'Problema',
            'Causa',
            'Ricambio Usato',
            'Soluzione Applicata',
            'Descrizione',
            'Note',
            'Soluzione AI',
            'Stato',
            'Data Creazione'
        ];
        const escapeCSV = (val) => {
            if (val === null || val === undefined)
                return '';
            const str = String(val).replace(/"/g, '""');
            return `"${str}"`;
        };
        let csvContent = headers.join(',') + '\n';
        for (const row of r.rows) {
            const lineData = [
                row.id,
                row.machine_code,
                row.machine_name,
                row.operator_name,
                row.problem_name,
                row.cause_name,
                row.spare_part_name,
                row.solution_applied_name,
                row.description || row.solution,
                row.notes,
                row.ai_solution,
                row.status,
                row.created_at ? new Date(row.created_at).toISOString() : ''
            ];
            csvContent += lineData.map(escapeCSV).join(',') + '\n';
        }
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="casi_esportati.csv"');
        return res.status(200).send(csvContent);
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
              COALESCE(oper.name, u.username) as operator_name,
              prob.name as problem_name, cause.name as cause_name,
              sp.name as spare_part_name, sa.name as solution_applied_name
       FROM cases c
       ${CASE_JOINS}
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
        const missing = [];
        if (!body.machine_id)
            missing.push('macchina');
        if (!body.problem_id)
            missing.push('problema');
        if (!body.cause_id)
            missing.push('causa');
        if (!body.spare_part_id)
            missing.push('pezzo di ricambio');
        if (!body.solution_applied_id)
            missing.push('soluzione applicata');
        if (missing.length) {
            return res.status(400).json({ error: `Campo obbligatorio mancante: ${missing[0]}` });
        }
        if (body.notes && body.notes.length > 1000) {
            return res.status(400).json({ error: 'Le note non possono superare i 1000 caratteri.' });
        }
        const machineQuery = await db_1.pool.query('SELECT code, name, line, type FROM machines WHERE id = $1', [body.machine_id]);
        const machineRecord = machineQuery.rows[0];
        if (!machineRecord) {
            return res.status(400).json({ error: 'Macchina non trovata' });
        }
        const problemName = await lookupName('categories', body.problem_id);
        const causeName = await lookupName('categories', body.cause_id);
        const sparePartName = await lookupName('spare_parts', body.spare_part_id);
        let solutionAppliedDesc = '';
        if (body.solution_applied_id) {
            const saR = await db_1.pool.query('SELECT name, description FROM solutions_applied WHERE id = $1', [body.solution_applied_id]);
            solutionAppliedDesc = saR.rows[0]?.description ?? saR.rows[0]?.name ?? '';
        }
        const combinedDescription = solutionAppliedDesc || 'N/D';
        // Creazione caso: ritorna subito, generazione AI in background
        const r = await db_1.pool.query(`INSERT INTO cases(machine_id, problem_id, cause_id, spare_part_id, solution_applied_id, description, solution, ai_solution,
                        status, created_by, assigned_to, notes)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`, [
            body.machine_id,
            body.problem_id ?? null,
            body.cause_id ?? null,
            body.spare_part_id ?? null,
            body.solution_applied_id ?? null,
            solutionAppliedDesc || null,
            solutionAppliedDesc || null,
            null,
            'closed',
            req.user.id,
            body.assigned_to ?? null,
            body.notes?.trim() || null
        ]);
        // Kick off async AI generation (senza bloccare la risposta)
        (0, aiService_1.generateAiSolution)({
            machine: `${machineRecord.name}`,
            line: machineRecord.line ?? 'N/A',
            problem: problemName,
            cause: causeName,
            sparePart: sparePartName,
            description: combinedDescription,
            notes: body.notes?.trim() || undefined
        })
            .then(async (ai_solution) => {
            await db_1.pool.query('UPDATE cases SET ai_solution = $1, updated_at = now() WHERE id = $2', [ai_solution, r.rows[0].id]);
            (0, socketService_1.emitEvent)('case-updated', { caseId: r.rows[0].id });
        })
            .catch((err) => {
            // non blocchiamo l'utente: log/gestione errori in background
            // eslint-disable-next-line no-console
            console.error('AI generation failed', err);
        });
        await db_1.pool.query(`INSERT INTO case_events(case_id,event_type,message,actor_id)
       VALUES($1,'system','case created',$2)`, [r.rows[0].id, req.user.id]);
        (0, socketService_1.emitEvent)('case_created', { caseId: r.rows[0].id });
        (0, socketService_1.emitEvent)('case-updated', { caseId: r.rows[0].id });
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
        const missing = [];
        if (!body.machine_id)
            missing.push('macchina');
        if (!body.problem_id)
            missing.push('problema');
        if (!body.cause_id)
            missing.push('causa');
        if (!body.spare_part_id)
            missing.push('pezzo di ricambio');
        if (!body.solution_applied_id)
            missing.push('soluzione applicata');
        if (missing.length) {
            return res.status(400).json({ error: `Campo obbligatorio mancante: ${missing[0]}` });
        }
        if (body.notes && body.notes.length > 1000) {
            return res.status(400).json({ error: 'Le note non possono superare i 1000 caratteri.' });
        }
        let solutionAppliedDesc = '';
        const saR = await db_1.pool.query('SELECT name, description FROM solutions_applied WHERE id = $1', [body.solution_applied_id]);
        solutionAppliedDesc = saR.rows[0]?.description ?? saR.rows[0]?.name ?? '';
        const r = await db_1.pool.query(`UPDATE cases
       SET machine_id = $1, problem_id = $2, cause_id = $3, spare_part_id = $4, solution_applied_id = $5,
           description = $6, solution = $7, notes = $8, updated_at = now()
       WHERE id = $9
       RETURNING *`, [
            body.machine_id,
            body.problem_id ?? null,
            body.cause_id ?? null,
            body.spare_part_id ?? null,
            body.solution_applied_id ?? null,
            solutionAppliedDesc || null,
            solutionAppliedDesc || null,
            body.notes?.trim() || null,
            req.params.id
        ]);
        await db_1.pool.query(`INSERT INTO case_events(case_id,event_type,message,actor_id)
       VALUES($1,'update','case updated',$2)`, [req.params.id, req.user.id]);
        (0, socketService_1.emitEvent)('case-updated', { caseId: req.params.id });
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
