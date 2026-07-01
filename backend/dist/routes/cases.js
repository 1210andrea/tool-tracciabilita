"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.casesRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const db_1 = require("../db");
const socketService_1 = require("../services/socketService");
const movimenti_1 = require("../utils/movimenti");
exports.casesRoutes = (0, express_1.Router)();
const CASE_QUERY = `
  SELECT
    c.*, c.case_number,
    m.code AS machine_code,
    m.name AS machine_name,
    m.line AS machine_line,
    m.type AS machine_type,
    p.name AS problem_name,
    ca.name AS cause_name,
    (
      SELECT string_agg(sp.name, ', ')
      FROM case_spare_parts csp
      JOIN spare_parts sp ON sp.id = csp.spare_part_id
      WHERE csp.case_id = c.id
    ) AS spare_part_name,
    (
      SELECT array_agg(csp.spare_part_id::text)
      FROM case_spare_parts csp
      WHERE csp.case_id = c.id
    ) AS pezzi_ricambio,
    (
      SELECT array_agg(cst.solution_id::text)
      FROM case_solutions_tried cst
      WHERE cst.case_id = c.id
    ) AS soluzioni_provate,
    (
      SELECT array_agg(csa.solution_id::text)
      FROM case_solutions_applied csa
      WHERE csa.case_id = c.id
    ) AS soluzioni_applicate,
    (
      SELECT json_agg(json_build_object('id', op.id, 'name', op.name) ORDER BY op.name)
      FROM case_operatori co
      JOIN operatori op ON op.id = co.operatore_id
      WHERE co.case_id = c.id
    ) AS operatori_list,
    (
      SELECT array_agg(co.operatore_id::text)
      FROM case_operatori co
      WHERE co.case_id = c.id
    ) AS operatori_ids,
    (
      SELECT string_agg(sp.name || ' (' || COALESCE(sp.codice, sp.id::text) || ')', ', ')
      FROM case_spare_parts csp
      JOIN spare_parts sp ON sp.id = csp.spare_part_id
      WHERE csp.case_id = c.id
    ) AS pezzi_ricambio_names,
    u.username AS created_by_username,
    op2.name AS operatore_name
  FROM cases c
  LEFT JOIN machines m ON m.id = c.machine_id
  LEFT JOIN problems p ON p.id = c.problem_id
  LEFT JOIN causes ca ON ca.id = c.cause_id
  LEFT JOIN users u ON u.id = c.created_by
  LEFT JOIN operatori op2 ON op2.id = c.operatore_id`;
