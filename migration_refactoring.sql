-- Rinomina la colonna posizione in tipologia se esiste posizione/position e non esiste tipologia
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='machines' AND column_name='posizione'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='machines' AND column_name='tipologia'
  ) THEN
    ALTER TABLE machines RENAME COLUMN posizione TO tipologia;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='machines' AND column_name='position'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='machines' AND column_name='tipologia'
  ) THEN
    ALTER TABLE machines RENAME COLUMN position TO tipologia;
  END IF;
END $$;

-- Assicuriamoci che la tabella spare_part_tipologie esista
CREATE TABLE IF NOT EXISTS spare_part_tipologie (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  spare_part_id uuid NOT NULL REFERENCES spare_parts(id) ON DELETE CASCADE,
  tipologia VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(spare_part_id, tipologia)
);

CREATE INDEX IF NOT EXISTS idx_spare_part_tipologie_tipologia ON spare_part_tipologie(tipologia);
CREATE INDEX IF NOT EXISTS idx_spare_part_tipologie_spare_part ON spare_part_tipologie(spare_part_id);

-- Migra i vecchi tipi di ricambi in spare_part_tipologie
DO $$
BEGIN
  -- Se la colonna 'type' esiste in 'spare_parts', migriamo da lì
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='spare_parts' AND column_name='type'
  ) THEN
    INSERT INTO spare_part_tipologie (spare_part_id, tipologia)
    SELECT id, type
    FROM spare_parts
    WHERE type IS NOT NULL AND type <> ''
    ON CONFLICT (spare_part_id, tipologia) DO NOTHING;
  END IF;

  -- Se la vecchia tabella spare_part_types esiste, migriamo anche da lì
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name='spare_part_types'
  ) THEN
    INSERT INTO spare_part_tipologie (spare_part_id, tipologia)
    SELECT spare_part_id, type
    FROM spare_part_types
    ON CONFLICT (spare_part_id, tipologia) DO NOTHING;
  END IF;
END $$;

-- Ora che i dati sono stati migrati in spare_part_tipologie, rimuoviamo la vecchia colonna type da spare_parts
ALTER TABLE spare_parts DROP COLUMN IF EXISTS type;

-- Aggiungi la colonna notes alla tabella casi
ALTER TABLE cases ADD COLUMN IF NOT EXISTS notes VARCHAR(1000);

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

