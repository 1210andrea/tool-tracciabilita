import { pool as db } from '../db';

export const getHistoricalDataForMachine = async (machineId: string, problemId?: string) => {
  // 1. Recupera la macchina per ottenere la linea
  const machine = await db.query('SELECT line, name FROM machines WHERE id = $1', [machineId]);
  const line = machine.rows[0]?.line;

  // 2. Recupera i casi per questa macchina
  //    Se problemId è presente, filtra per quel problema
  //    Se non c'è problemId, prende tutti i casi della macchina
  const machineCases = await db.query(`
    SELECT 
      c.solution_applied,
      c.notes,
      c.resolved,
      array_agg(DISTINCT sp.name) as spare_parts
    FROM cases c
    LEFT JOIN case_spare_parts csp ON c.id = csp.case_id
    LEFT JOIN spare_parts sp ON csp.spare_part_id = sp.id
    WHERE c.machine_id = $1
    ${problemId ? 'AND c.problem_id = $2' : ''}
    GROUP BY c.id
  `, problemId ? [machineId, problemId] : [machineId]);

  // 3. Se non ci sono casi per la macchina, cerca sulla linea
  let lineCases = null;
  if (machineCases.rows.length === 0 && line) {
    const lineMachines = await db.query('SELECT id FROM machines WHERE line = $1 AND id != $2', [line, machineId]);
    const lineMachineIds = lineMachines.rows.map(r => r.id);
    if (lineMachineIds.length > 0) {
      lineCases = await db.query(`
        SELECT 
          c.solution_applied,
          c.notes,
          c.resolved,
          array_agg(DISTINCT sp.name) as spare_parts
        FROM cases c
        LEFT JOIN case_spare_parts csp ON c.id = csp.case_id
        LEFT JOIN spare_parts sp ON csp.spare_part_id = sp.id
        WHERE c.machine_id = ANY($1)
        ${problemId ? 'AND c.problem_id = $2' : ''}
        GROUP BY c.id
      `, problemId ? [lineMachineIds, problemId] : [lineMachineIds]);
    }
  }

  // 4. Struttura i dati
  const structureData = (rows: any[]) => ({
    solutionsSuccess: rows.filter(r => r.resolved).map(r => r.solution_applied).filter(Boolean),
    solutionsFailed: rows.filter(r => !r.resolved).map(r => r.solution_applied).filter(Boolean),
    spareParts: rows.flatMap(r => r.spare_parts || []).filter(Boolean),
    notes: rows.map(r => r.notes).filter(Boolean),
  });

  return {
    machine: structureData(machineCases.rows),
    line: lineCases ? structureData(lineCases.rows) : null,
  };
};
