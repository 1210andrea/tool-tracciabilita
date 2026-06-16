import { pool as db } from '../db';

export const getHistoricalDataForMachine = async (machineId: string, problemId?: string) => {
  const machine = await db.query('SELECT line, name FROM machines WHERE id = $1', [machineId]);
  const line = machine.rows[0]?.line;

  // Query per i casi della macchina (usa solution e status)
  const machineCases = await db.query(`
    SELECT 
      c.solution,
      c.notes,
      c.status,
      oper.nome as operator_name,
      array_agg(DISTINCT sp.name) as spare_parts
    FROM cases c
    LEFT JOIN case_spare_parts csp ON c.id = csp.case_id
    LEFT JOIN spare_parts sp ON csp.spare_part_id = sp.id
    LEFT JOIN operatori oper ON oper.id = c.operatore_id
    WHERE c.machine_id = $1
    ${problemId ? 'AND c.problem_id = $2' : ''}
    GROUP BY c.id, c.solution, c.notes, c.status, oper.nome
  `, problemId ? [machineId, problemId] : [machineId]);

  let lineCases = null;
  if (machineCases.rows.length === 0 && line) {
    const lineMachines = await db.query('SELECT id FROM machines WHERE line = $1 AND id != $2', [line, machineId]);
    const lineMachineIds = lineMachines.rows.map(r => r.id);
    if (lineMachineIds.length > 0) {
      lineCases = await db.query(`
        SELECT 
          c.solution,
          c.notes,
          c.status,
          oper.nome as operator_name,
          array_agg(DISTINCT sp.name) as spare_parts
        FROM cases c
        LEFT JOIN case_spare_parts csp ON c.id = csp.case_id
        LEFT JOIN spare_parts sp ON csp.spare_part_id = sp.id
        LEFT JOIN operatori oper ON oper.id = c.operatore_id
        WHERE c.machine_id = ANY($1)
        ${problemId ? 'AND c.problem_id = $2' : ''}
        GROUP BY c.id, c.solution, c.notes, c.status, oper.nome
      `, problemId ? [lineMachineIds, problemId] : [lineMachineIds]);
    }
  }

  const structureData = (rows: any[]) => {
    const successMap = new Map<string, { count: number; operator: string }>();
    const failedMap = new Map<string, number>();
    const partsMap = new Map<string, number>();
    const notesList: string[] = [];

    rows.forEach(row => {
      const solutionName = row.solution;
      if (!solutionName) return;

      // 'closed' = risolto, altri status = fallito
      const resolved = row.status === 'closed';
      const operator = row.operator_name || 'N.D.';

      if (resolved) {
        const existing = successMap.get(solutionName) || { count: 0, operator: 'N.D.' };
        existing.count++;
        if (operator !== 'N.D.' && existing.operator === 'N.D.') {
          existing.operator = operator;
        }
        successMap.set(solutionName, existing);
      } else {
        failedMap.set(solutionName, (failedMap.get(solutionName) || 0) + 1);
      }

      if (row.spare_parts) {
        row.spare_parts.forEach((part: string) => {
          if (part && part !== 'N.D.') {
            partsMap.set(part, (partsMap.get(part) || 0) + 1);
          }
        });
      }

      if (row.notes && row.notes.trim()) {
        notesList.push(row.notes.trim());
      }
    });

    return {
      solutionsSuccess: Array.from(successMap.entries()).map(([name, data]) => {
        const op = data.operator && data.operator !== 'N.D.' ? ` - operatore ${data.operator}` : '';
        return `${name} (${data.count}x)${op}`;
      }),
      solutionsFailed: Array.from(failedMap.entries()).map(([name, count]) => `${name} (${count}x)`),
      spareParts: Array.from(partsMap.entries()).map(([name, count]) => `${name} (${count}x)`),
      notes: notesList,
    };
  };

  return {
    machine: structureData(machineCases.rows),
    line: lineCases ? structureData(lineCases.rows) : null,
  };
};