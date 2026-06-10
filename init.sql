CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  username TEXT NOT NULL UNIQUE,
  email TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  ldap_managed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS email TEXT;

CREATE TABLE IF NOT EXISTS machines (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  line TEXT,
  location TEXT,
  tipologia VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE IF EXISTS machines ADD COLUMN IF NOT EXISTS line TEXT;
ALTER TABLE IF EXISTS machines ADD COLUMN IF NOT EXISTS tipologia VARCHAR(100);

-- back-compat: se esiste ancora la vecchia colonna type/posizione, la mappiamo
ALTER TABLE IF EXISTS machines ADD COLUMN IF NOT EXISTS type VARCHAR(100);
ALTER TABLE IF EXISTS machines ADD COLUMN IF NOT EXISTS posizione VARCHAR(100);

-- se tipologia è vuota, prendiamo il valore dalla vecchia colonna
UPDATE machines SET tipologia = COALESCE(NULLIF(tipologia, ''), posizione, type);

CREATE INDEX IF NOT EXISTS idx_machines_tipologia ON machines(tipologia);

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL DEFAULT 'general',
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(type, name)
);
ALTER TABLE IF EXISTS categories ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'general';
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS operator_category_id uuid REFERENCES categories(id) ON DELETE SET NULL;

-- Tabella pezzi di ricambio
CREATE TABLE IF NOT EXISTS spare_parts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Many-to-many: pezzo di ricambio <-> tipologie macchina (valori presi da machines.tipologia)
-- nota: manteniamo la vecchia spare_part_types in back-compat ma la nuova logica usa spare_part_tipologie.
CREATE TABLE IF NOT EXISTS spare_part_tipologie (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  spare_part_id uuid NOT NULL REFERENCES spare_parts(id) ON DELETE CASCADE,
  tipologia VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(spare_part_id, tipologia)
);

CREATE INDEX IF NOT EXISTS idx_spare_part_tipologie_tipologia ON spare_part_tipologie(tipologia);
CREATE INDEX IF NOT EXISTS idx_spare_part_tipologie_spare_part ON spare_part_tipologie(spare_part_id);

