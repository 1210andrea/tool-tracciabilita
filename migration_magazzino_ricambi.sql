-- ============================================================
-- MIGRATION: Magazzino Ricambi
-- Data: 2026-06-25
-- Descrizione: Aggiunge campi magazzino a spare_parts e crea
--              le tabelle reorders e reorder_items.
--              IDEMPOTENTE: sicura da rieseguire.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Estendi spare_parts con i campi magazzino
--    NOTA: il campo si chiama qty_riordino (coerente con backend/frontend)
-- ------------------------------------------------------------
ALTER TABLE spare_parts
  ADD COLUMN IF NOT EXISTS codice        VARCHAR(100) UNIQUE,
  ADD COLUMN IF NOT EXISTS quantita      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scorta_minima INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS qty_riordino  INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ NOT NULL DEFAULT now();

-- Rinomina il vecchio campo se esiste (da una migration precedente errata)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='spare_parts' AND column_name='quantita_riordino'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='spare_parts' AND column_name='qty_riordino'
  ) THEN
    ALTER TABLE spare_parts RENAME COLUMN quantita_riordino TO qty_riordino;
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- 2. Crea tabella reorders (testata ordine di riapprovvigionamento)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reorders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_ordine SERIAL UNIQUE,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'partial', 'completed', 'cancelled')),
  note          TEXT,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 3. Crea tabella reorder_items (righe ordine, collegate a spare_parts)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reorder_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reorder_id        UUID NOT NULL REFERENCES reorders(id) ON DELETE CASCADE,
  spare_part_id     UUID NOT NULL REFERENCES spare_parts(id) ON DELETE RESTRICT,
  quantita_ordinata INTEGER NOT NULL CHECK (quantita_ordinata > 0),
  quantita_ricevuta INTEGER NOT NULL DEFAULT 0 CHECK (quantita_ricevuta >= 0),
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'partial', 'completed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reorder_items_reorder    ON reorder_items(reorder_id);
CREATE INDEX IF NOT EXISTS idx_reorder_items_spare_part ON reorder_items(spare_part_id);

-- ------------------------------------------------------------
-- 4. Funzione set_updated_at (trigger automatico updated_at)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reorders_updated_at      ON reorders;
DROP TRIGGER IF EXISTS trg_reorder_items_updated_at ON reorder_items;
DROP TRIGGER IF EXISTS trg_spare_parts_updated_at   ON spare_parts;

CREATE TRIGGER trg_reorders_updated_at
  BEFORE UPDATE ON reorders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_reorder_items_updated_at
  BEFORE UPDATE ON reorder_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_spare_parts_updated_at
  BEFORE UPDATE ON spare_parts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- 5. Funzione refresh_reorder_status
--    Aggiorna lo status della testata reorders in base alle righe.
--    Chiamata dal backend dopo ogni aggiornamento di quantita_ricevuta.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_reorder_status(p_reorder_id UUID)
RETURNS VOID AS $$
DECLARE
  v_total     INTEGER;
  v_completed INTEGER;
  v_partial   INTEGER;
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
  WHERE id = p_reorder_id
    AND status NOT IN ('cancelled');  -- non sovrascrivere se annullato
END;
$$ LANGUAGE plpgsql;

COMMIT;
