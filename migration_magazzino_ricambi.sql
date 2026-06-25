-- ============================================================
-- MIGRATION: Magazzino Ricambi + Ordini di Riapprovvigionamento
-- Da applicare DOPO migration_soluzioni_causa.sql
-- ============================================================

-- 1. Estendi spare_parts con i campi magazzino
ALTER TABLE spare_parts
  ADD COLUMN IF NOT EXISTS codice        VARCHAR(100),
  ADD COLUMN IF NOT EXISTS quantita      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scorta_minima INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS qty_riordino  INTEGER NOT NULL DEFAULT 10;

-- Indice univoco sul codice (se valorizzato)
CREATE UNIQUE INDEX IF NOT EXISTS idx_spare_parts_codice
  ON spare_parts(codice) WHERE codice IS NOT NULL;

-- 2. Tabella testata ordini di riapprovvigionamento
CREATE TABLE IF NOT EXISTS reorders (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero_ordine  SERIAL UNIQUE,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','partial','completed','cancelled')),
  note           TEXT,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Tabella righe ordine (collegata a spare_parts tramite FK)
CREATE TABLE IF NOT EXISTS reorder_items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reorder_id        UUID NOT NULL REFERENCES reorders(id) ON DELETE CASCADE,
  spare_part_id     UUID NOT NULL REFERENCES spare_parts(id) ON DELETE RESTRICT,
  quantita_ordinata INTEGER NOT NULL CHECK (quantita_ordinata > 0),
  quantita_ricevuta INTEGER NOT NULL DEFAULT 0 CHECK (quantita_ricevuta >= 0),
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','partial','completed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reorder_items_reorder    ON reorder_items(reorder_id);
CREATE INDEX IF NOT EXISTS idx_reorder_items_spare_part ON reorder_items(spare_part_id);

-- 4. Funzione helper: aggiorna lo status dell'ordine testata
--    in base allo stato aggregato delle righe
CREATE OR REPLACE FUNCTION refresh_reorder_status(p_reorder_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_total    INT;
  v_done     INT;
  v_partial  INT;
BEGIN
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE status = 'completed'),
         COUNT(*) FILTER (WHERE quantita_ricevuta > 0 AND status != 'completed')
  INTO v_total, v_done, v_partial
  FROM reorder_items WHERE reorder_id = p_reorder_id;

  UPDATE reorders SET
    status = CASE
      WHEN v_total = 0        THEN 'pending'
      WHEN v_done  = v_total  THEN 'completed'
      WHEN v_done + v_partial > 0 THEN 'partial'
      ELSE 'pending'
    END,
    updated_at = now()
  WHERE id = p_reorder_id;
END;
$$;
