import { pool } from '../db';

export async function resolveOperatorIdForUser(userId: string, explicitOperatorId?: string | null): Promise<string | null> {
  if (explicitOperatorId) return explicitOperatorId;

  const userR = await pool.query(
    'SELECT operator_category_id, username FROM users WHERE id = $1',
    [userId]
  );
  if (!userR.rows.length) return null;

  const row = userR.rows[0];
  if (row.operator_category_id) return row.operator_category_id;

  const matchR = await pool.query(
    `SELECT id FROM categories
     WHERE type = 'operator' AND LOWER(name) = LOWER($1)
     LIMIT 1`,
    [row.username]
  );
  return matchR.rows[0]?.id ?? null;
}
