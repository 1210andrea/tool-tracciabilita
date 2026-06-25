-- ============================================================
-- MIGRATION: Gestione Magazzino Ricambi
-- Esegui questo file una sola volta sull'ambiente di produzione
-- dopo aver applicato le migration precedenti.
-- ============================================================

-- 1. Estendi spare_parts con i campi magazzino
--    (se i campi esistono già la migration è idempotente)
ALTER TABLE spare_parts
  ADD COLUMN IF NOT EXISTS codice        VARCHAR(100),
  ADD COLUMN IF NOT EXISTS quantita      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scorta_minima INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS qty_riordino  INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ NOT NULL DEFAULT now();

-- Indice su codice per ricerche veloci
CREATE UNIQUE INDEX IF NOT EXISTS uq_spare_parts_codice
  ON spare_parts(codice) WHERE codice IS NOT NULL;

-- 2. Tabella testata ordini di riordino
CREATE TABLE IF NOT EXISTS reorders (
  id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero_ordine  SERIAL       UNIQUE,
  status         TEXT         NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','partial','completed','cancelled')),
  note           TEXT,
  created_by     UUID         REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reorders_status ON reorders(status);
CREATE INDEX IF NOT EXISTS idx_reorders_created_at ON reorders(created_at DESC);

-- 3. Tabella righe ordine (separata ma collegata via FK)
CREATE TABLE IF NOT EXISTS reorder_items (
  id                 UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  reorder_id         UUID        NOT NULL REFERENCES reorders(id) ON DELETE CASCADE,
  spare_part_id      UUID        NOT NULL REFERENCES spare_parts(id) ON DELETE RESTRICT,
  quantita_ordinata  INTEGER     NOT NULL CHECK (quantita_ordinata > 0),
  quantita_ricevuta  INTEGER     NOT NULL DEFAULT 0 CHECK (quantita_ricevuta >= 0),
  status             TEXT        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending','partial','completed')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reorder_items_reorder    ON reorder_items(reorder_id);
CREATE INDEX IF NOT EXISTS idx_reorder_items_spare_part ON reorder_items(spare_part_id);

-- 4. Funzione helper: ricalcola lo status della testata ordine
--    Chiamata dal backend dopo ogni aggiornamento riga.
CREATE OR REPLACE FUNCTION refresh_reorder_status(p_reorder_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_total     INT;
  v_completed INT;
  v_partial   INT;
  v_new_status TEXT;
BEGIN
  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE status = 'completed')::int,
    COUNT(*) FILTER (WHERE quantita_ricevuta > 0 AND status != 'completed')::int
  INTO v_total, v_completed, v_partial
  FROM reorder_items
  WHERE reorder_id = p_reorder_id;

  IF v_total = 0 THEN
    v_new_status := 'pending';
  ELSIF v_completed = v_total THEN
    v_new_status := 'completed';
  ELSIF v_completed > 0 OR v_partial > 0 THEN
    v_new_status := 'partial';
  ELSE
    v_new_status := 'pending';
  END IF;

  UPDATE reorders
  SET status = v_new_status, updated_at = now()
  WHERE id = p_reorder_id AND status NOT IN ('cancelled');
END;
$$;

-- ============================================================
-- FINE MIGRATION
-- ============================================================
