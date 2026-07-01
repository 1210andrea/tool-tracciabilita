import { pool } from '../db';

export async function getMovimentiTableName(): Promise<'spare_parts_movimenti' | 'movimenti_magazzino'> {
  const r = await pool.query(
    `SELECT to_regclass('public.spare_parts_movimenti') AS spare,
            to_regclass('public.movimenti_magazzino') AS legacy`
  );
  const row = r.rows[0];
  if (row?.spare) return 'spare_parts_movimenti';
  if (row?.legacy) return 'movimenti_magazzino';

  // If no legacy movement table exists, create the new spare_parts_movimenti table automatically.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS spare_parts_movimenti (
      id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
      spare_part_id    UUID        NOT NULL REFERENCES spare_parts(id) ON DELETE CASCADE,
      tipo             TEXT        NOT NULL CHECK (tipo IN ('scarico_manutenzione','versamento_riordine','rettifica_manuale')),
      delta            INTEGER     NOT NULL,
      quantita_dopo    INTEGER     NOT NULL,
      riferimento_id   UUID,
      riferimento_tipo TEXT,
      note             TEXT,
      actor_id         UUID        REFERENCES users(id) ON DELETE SET NULL,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  return 'spare_parts_movimenti';
}
