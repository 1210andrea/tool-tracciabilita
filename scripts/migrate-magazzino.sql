-- Migration magazzino ricambi
-- Eseguire: docker exec -i machines_postgres psql -U machines_user -d machines_db < scripts/migrate-magazzino.sql

-- 1. Colonne magazzino su spare_parts
ALTER TABLE spare_parts ADD COLUMN IF NOT EXISTS codice VARCHAR(100);
ALTER TABLE spare_parts ADD COLUMN IF NOT EXISTS quantita INTEGER NOT NULL DEFAULT 0;
ALTER TABLE spare_parts ADD COLUMN IF NOT EXISTS scorta_minima INTEGER NOT NULL DEFAULT 0;
ALTER TABLE spare_parts ADD COLUMN IF NOT EXISTS quantita_riordino INTEGER NOT NULL DEFAULT 0;
ALTER TABLE spare_parts ADD COLUMN IF NOT EXISTS sotto_scorta BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE spare_parts ADD COLUMN IF NOT EXISTS giacenza_negativa BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE spare_parts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 2. Aggiorna sotto_scorta e giacenza_negativa sui dati esistenti
UPDATE spare_parts
SET sotto_scorta = (quantita <= scorta_minima),
    giacenza_negativa = (quantita < 0);

-- 3. Tabella movimenti magazzino
CREATE TABLE IF NOT EXISTS movimenti_magazzino (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  spare_part_id uuid NOT NULL REFERENCES spare_parts(id) ON DELETE CASCADE,
  tipo VARCHAR(50) NOT NULL,         -- 'carico', 'scarico_manutenzione', 'rettifica_manuale'
  delta INTEGER NOT NULL,            -- +N o -N
  quantita_dopo INTEGER NOT NULL,    -- giacenza risultante
  riferimento_tipo VARCHAR(50),      -- 'case', 'ordine', 'manuale'
  riferimento_numero TEXT,           -- numero caso / ordine
  riferimento_id uuid,               -- ID caso / ordine
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Tabella operatori (nome -> name per compatibilita' con il resto del codice)
-- La tabella operatori esiste gia' da migrate-refinement.sql ma con colonna 'nome'.
-- Aggiungiamo colonna 'name' come alias se non esiste.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'operatori' AND column_name = 'name'
  ) THEN
    ALTER TABLE operatori ADD COLUMN name VARCHAR(255);
    UPDATE operatori SET name = nome WHERE name IS NULL;
    ALTER TABLE operatori ALTER COLUMN name SET NOT NULL;
  END IF;
END $$;

-- 5. Tabella junction case_operatori (se non esiste)
CREATE TABLE IF NOT EXISTS case_operatori (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  operatore_id uuid NOT NULL REFERENCES operatori(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(case_id, operatore_id)
);

-- Migra operatore_id esistente nella tabella ponte
INSERT INTO case_operatori (case_id, operatore_id)
SELECT id, operatore_id
FROM cases
WHERE operatore_id IS NOT NULL
ON CONFLICT (case_id, operatore_id) DO NOTHING;

-- 6. Index per performance
CREATE INDEX IF NOT EXISTS idx_movimenti_spare_part ON movimenti_magazzino(spare_part_id);
CREATE INDEX IF NOT EXISTS idx_movimenti_created_at ON movimenti_magazzino(created_at);
CREATE INDEX IF NOT EXISTS idx_spare_parts_codice ON spare_parts(codice);
CREATE INDEX IF NOT EXISTS idx_spare_parts_sotto_scorta ON spare_parts(sotto_scorta);
CREATE INDEX IF NOT EXISTS idx_case_operatori_case ON case_operatori(case_id);

SELECT 'Migration magazzino completata' AS status;
