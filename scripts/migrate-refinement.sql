-- Migrazione idempotente per database esistenti
-- Eseguire: docker exec -i machines_postgres psql -U $DB_USER -d machines_db < scripts/migrate-refinement.sql

CREATE TABLE IF NOT EXISTS operatori (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome VARCHAR(255) NOT NULL UNIQUE,
  attivo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS spare_parts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS spare_part_tipologie (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  spare_part_id uuid NOT NULL REFERENCES spare_parts(id) ON DELETE CASCADE,
  tipologia VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(spare_part_id, tipologia)
);

CREATE TABLE IF NOT EXISTS spare_part_types (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  spare_part_id uuid NOT NULL REFERENCES spare_parts(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(spare_part_id, type)
);

CREATE TABLE IF NOT EXISTS solutions_applied (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE machines ADD COLUMN IF NOT EXISTS tipologia VARCHAR(100);
ALTER TABLE machines ADD COLUMN IF NOT EXISTS type VARCHAR(100);
ALTER TABLE machines ADD COLUMN IF NOT EXISTS posizione VARCHAR(100);

UPDATE machines SET tipologia = COALESCE(NULLIF(tipologia, ''), posizione, type);
UPDATE machines SET tipologia = 'nastro' WHERE tipologia IS NULL AND line = 'Linea 1';
UPDATE machines SET tipologia = 'assemblaggio' WHERE tipologia IS NULL AND code = 'SIMM56';
UPDATE machines SET tipologia = 'controllo' WHERE tipologia IS NULL AND code = 'SIMM78';
UPDATE machines SET tipologia = 'imballaggio' WHERE tipologia IS NULL AND line = 'Linea 3';
UPDATE machines SET tipologia = COALESCE(tipologia, type, 'generico') WHERE tipologia IS NULL;

-- Schema legacy: spare_parts.type -> spare_part_tipologie
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'spare_parts' AND column_name = 'type'
  ) THEN
    INSERT INTO spare_part_tipologie (spare_part_id, tipologia)
    SELECT sp.id, sp.type
    FROM spare_parts sp
    WHERE sp.type IS NOT NULL AND sp.type <> ''
    ON CONFLICT (spare_part_id, tipologia) DO NOTHING;

    ALTER TABLE spare_parts DROP COLUMN type;
  END IF;
END $$;

-- Schema legacy: spare_part_types -> spare_part_tipologie
INSERT INTO spare_part_tipologie (spare_part_id, tipologia)
SELECT spt.spare_part_id, spt.type
FROM spare_part_types spt
ON CONFLICT (spare_part_id, tipologia) DO NOTHING;

-- Migra operatori da categories (type = operator)
INSERT INTO operatori (nome, attivo)
SELECT c.name, true
FROM categories c
WHERE c.type = 'operator'
  AND NOT EXISTS (SELECT 1 FROM operatori o WHERE LOWER(o.nome) = LOWER(c.name));

-- Migra ricambi da categories (type = spare_part)
INSERT INTO spare_parts (name, description)
SELECT DISTINCT c.name, c.description
FROM categories c
WHERE c.type = 'spare_part'
  AND NOT EXISTS (SELECT 1 FROM spare_parts sp WHERE sp.name = c.name);

INSERT INTO spare_part_tipologie (spare_part_id, tipologia)
SELECT sp.id, COALESCE(m.tipologia, m.type, 'generico')
FROM categories c
JOIN spare_parts sp ON sp.name = c.name
CROSS JOIN (SELECT tipologia, type FROM machines WHERE tipologia IS NOT NULL OR type IS NOT NULL LIMIT 1) m
WHERE c.type = 'spare_part'
ON CONFLICT (spare_part_id, tipologia) DO NOTHING;

INSERT INTO spare_part_tipologie (spare_part_id, tipologia)
SELECT sp.id, 'generico'
FROM categories c
JOIN spare_parts sp ON sp.name = c.name
WHERE c.type = 'spare_part'
  AND NOT EXISTS (
    SELECT 1 FROM spare_part_tipologie spt WHERE spt.spare_part_id = sp.id
  )
ON CONFLICT (spare_part_id, tipologia) DO NOTHING;

INSERT INTO solutions_applied (name, description)
SELECT v.name, v.description
FROM (VALUES
  ('Sostituzione componente', 'Rimozione e montaggio del pezzo difettoso'),
  ('Pulizia e lubrificazione', 'Pulizia area interessata e lubrificazione parti mobili'),
  ('Ricalibrazione sensore', 'Riposizionamento e taratura sensore'),
  ('Aggiornamento parametri', 'Modifica parametri macchina da pannello operatore')
) AS v(name, description)
WHERE NOT EXISTS (SELECT 1 FROM solutions_applied sa WHERE sa.name = v.name);

ALTER TABLE cases ADD COLUMN IF NOT EXISTS operatore_id uuid REFERENCES operatori(id) ON DELETE SET NULL;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS solution_applied_id uuid REFERENCES solutions_applied(id) ON DELETE SET NULL;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS spare_part_id uuid;

UPDATE cases c
SET spare_part_id = sp.id
FROM categories cat
JOIN spare_parts sp ON sp.name = cat.name
WHERE c.spare_part_id = cat.id AND cat.type = 'spare_part';

ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_spare_part_id_fkey;

UPDATE cases SET spare_part_id = NULL
WHERE spare_part_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM spare_parts sp WHERE sp.id = cases.spare_part_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cases_spare_part_id_fkey'
  ) THEN
    ALTER TABLE cases
      ADD CONSTRAINT cases_spare_part_id_fkey
      FOREIGN KEY (spare_part_id) REFERENCES spare_parts(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE cases DROP COLUMN IF EXISTS operator_id;
ALTER TABLE cases DROP COLUMN IF EXISTS title;
ALTER TABLE cases DROP COLUMN IF EXISTS priority;

CREATE INDEX IF NOT EXISTS idx_spare_part_tipologie_tipologia ON spare_part_tipologie(tipologia);
CREATE INDEX IF NOT EXISTS idx_spare_part_tipologie_spare_part ON spare_part_tipologie(spare_part_id);

-- 1. Aggiungere colonna "tempo_impiego" alla tabella "cases" (se non esiste)
ALTER TABLE cases ADD COLUMN IF NOT EXISTS tempo_impiego DECIMAL(5,2) DEFAULT 0.5;

-- 2. Creare tabella junction per soluzioni provate (many-to-many)
CREATE TABLE IF NOT EXISTS case_solutions_tried (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  solution_id uuid NOT NULL REFERENCES solutions_applied(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(case_id, solution_id)
);

-- 3. Creare tabella junction per soluzioni applicate (many-to-many)
CREATE TABLE IF NOT EXISTS case_solutions_applied (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  solution_id uuid NOT NULL REFERENCES solutions_applied(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(case_id, solution_id)
);

-- 4. Creare tabella junction per pezzi di ricambio (many-to-many)
CREATE TABLE IF NOT EXISTS case_spare_parts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  spare_part_id uuid NOT NULL REFERENCES spare_parts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(case_id, spare_part_id)
);

-- 5. Migra i dati esistenti prima di eliminare le colonne
INSERT INTO case_solutions_applied (case_id, solution_id)
SELECT id, solution_applied_id
FROM cases
WHERE solution_applied_id IS NOT NULL
ON CONFLICT (case_id, solution_id) DO NOTHING;

INSERT INTO case_spare_parts (case_id, spare_part_id)
SELECT id, spare_part_id
FROM cases
WHERE spare_part_id IS NOT NULL
ON CONFLICT (case_id, spare_part_id) DO NOTHING;

-- 6. Eliminare colonne obsolete dalla tabella "cases" (se esistono)
ALTER TABLE cases DROP COLUMN IF EXISTS solution_applied_id;
ALTER TABLE cases DROP COLUMN IF EXISTS spare_part_id;

-- 7. Index per performance
CREATE INDEX IF NOT EXISTS idx_case_solutions_tried ON case_solutions_tried(case_id);
CREATE INDEX IF NOT EXISTS idx_case_solutions_applied ON case_solutions_applied(case_id);
CREATE INDEX IF NOT EXISTS idx_case_spare_parts ON case_spare_parts(case_id);
