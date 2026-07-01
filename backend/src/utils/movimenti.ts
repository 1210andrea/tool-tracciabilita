import { pool } from '../db';

export async function getMovimentiTableName(): Promise<'spare_parts_movimenti' | 'movimenti_magazzino'> {
  const r = await pool.query(
    `SELECT to_regclass('public.spare_parts_movimenti') AS spare,
            to_regclass('public.movimenti_magazzino') AS legacy`
  );
  const row = r.rows[0];
  if (row?.spare) return 'spare_parts_movimenti';
  if (row?.legacy) return 'movimenti_magazzino';
  throw new Error('Nessuna tabella movimenti disponibile nel database');
}
