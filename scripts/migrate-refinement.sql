-- Migrazione per database esistenti: ricambi, soluzioni applicate, rimozione title/operatore
-- Eseguire: docker exec -i machines_postgres psql -U $DB_USER -d machines_db < scripts/migrate-refinement.sql

CREATE TABLE IF NOT EXISTS spare_parts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS solutions_applied (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE machines ADD COLUMN IF NOT EXISTS type VARCHAR(100);

UPDATE machines SET type = 'nastro' WHERE type IS NULL AND line = 'Linea 1';
UPDATE machines SET type = 'assemblaggio' WHERE type IS NULL AND code = 'SIMM56';
UPDATE machines SET type = 'controllo' WHERE type IS NULL AND code = 'SIMM78';
UPDATE machines SET type = 'imballaggio' WHERE type IS NULL AND line = 'Linea 3';
UPDATE machines SET type = COALESCE(type, 'generico') WHERE type IS NULL;

-- Migra ricambi da categories a spare_parts
INSERT INTO spare_parts (name, type, description)
SELECT c.name, COALESCE(m.type, 'generico'), c.description
FROM categories c
CROSS JOIN (SELECT type FROM machines LIMIT 1) m
WHERE c.type = 'spare_part'
ON CONFLICT DO NOTHING;

INSERT INTO spare_parts (name, type, description)
SELECT DISTINCT c.name, 'generico', c.description
FROM categories c
WHERE c.type = 'spare_part'
  AND NOT EXISTS (SELECT 1 FROM spare_parts sp WHERE sp.name = c.name);

INSERT INTO solutions_applied (name, description) VALUES
('Sostituzione componente', 'Rimozione e montaggio del pezzo difettoso'),
('Pulizia e lubrificazione', 'Pulizia area interessata e lubrificazione parti mobili'),
('Ricalibrazione sensore', 'Riposizionamento e taratura sensore'),
('Aggiornamento parametri', 'Modifica parametri macchina da pannello operatore')
ON CONFLICT DO NOTHING;

ALTER TABLE cases ADD COLUMN IF NOT EXISTS solution_applied_id uuid REFERENCES solutions_applied(id) ON DELETE SET NULL;

-- Aggiorna spare_part_id ai nuovi UUID
UPDATE cases c
SET spare_part_id = sp.id
FROM categories cat
JOIN spare_parts sp ON sp.name = cat.name
WHERE c.spare_part_id = cat.id AND cat.type = 'spare_part';

ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_spare_part_id_fkey;
UPDATE cases SET spare_part_id = NULL
WHERE spare_part_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM spare_parts sp WHERE sp.id = cases.spare_part_id);

ALTER TABLE cases
  ADD CONSTRAINT cases_spare_part_id_fkey
  FOREIGN KEY (spare_part_id) REFERENCES spare_parts(id) ON DELETE SET NULL;

ALTER TABLE cases DROP COLUMN IF EXISTS operator_id;
ALTER TABLE cases DROP COLUMN IF EXISTS title;

CREATE INDEX IF NOT EXISTS idx_spare_parts_type ON spare_parts(type);
