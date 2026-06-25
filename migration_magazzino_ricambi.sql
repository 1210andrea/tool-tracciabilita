-- ============================================================
-- MIGRATION: magazzino ricambi
-- Eseguire DOPO migration_soluzioni_causa.sql
-- NON eseguire in fase di sviluppo: solo su deploy
-- ============================================================

-- 1. Estendi spare_parts con i campi magazzino
ALTER TABLE spare_parts
  ADD COLUMN IF NOT EXISTS codice          VARCHAR(100) UNIQUE,
  ADD COLUMN IF NOT EXISTS tipologia       VARCHAR(100),
  ADD COLUMN IF NOT EXISTS quantita        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scorta_minima   INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS quantita_riordino INTEGER NOT NULL DEFAULT 10;

-- Alias colonna per compatibilità con codice esistente che usa qty_riordino
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='spare_parts' AND column_name='qty_riordino'
  ) THEN
    ALTER TABLE spare_parts ADD COLUMN qty_riordino INTEGER NOT NULL DEFAULT 10;
  END IF;
END $$;

-- 2. Ordine interno (1 ordine = 1 articolo, niente tabella items separata)
CREATE TABLE IF NOT EXISTS reorders (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero_ordine     SERIAL      UNIQUE,
  spare_part_id     UUID        NOT NULL REFERENCES spare_parts(id) ON DELETE RESTRICT,
  quantita_ordinata INTEGER     NOT NULL,
  quantita_ricevuta INTEGER     NOT NULL DEFAULT 0,
  status            TEXT        NOT NULL DEFAULT 'in_lavorazione'
                    CHECK (status IN ('in_lavorazione','partial','completed','cancelled')),
  note              TEXT,
  created_by        UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reorders_spare_part ON reorders(spare_part_id);
CREATE INDEX IF NOT EXISTS idx_reorders_status     ON reorders(status);

-- 3. Storico movimenti giacenza
CREATE TABLE IF NOT EXISTS spare_parts_movimenti (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  spare_part_id    UUID        NOT NULL REFERENCES spare_parts(id) ON DELETE CASCADE,
  tipo             TEXT        NOT NULL
                   CHECK (tipo IN ('scarico_manutenzione','versamento_riordine','rettifica_manuale')),
  delta            INTEGER     NOT NULL,
  quantita_dopo    INTEGER     NOT NULL,
  riferimento_id   UUID,
  riferimento_tipo TEXT,
  note             TEXT,
  actor_id         UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_movimenti_spare_part  ON spare_parts_movimenti(spare_part_id);
CREATE INDEX IF NOT EXISTS idx_movimenti_tipo        ON spare_parts_movimenti(tipo);
CREATE INDEX IF NOT EXISTS idx_movimenti_created_at  ON spare_parts_movimenti(created_at);
