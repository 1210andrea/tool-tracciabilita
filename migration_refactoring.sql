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
