import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { pool } from '../db';

export const sparePartsMagazzinoRoutes = Router();

// GET /spare-parts/:id/movimenti
sparePartsMagazzinoRoutes.get('/:id/movimenti', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { from, to, tipo, page = 1, limit = 50 } = req.query as Record<string, string>;

    const conditions: string[] = ['m.spare_part_id = $1'];
    const params: any[] = [id];
    let idx = 2;

    if (from) { conditions.push(`m.created_at >= $${idx++}`); params.push(from); }
    if (to) { conditions.push(`m.created_at <= $${idx++}`); params.push(to + 'T23:59:59Z'); }
    if (tipo) { conditions.push(`m.tipo = $${idx++}`); params.push(tipo); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const offset = (Number(page) - 1) * Number(limit);

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM movimenti_magazzino m ${where}`,
      params
    );
    const total = Number(countRes.rows[0].count);

    const r = await pool.query(
      `SELECT
         m.*,
         u.username AS actor_username,
         CASE
           WHEN m.riferimento_tipo = 'reorder'
             THEN m.riferimento_numero::text
           WHEN m.riferimento_tipo = 'case'
             THEN COALESCE(
               m.riferimento_numero,
               -- Difensivo: se case_number non esiste ancora (migration non eseguita),
               -- fallback a LEFT(id::text, 8) per non far crashare la route
               (
                 SELECT
                   CASE
                     WHEN column_name = 'case_number' THEN NULL
                     ELSE NULL
                   END
                 FROM information_schema.columns
                 WHERE table_name = 'cases' AND column_name = 'case_number'
                 LIMIT 1
               ),
               LEFT(m.riferimento_id::text, 8)
             )
           ELSE m.riferimento_numero::text
         END AS riferimento_label
       FROM movimenti_magazzino m
       LEFT JOIN users u ON u.id = m.actor_id
       ${where}
       ORDER BY m.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, Number(limit), offset]
    );

    res.json({ items: r.rows, total, page: Number(page), limit: Number(limit) });
  } catch (e) { next(e); }
});