-- Back-compat: spare_part_types esiste già in alcuni ambienti; se presente, la usiamo per migrare i dati.
CREATE TABLE IF NOT EXISTS spare_part_types (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  spare_part_id uuid NOT NULL REFERENCES spare_parts(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(spare_part_id, type)
);

CREATE INDEX IF NOT EXISTS idx_spare_parts_type ON spare_part_types(type);
CREATE INDEX IF NOT EXISTS idx_spare_parts_spare_part ON spare_part_types(spare_part_id);





CREATE TABLE IF NOT EXISTS solutions_applied (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cases (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  machine_id uuid NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  problem_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  cause_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  spare_part_id uuid REFERENCES spare_parts(id) ON DELETE SET NULL,
  solution_applied_id uuid REFERENCES solutions_applied(id) ON DELETE SET NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  description TEXT,
  solution TEXT,
  ai_solution TEXT,
  status TEXT NOT NULL DEFAULT 'closed',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migrazioni schema esistente
ALTER TABLE IF EXISTS cases DROP COLUMN IF EXISTS operator_id;
ALTER TABLE IF EXISTS cases DROP COLUMN IF EXISTS title;
ALTER TABLE IF EXISTS cases ADD COLUMN IF NOT EXISTS problem_id uuid REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS cases ADD COLUMN IF NOT EXISTS cause_id uuid REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS cases ADD COLUMN IF NOT EXISTS ai_solution TEXT;
ALTER TABLE IF EXISTS cases ADD COLUMN IF NOT EXISTS solution_applied_id uuid REFERENCES solutions_applied(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS cases DROP COLUMN IF EXISTS priority;

-- Ricrea FK spare_part_id verso spare_parts (da categories)
ALTER TABLE IF EXISTS cases DROP CONSTRAINT IF EXISTS cases_spare_part_id_fkey;
ALTER TABLE IF EXISTS cases ADD COLUMN IF NOT EXISTS spare_part_id uuid;


CREATE TABLE IF NOT EXISTS case_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  message TEXT,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cases_machine_id ON cases(machine_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_case_events_case_id ON case_events(case_id);
-- idx_spare_parts_type moved to spare_part_types


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

-- Seed data
INSERT INTO categories(type,name,description) VALUES
('operator','Luigi','Operatore in linea'),
('operator','Mario','Operatore in linea'),
('operator','Andrea','Operatore in linea'),
('operator','Paolo','Operatore in linea')
ON CONFLICT(type,name) DO NOTHING;

INSERT INTO categories(type,name,description) VALUES
('problem','Fettuccia inceppata','Problema tipico di nastro'),
('problem','Motore rumoroso','Vibrazioni e rumori anomali'),
('problem','Sensore difettoso','Segnale non corretto'),
('problem','Pressione bassa','Flusso ridotto')
ON CONFLICT(type,name) DO NOTHING;

INSERT INTO categories(type,name,description) VALUES
('cause','Usura meccanica','Componente usurato'),
('cause','Sporcizia/Detrito','Materiale estraneo'),
('cause','Configurazione errata','Parametri sbagliati'),
('cause','Connettore allentato','Connessione elettrica difettosa')
ON CONFLICT(type,name) DO NOTHING;

INSERT INTO machines(code,name,line,location,type) VALUES
('SIMM45','Linea 1 - Taglio','Linea 1','Reparto A','nastro'),
('SIMM47','Linea 1 - Saldo','Linea 1','Reparto A','nastro'),
('SIMM56','Linea 2 - Assemblaggio','Linea 2','Reparto B','assemblaggio'),
('SIMM78','Linea 2 - Controllo','Linea 2','Reparto B','controllo'),
('SIMM91','Linea 3 - Imballaggio','Linea 3','Reparto C','imballaggio')
ON CONFLICT(code) DO UPDATE SET type = EXCLUDED.type;

-- Seed spare parts + tipi (many-to-many)
INSERT INTO spare_parts(name, description)
SELECT v.name, v.description
FROM (VALUES
  ('Cinghia di trazione', 'nastro', 'Cinghia principale nastro'),
  ('Sensore ottico', 'nastro', 'Sensore rilevamento prodotto'),
  ('Valvola pneumatica', 'assemblaggio', 'Valvola linea aria'),
  ('Motore riduttore', 'assemblaggio', 'Motore con riduttore integrato'),
  ('Connettore M12', 'controllo', 'Connettore sensore industriale'),
  ('Nastro trasportatore', 'imballaggio', 'Nastro linea imballaggio')
) AS v(name, type, description)
WHERE NOT EXISTS (SELECT 1 FROM spare_parts sp WHERE sp.name = v.name);

-- legacy seed (manteniamo solo per migrare dati se serve)
INSERT INTO spare_part_types(spare_part_id, type)
SELECT sp.id, v.type
FROM (VALUES
  ('Cinghia di trazione', 'nastro'),
  ('Sensore ottico', 'nastro'),
  ('Valvola pneumatica', 'assemblaggio'),
  ('Motore riduttore', 'assemblaggio'),
  ('Connettore M12', 'controllo'),
  ('Nastro trasportatore', 'imballaggio')
) AS v(name, type)
JOIN spare_parts sp ON sp.name = v.name
WHERE NOT EXISTS (
  SELECT 1 FROM spare_part_types spt
  WHERE spt.spare_part_id = sp.id AND spt.type = v.type
);

-- nuova seed: spare_part_tipologie (tipologia == machines.tipologia)
INSERT INTO spare_part_tipologie(spare_part_id, tipologia)
SELECT sp.id, v.tipologia
FROM (VALUES
  ('Cinghia di trazione', 'nastro'),
  ('Sensore ottico', 'nastro'),
  ('Valvola pneumatica', 'assemblaggio'),
  ('Motore riduttore', 'assemblaggio'),
  ('Connettore M12', 'controllo'),
  ('Nastro trasportatore', 'imballaggio')
) AS v(name, tipologia)
JOIN spare_parts sp ON sp.name = v.name
WHERE NOT EXISTS (
  SELECT 1 FROM spare_part_tipologie spt
  WHERE spt.spare_part_id = sp.id AND spt.tipologia = v.tipologia
);





INSERT INTO solutions_applied(name, description)
SELECT v.name, v.description
FROM (VALUES
  ('Sostituzione componente', 'Rimozione e montaggio del pezzo difettoso'),
  ('Pulizia e lubrificazione', 'Pulizia area interessata e lubrificazione parti mobili'),
  ('Ricalibrazione sensore', 'Riposizionamento e taratura sensore'),
  ('Aggiornamento parametri', 'Modifica parametri macchina da pannello operatore')
) AS v(name, description)
WHERE NOT EXISTS (SELECT 1 FROM solutions_applied sa WHERE sa.name = v.name);

-- bcrypt hashes: admin/password, user/user
INSERT INTO users(username,email,password_hash,role) VALUES
('admin','admin@machines.local','$2a$10$2EleFFb3GfSA7BOnb1Sj4OR.Rp8E3l0HOI0kjmIZdbtU0f9elVfwe','admin')
ON CONFLICT(username) DO NOTHING;

INSERT INTO users(username,email,password_hash,role) VALUES
('user','user@machines.local','$2a$10$c2iqxNmnCJcg0YQVu.wFAuMRIk.wl008naVCAboQt3790bjEWQ8Gu','user')
ON CONFLICT(username) DO NOTHING;

UPDATE users u SET operator_category_id = c.id
FROM categories c
WHERE c.type = 'operator' AND LOWER(c.name) = LOWER(u.username) AND u.operator_category_id IS NULL;

-- reparto: compatibilità (oggi usiamo machines.type come reparto)
ALTER TABLE IF EXISTS machines ADD COLUMN IF NOT EXISTS reparto VARCHAR(100);
UPDATE machines SET reparto = COALESCE(reparto, type);

UPDATE machines SET type = 'nastro' WHERE type IS NULL AND line = 'Linea 1';
UPDATE machines SET type = 'assemblaggio' WHERE type IS NULL AND line = 'Linea 2' AND code = 'SIMM56';
UPDATE machines SET type = 'controllo' WHERE type IS NULL AND line = 'Linea 2' AND code = 'SIMM78';
UPDATE machines SET type = 'imballaggio' WHERE type IS NULL AND line = 'Linea 3';
UPDATE machines SET reparto = COALESCE(reparto, type);