async function getCaseRow(id) {
    const r = await db_1.pool.query(`${CASE_QUERY} WHERE c.id = $1`, [id]);
    return r.rows[0];
}
async function validateOperatoreId(client, opId) {
    if (!opId)
        return 'ID operatore non valido';
    const r = await client.query('SELECT id FROM operatori WHERE id = $1', [opId]);
    if (!r.rows[0])
        return `Operatore ${opId} non trovato`;
    return null;
}
async function syncCaseOperatori(client, caseId, operatoreIds) {
    await client.query('DELETE FROM case_operatori WHERE case_id = $1', [caseId]);
    for (const opId of operatoreIds) {
        if (opId)
            await client.query('INSERT INTO case_operatori(case_id, operatore_id) VALUES($1, $2) ON CONFLICT DO NOTHING', [caseId, opId]);
    }
}
// ─── GET list ────────────────────────────────────────────────────────────────
exports.casesRoutes.get('/', auth_1.authMiddleware, async (req, res, next) => {
    try {
        const { machine_id, status, search, page = 1, limit = 20, from, to, problem_id, cause_id, sort = 'desc' } = req.query;
        const conditions = [];
        const params = [];
        let idx = 1;
        if (machine_id) {
            conditions.push(`c.machine_id = $${idx++}`);
            params.push(machine_id);
        }
        if (status) {
            conditions.push(`c.status = $${idx++}`);
            params.push(status);
        }
        if (problem_id) {
            conditions.push(`c.problem_id = $${idx++}`);
            params.push(problem_id);
        }
        if (cause_id) {
            conditions.push(`c.cause_id = $${idx++}`);
            params.push(cause_id);
        }
        if (from) {
            conditions.push(`c.created_at >= $${idx++}`);
            params.push(from);
        }
        if (to) {
            conditions.push(`c.created_at <= $${idx++}`);
            params.push(to + 'T23:59:59Z');
        }
        if (search) {
            conditions.push(`(
        m.name ILIKE $${idx} OR m.code ILIKE $${idx} OR
        p.name ILIKE $${idx} OR
        c.description ILIKE $${idx} OR
        c.solution ILIKE $${idx} OR
        c.notes ILIKE $${idx}
      )`);
            params.push(`%${search}%`);
            idx++;
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const sortDir = sort === 'asc' ? 'ASC' : 'DESC';
        const offset = (Number(page) - 1) * Number(limit);
        const countRes = await db_1.pool.query(`SELECT COUNT(*) FROM cases c LEFT JOIN machines m ON m.id = c.machine_id LEFT JOIN problems p ON p.id = c.problem_id LEFT JOIN causes ca ON ca.id = c.cause_id ${where}`, params);
        const total = Number(countRes.rows[0].count);
        const r = await db_1.pool.query(`${CASE_QUERY} ${where} ORDER BY c.created_at ${sortDir} LIMIT $${idx++} OFFSET $${idx++}`, [...params, Number(limit), offset]);
        res.json({ items: r.rows, total, page: Number(page), limit: Number(limit) });
    }
    catch (e) {
        next(e);
    }
});
// ─── GET single ──────────────────────────────────────────────────────────────
exports.casesRoutes.get('/:id', auth_1.authMiddleware, async (req, res, next) => {
    try {
        const row = await getCaseRow(req.params.id);
        if (!row)
            return res.status(404).json({ error: 'Case not found' });
        res.json({ item: row });
    }
    catch (e) {
        next(e);
    }
});
// ─── GET events ──────────────────────────────────────────────────────────────
exports.casesRoutes.get('/:id/events', auth_1.authMiddleware, async (req, res, next) => {
    try {
        const r = await db_1.pool.query(`SELECT ce.*, u.username AS actor_username
       FROM case_events ce LEFT JOIN users u ON u.id = ce.actor_id
       WHERE ce.case_id = $1 ORDER BY ce.created_at ASC`, [req.params.id]);
        res.json({ items: r.rows });
    }
    catch (e) {
        next(e);
    }
});
// ─── GET export CSV ──────────────────────────────────────────────────────────
exports.casesRoutes.get('/export/csv', auth_1.authMiddleware, async (req, res, next) => {
    try {
        if (req.user.role !== 'admin')
            return res.status(403).json({ error: 'Solo gli admin possono esportare' });
        const { from, to, machine_id } = req.query;
        const conditions = [];
        const params = [];
        let idx = 1;
        if (from) {
            conditions.push(`c.created_at >= $${idx++}`);
            params.push(from);
        }
        if (to) {
            conditions.push(`c.created_at <= $${idx++}`);
            params.push(to + 'T23:59:59Z');
        }
        if (machine_id) {
            conditions.push(`c.machine_id = $${idx++}`);
            params.push(machine_id);
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const r = await db_1.pool.query(`SELECT c.created_at, m.code AS machine_code, m.name AS machine_name, m.line, p.name AS problem, ca.name AS cause,
              c.description, c.solution, c.notes, c.tempo_impiego, u.username AS created_by,
              (
                SELECT string_agg(sp.name, ', ')
                FROM case_spare_parts csp JOIN spare_parts sp ON sp.id = csp.spare_part_id
                WHERE csp.case_id = c.id
              ) AS pezzi_ricambio,
              (
                SELECT string_agg(sa.name, ', ')
                FROM case_solutions_applied csa JOIN solutions_applied sa ON sa.id = csa.solution_id
                WHERE csa.case_id = c.id
              ) AS soluzioni_applicate,
              (
                SELECT string_agg(op.name, ', ')
                FROM case_operatori co JOIN operatori op ON op.id = co.operatore_id
                WHERE co.case_id = c.id
              ) AS operatori
       FROM cases c
       LEFT JOIN machines m ON m.id = c.machine_id
       LEFT JOIN problems p ON p.id = c.problem_id
       LEFT JOIN causes ca ON ca.id = c.cause_id
       LEFT JOIN users u ON u.id = c.created_by
       ${where}
       ORDER BY c.created_at DESC`, params);
        const headers = ['Data', 'Codice macchina', 'Macchina', 'Linea', 'Problema', 'Causa', 'Descrizione', 'Soluzione', 'Note', 'Tempo impiego (min)', 'Creato da', 'Pezzi ricambio', 'Soluzioni applicate', 'Operatori'];
        const rows = r.rows.map((row) => [
            new Date(row.created_at).toLocaleString('it-IT'),
            row.machine_code ?? '',
            row.machine_name ?? '',
            row.line ?? '',
            row.problem ?? '',
            row.cause ?? '',
            row.description ?? '',
            row.solution ?? '',
            row.notes ?? '',
            row.tempo_impiego ?? '',
            row.created_by ?? '',
            row.pezzi_ricambio ?? '',
            row.soluzioni_applicate ?? '',
            row.operatori ?? '',
        ]);
        const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="casi_${new Date().toISOString().slice(0, 10)}.csv"`);
        res.send('\uFEFF' + csv);
    }
    catch (e) {
        next(e);
    }
});
// ─── POST create ─────────────────────────────────────────────────────────────
exports.casesRoutes.post('/', auth_1.authMiddleware, async (req, res, next) => {
    try {
        const body = req.body;
        // Risolvi machine_id
        let finalMachineId = body.machine_id;
        if (!finalMachineId && body.machine_code) {
            const mr = await db_1.pool.query('SELECT id FROM machines WHERE code = $1', [body.machine_code]);
            if (!mr.rows[0])
                return res.status(400).json({ error: `Macchina con codice ${body.machine_code} non trovata` });
            finalMachineId = mr.rows[0].id;
        }
        if (!finalMachineId)
            return res.status(400).json({ error: 'machine_id o machine_code obbligatorio' });
        const finalUtenteId = req.user.id;
        // Operatori
        let operatoreIds = [];
        if (Array.isArray(body.operatori_ids) && body.operatori_ids.length > 0) {
            operatoreIds = body.operatori_ids.filter(Boolean);
        }
        else if (body.operatore_id) {
            operatoreIds = [body.operatore_id];
        }
        // Note max 1000 chars
        const finalNotes = body.notes ?? null;
        if (finalNotes && finalNotes.length > 1000) {
            return res.status(400).json({ error: 'Le note non possono superare i 1000 caratteri.' });
        }
        const client = await db_1.pool.connect();
        try {
            await client.query('BEGIN');
            const machineQuery = await client.query('SELECT code, name, line, type FROM machines WHERE id = $1', [finalMachineId]);
            if (!machineQuery.rows[0]) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Macchina non trovata' });
            }
            // Valida tutti gli operatori
            for (const opId of operatoreIds) {
                const err = await validateOperatoreId(client, opId);
                if (err) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ error: err });
                }
            }
            let solutionAppliedDesc = '';
            if (body.soluzioni_applicate?.length) {
                const saR = await client.query(`SELECT name, description FROM solutions_applied WHERE id = ANY($1::uuid[])`, [body.soluzioni_applicate]);
                solutionAppliedDesc = saR.rows.map((row) => row.description ?? row.name).filter(Boolean).join(', ');
            }
            // Il primo operatore va anche in operatore_id per compatibilità legacy
            const primaryOperatoreId = operatoreIds[0] ?? null;
            const r = await client.query(`INSERT INTO cases(machine_id, problem_id, cause_id, description, solution, ai_solution,
                          status, created_by, assigned_to, notes, tempo_impiego, operatore_id)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`, [
                finalMachineId, body.problem_id ?? null, body.cause_id ?? null,
                solutionAppliedDesc || null, solutionAppliedDesc || null, null,
                'closed', finalUtenteId, null,
                finalNotes?.trim() || null, body.tempo_impiego, primaryOperatoreId
            ]);
            const caseId = r.rows[0].id;
            // Inserisci tutti gli operatori nella tabella ponte
            await syncCaseOperatori(client, caseId, operatoreIds);
            if (body.soluzioni_provate?.length) {
                for (const solId of body.soluzioni_provate) {
                    if (solId)
                        await client.query(`INSERT INTO case_solutions_tried(case_id, solution_id) VALUES($1, $2) ON CONFLICT DO NOTHING`, [caseId, solId]);
                }
            }
            if (body.soluzioni_applicate?.length) {
                for (const solId of body.soluzioni_applicate) {
                    if (solId)
                        await client.query(`INSERT INTO case_solutions_applied(case_id, solution_id) VALUES($1, $2) ON CONFLICT DO NOTHING`, [caseId, solId]);
                }
            }
            if (body.pezzi_ricambio?.length) {
                for (const spId of body.pezzi_ricambio) {
                    if (spId) {
                        await client.query(`INSERT INTO case_spare_parts(case_id, spare_part_id) VALUES($1, $2) ON CONFLICT DO NOTHING`, [caseId, spId]);
                        // Scarica la giacenza e registra il movimento
                        const spRow = await client.query(`UPDATE spare_parts
               SET quantita = quantita - 1,
                   sotto_scorta = (quantita - 1) <= scorta_minima,
                   giacenza_negativa = (quantita - 1) < 0
               WHERE id = $1
               RETURNING quantita`, [spId]);
                        const nuovaQty = spRow.rows[0]?.quantita ?? 0;
                        const caseNum = r.rows[0].case_number ?? r.rows[0].id;
                        const movementsTable = await (0, movimenti_1.getMovimentiTableName)();
                        const useLegacyMovements = movementsTable === 'movimenti_magazzino';
                        const insertSql = useLegacyMovements
                            ? `INSERT INTO ${movementsTable}(spare_part_id, tipo, delta, quantita_dopo,
                  riferimento_tipo, riferimento_numero, riferimento_id, actor_id)
                 VALUES($1, 'scarico_manutenzione', -1, $2, 'case', $3::text, $4, $5)`
                            : `INSERT INTO ${movementsTable}(spare_part_id, tipo, delta, quantita_dopo,
                  riferimento_tipo, riferimento_id, actor_id)
                 VALUES($1, 'scarico_manutenzione', -1, $2, 'case', $3, $4, $5)`;
                        const insertParams = useLegacyMovements
                            ? [spId, nuovaQty, caseNum, caseId, finalUtenteId]
                            : [spId, nuovaQty, caseId, finalUtenteId];
                        await client.query(insertSql, insertParams);
                    }
                }
            }
            await client.query(`INSERT INTO case_events(case_id,event_type,message,actor_id) VALUES($1,'system','case created',$2)`, [caseId, finalUtenteId]);
            await client.query('COMMIT');
            (0, socketService_1.emitEvent)('case_created', { caseId });
            (0, socketService_1.emitEvent)('case-updated', { caseId });
            res.json({ success: true, case_id: caseId, message: 'Caso creato con successo', item: r.rows[0] });
        }
        catch (e) {
            await client.query('ROLLBACK');
            throw e;
        }
        finally {
            client.release();
        }
    }
    catch (e) {
        next(e);
    }
});
exports.casesRoutes.put('/:id', auth_1.authMiddleware, async (req, res, next) => {
    try {
        res.status(405).json({ error: 'Usa PATCH per aggiornare un caso' });
    }
    catch (e) {
        next(e);
    }
});
// ─── PATCH update ────────────────────────────────────────────────────────────
exports.casesRoutes.patch('/:id', auth_1.authMiddleware, async (req, res, next) => {
    try {
        const body = req.body;
        const caseRow = await getCaseRow(req.params.id);
        if (!caseRow)
            return res.status(404).json({ error: 'Case not found' });
        const finalNotes = body.notes ?? null;
        if (finalNotes && finalNotes.length > 1000) {
            return res.status(400).json({ error: 'Le note non possono superare i 1000 caratteri.' });
        }
        let operatoreIds = [];
        if (Array.isArray(body.operatori_ids)) {
            operatoreIds = body.operatori_ids.filter(Boolean);
        }
        else if (body.operatore_id) {
            operatoreIds = [body.operatore_id];
        }
        let solutionAppliedDesc = '';
        if (body.soluzioni_applicate?.length) {
            const saR = await db_1.pool.query(`SELECT name, description FROM solutions_applied WHERE id = ANY($1::uuid[])`, [body.soluzioni_applicate]);
            solutionAppliedDesc = saR.rows.map((row) => row.description ?? row.name).filter(Boolean).join(', ');
        }
        const client = await db_1.pool.connect();
        try {
            await client.query('BEGIN');
            // Valida operatori
            for (const opId of operatoreIds) {
                const err = await validateOperatoreId(client, opId);
                if (err) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ error: err });
                }
            }
            const primaryOperatoreId = operatoreIds[0] ?? caseRow.operatore_id ?? null;
            const r = await client.query(`UPDATE cases SET
          machine_id = COALESCE($1, machine_id),
          problem_id = $2,
          cause_id = $3,
          description = COALESCE($4, description),
          solution = COALESCE($5, solution),
          status = COALESCE($6, status),
          notes = $7,
          tempo_impiego = COALESCE($8, tempo_impiego),
          operatore_id = $9,
          updated_at = NOW()
        WHERE id = $10
        RETURNING *`, [
                body.machine_id ?? null,
                body.problem_id ?? null,
                body.cause_id ?? null,
                solutionAppliedDesc || body.description || null,
                solutionAppliedDesc || body.solution || null,
                body.status ?? null,
                finalNotes?.trim() ?? null,
                body.tempo_impiego ?? null,
                primaryOperatoreId,
                req.params.id,
            ]);
            const caseNumber = r.rows[0].case_number ?? req.params.id;
            // Sync operatori
            await syncCaseOperatori(client, req.params.id, operatoreIds);
            // Update solutions tried
            await client.query(`DELETE FROM case_solutions_tried WHERE case_id = $1`, [req.params.id]);
            for (const solId of body.soluzioni_provate ?? []) {
                if (solId)
                    await client.query(`INSERT INTO case_solutions_tried(case_id, solution_id) VALUES($1, $2) ON CONFLICT DO NOTHING`, [req.params.id, solId]);
            }
            // Update solutions applied
            await client.query(`DELETE FROM case_solutions_applied WHERE case_id = $1`, [req.params.id]);
            for (const solId of body.soluzioni_applicate ?? []) {
                if (solId)
                    await client.query(`INSERT INTO case_solutions_applied(case_id, solution_id) VALUES($1, $2) ON CONFLICT DO NOTHING`, [req.params.id, solId]);
            }
            // Update spare parts — scarico/ricarica differenziale
            const prevPartsRes = await client.query(`SELECT spare_part_id::text FROM case_spare_parts WHERE case_id = $1`, [req.params.id]);
            const prevIds = new Set(prevPartsRes.rows.map((r) => r.spare_part_id));
            const nextIds = new Set((body.pezzi_ricambio ?? []).filter(Boolean));
            // Ricambi rimossi → ricarica giacenza
            for (const spId of prevIds) {
                if (!nextIds.has(spId)) {
                    const spRow = await client.query(`UPDATE spare_parts
             SET quantita = quantita + 1,
                 sotto_scorta = (quantita + 1) <= scorta_minima,
                 giacenza_negativa = (quantita + 1) < 0
             WHERE id = $1
             RETURNING quantita`, [spId]);
                    const nuovaQty = spRow.rows[0]?.quantita ?? 0;
                    const movementsTable = await (0, movimenti_1.getMovimentiTableName)();
                    const useLegacyMovements = movementsTable === 'movimenti_magazzino';
                    const insertSql = useLegacyMovements
                        ? `INSERT INTO ${movementsTable}(spare_part_id, tipo, delta, quantita_dopo,
                riferimento_tipo, riferimento_numero, riferimento_id, actor_id)
               VALUES($1, 'rettifica_manuale', 1, $2, 'case', $3::text, $4, $5)`
                        : `INSERT INTO ${movementsTable}(spare_part_id, tipo, delta, quantita_dopo,
                riferimento_tipo, riferimento_id, actor_id)
               VALUES($1, 'rettifica_manuale', 1, $2, 'case', $3, $4, $5)`;
                    const insertParams = useLegacyMovements
                        ? [spId, nuovaQty, caseNumber, req.params.id, req.user.id]
                        : [spId, nuovaQty, req.params.id, req.user.id];
                    await client.query(insertSql, insertParams);
                }
            }
            await client.query(`DELETE FROM case_spare_parts WHERE case_id = $1`, [req.params.id]);
            for (const spId of nextIds) {
                await client.query(`INSERT INTO case_spare_parts(case_id, spare_part_id) VALUES($1, $2) ON CONFLICT DO NOTHING`, [req.params.id, spId]);
                // Scarica solo i ricambi nuovi (non presenti prima)
                if (!prevIds.has(spId)) {
                    const spRow = await client.query(`UPDATE spare_parts
             SET quantita = quantita - 1,
                 sotto_scorta = (quantita - 1) <= scorta_minima,
                 giacenza_negativa = (quantita - 1) < 0
             WHERE id = $1
             RETURNING quantita`, [spId]);
                    const nuovaQty = spRow.rows[0]?.quantita ?? 0;
                    const movementsTable = await (0, movimenti_1.getMovimentiTableName)();
                    const useLegacyMovements = movementsTable === 'movimenti_magazzino';
                    const insertSql = useLegacyMovements
                        ? `INSERT INTO ${movementsTable}(spare_part_id, tipo, delta, quantita_dopo,
                riferimento_tipo, riferimento_numero, riferimento_id, actor_id)
               VALUES($1, 'scarico_manutenzione', -1, $2, 'case', $3::text, $4, $5)`
                        : `INSERT INTO ${movementsTable}(spare_part_id, tipo, delta, quantita_dopo,
                riferimento_tipo, riferimento_id, actor_id)
               VALUES($1, 'scarico_manutenzione', -1, $2, 'case', $3, $4, $5)`;
                    const insertParams = useLegacyMovements
                        ? [spId, nuovaQty, caseNumber, req.params.id, req.user.id]
                        : [spId, nuovaQty, req.params.id, req.user.id];
                    await client.query(insertSql, insertParams);
                }
            }
            await client.query(`INSERT INTO case_events(case_id,event_type,message,actor_id) VALUES($1,'update','case updated',$2)`, [req.params.id, req.user.id]);
            await client.query('COMMIT');
            (0, socketService_1.emitEvent)('case-updated', { caseId: req.params.id });
            res.json({ item: r.rows[0] });
        }
        catch (e) {
            await client.query('ROLLBACK');
            throw e;
        }
        finally {
            client.release();
        }
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
