-- ============================================================
-- init.sql — schema completo Tool-Tracciabilità
-- Allineato a: migration_refactoring, migration_soluzioni_causa,
--              migration_multi_operatori_cause, migration_magazzino_ricambi
-- Idempotente: sicuro da rieseguire su DB vuoto o esistente
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- FUNZIONE trigger updated_at (usata da reorders)
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  username      TEXT        NOT NULL UNIQUE,
  email         TEXT,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'user',
  ldap_managed  BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS email TEXT;

-- ============================================================
-- MACHINES
-- ============================================================
CREATE TABLE IF NOT EXISTS machines (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  code       TEXT        NOT NULL UNIQUE,
  name       TEXT        NOT NULL,
  line       TEXT,
  location   TEXT,
  tipologia  VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE IF EXISTS machines ADD COLUMN IF NOT EXISTS line      TEXT;
ALTER TABLE IF EXISTS machines ADD COLUMN IF NOT EXISTS tipologia VARCHAR(100);
ALTER TABLE IF EXISTS machines ADD COLUMN IF NOT EXISTS type      VARCHAR(100);
ALTER TABLE IF EXISTS machines ADD COLUMN IF NOT EXISTS posizione VARCHAR(100);
ALTER TABLE IF EXISTS machines ADD COLUMN IF NOT EXISTS reparto   VARCHAR(100);

-- Rinomina posizione/position → tipologia se serve (back-compat)
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

UPDATE machines SET tipologia = COALESCE(NULLIF(tipologia,''), posizione, type);
UPDATE machines SET reparto   = COALESCE(reparto, type);

CREATE INDEX IF NOT EXISTS idx_machines_tipologia ON machines(tipologia);

-- ============================================================
-- CATEGORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  type        TEXT        NOT NULL DEFAULT 'general',
  name        TEXT        NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(type, name)
);
ALTER TABLE IF EXISTS categories ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'general';

-- ============================================================
-- OPERATORI
-- ============================================================
CREATE TABLE IF NOT EXISTS operatori (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome       VARCHAR(255) NOT NULL UNIQUE,
  attivo     BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SPARE PARTS
-- ============================================================
CREATE TABLE IF NOT EXISTS spare_parts (
  id                 uuid         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name               VARCHAR(255) NOT NULL,
  description        TEXT,
  codice             VARCHAR(100) UNIQUE,
  tipologia          VARCHAR(100),
  quantita           INTEGER      NOT NULL DEFAULT 0,
  scorta_minima      INTEGER      NOT NULL DEFAULT 1,
  quantita_riordino  INTEGER      NOT NULL DEFAULT 10,
  qty_riordino       INTEGER      NOT NULL DEFAULT 10,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- back-compat: aggiungi colonne magazzino se mancanti
ALTER TABLE IF EXISTS spare_parts ADD COLUMN IF NOT EXISTS codice            VARCHAR(100) UNIQUE;
ALTER TABLE IF EXISTS spare_parts ADD COLUMN IF NOT EXISTS tipologia         VARCHAR(100);
ALTER TABLE IF EXISTS spare_parts ADD COLUMN IF NOT EXISTS quantita          INTEGER NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS spare_parts ADD COLUMN IF NOT EXISTS scorta_minima     INTEGER NOT NULL DEFAULT 1;
ALTER TABLE IF EXISTS spare_parts ADD COLUMN IF NOT EXISTS quantita_riordino INTEGER NOT NULL DEFAULT 10;
ALTER TABLE IF EXISTS spare_parts ADD COLUMN IF NOT EXISTS qty_riordino      INTEGER NOT NULL DEFAULT 10;
-- rimuovi vecchia colonna type se presente (migrata in spare_part_tipologie)
ALTER TABLE spare_parts DROP COLUMN IF EXISTS type;

-- ============================================================
-- SPARE PART TIPOLOGIE (many-to-many spare_parts ↔ tipologia)
-- ============================================================
CREATE TABLE IF NOT EXISTS spare_part_tipologie (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  spare_part_id uuid        NOT NULL REFERENCES spare_parts(id) ON DELETE CASCADE,
  tipologia     VARCHAR(100) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(spare_part_id, tipologia)
);
CREATE INDEX IF NOT EXISTS idx_spare_part_tipologie_tipologia   ON spare_part_tipologie(tipologia);
CREATE INDEX IF NOT EXISTS idx_spare_part_tipologie_spare_part  ON spare_part_tipologie(spare_part_id);

-- back-compat: spare_part_types
CREATE TABLE IF NOT EXISTS spare_part_types (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  spare_part_id uuid        NOT NULL REFERENCES spare_parts(id) ON DELETE CASCADE,
  type          VARCHAR(100) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(spare_part_id, type)
);
CREATE INDEX IF NOT EXISTS idx_spare_parts_type       ON spare_part_types(type);
CREATE INDEX IF NOT EXISTS idx_spare_parts_spare_part ON spare_part_types(spare_part_id);

-- Migra vecchi tipi in spare_part_tipologie
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name='spare_part_types'
  ) THEN
    INSERT INTO spare_part_tipologie (spare_part_id, tipologia)
    SELECT spare_part_id, type FROM spare_part_types
    ON CONFLICT (spare_part_id, tipologia) DO NOTHING;
  END IF;
END $$;

-- ============================================================
-- SOLUTIONS APPLIED
-- ============================================================
CREATE TABLE IF NOT EXISTS solutions_applied (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       VARCHAR(255) NOT NULL,
  description TEXT,
  cause_id   uuid        REFERENCES categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE IF EXISTS solutions_applied ADD COLUMN IF NOT EXISTS cause_id uuid REFERENCES categories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_solutions_applied_cause_id ON solutions_applied(cause_id);

-- ============================================================
-- CASES
-- ============================================================
CREATE TABLE IF NOT EXISTS cases (
  id           uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  machine_id   uuid        NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  problem_id   uuid        REFERENCES categories(id) ON DELETE SET NULL,
  cause_id     uuid        REFERENCES categories(id) ON DELETE SET NULL,
  category_id  uuid        REFERENCES categories(id) ON DELETE SET NULL,
  operatore_id uuid        REFERENCES operatori(id) ON DELETE SET NULL,
  description  TEXT,
  solution     TEXT,
  notes        VARCHAR(1000),
  ai_solution  TEXT,
  status       TEXT        NOT NULL DEFAULT 'closed',
  created_by   uuid        REFERENCES users(id) ON DELETE SET NULL,
  assigned_to  uuid        REFERENCES users(id) ON DELETE SET NULL,
  tempo_impiego DECIMAL(5,2) DEFAULT 0.5,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS cases DROP COLUMN IF EXISTS operator_id;
ALTER TABLE IF EXISTS cases DROP COLUMN IF EXISTS title;
ALTER TABLE IF EXISTS cases DROP COLUMN IF EXISTS priority;
ALTER TABLE IF EXISTS cases ADD COLUMN IF NOT EXISTS operatore_id  uuid REFERENCES operatori(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS cases ADD COLUMN IF NOT EXISTS problem_id    uuid REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS cases ADD COLUMN IF NOT EXISTS cause_id      uuid REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS cases ADD COLUMN IF NOT EXISTS ai_solution   TEXT;
ALTER TABLE IF EXISTS cases ADD COLUMN IF NOT EXISTS notes         VARCHAR(1000);
ALTER TABLE IF EXISTS cases ADD COLUMN IF NOT EXISTS tempo_impiego DECIMAL(5,2) DEFAULT 0.5;

-- back-compat: colonna spare_part_id (verrà rimossa dopo migrazione in case_spare_parts)
ALTER TABLE IF EXISTS cases ADD COLUMN IF NOT EXISTS spare_part_id         uuid;
ALTER TABLE IF EXISTS cases ADD COLUMN IF NOT EXISTS solution_applied_id   uuid REFERENCES solutions_applied(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cases_machine_id   ON cases(machine_id);
CREATE INDEX IF NOT EXISTS idx_cases_status       ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_operatore_id ON cases(operatore_id);

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

-- ============================================================
-- CASE JUNCTION TABLES
-- ============================================================
CREATE TABLE IF NOT EXISTS case_solutions_tried (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id     uuid        NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  solution_id uuid        NOT NULL REFERENCES solutions_applied(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(case_id, solution_id)
);

CREATE TABLE IF NOT EXISTS case_solutions_applied (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id     uuid        NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  solution_id uuid        NOT NULL REFERENCES solutions_applied(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(case_id, solution_id)
);

CREATE TABLE IF NOT EXISTS case_spare_parts (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id       uuid        NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  spare_part_id uuid        NOT NULL REFERENCES spare_parts(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(case_id, spare_part_id)
);

-- multi-operatori (migration_multi_operatori_cause)
CREATE TABLE IF NOT EXISTS case_operatori (
  case_id      UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  operatore_id UUID NOT NULL REFERENCES operatori(id) ON DELETE CASCADE,
  PRIMARY KEY (case_id, operatore_id)
);

-- multi-cause (migration_multi_operatori_cause)
CREATE TABLE IF NOT EXISTS case_causes (
  case_id  UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  cause_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (case_id, cause_id)
);

CREATE INDEX IF NOT EXISTS idx_case_solutions_tried        ON case_solutions_tried(case_id);
CREATE INDEX IF NOT EXISTS idx_case_solutions_applied      ON case_solutions_applied(case_id);
CREATE INDEX IF NOT EXISTS idx_case_spare_parts            ON case_spare_parts(case_id);
CREATE INDEX IF NOT EXISTS idx_case_operatori_case_id      ON case_operatori(case_id);
CREATE INDEX IF NOT EXISTS idx_case_operatori_operatore_id ON case_operatori(operatore_id);
CREATE INDEX IF NOT EXISTS idx_case_causes_case_id         ON case_causes(case_id);
CREATE INDEX IF NOT EXISTS idx_case_causes_cause_id        ON case_causes(cause_id);

-- Migra dati esistenti nelle nuove junction tables
INSERT INTO case_solutions_applied (case_id, solution_id)
SELECT id, solution_applied_id FROM cases
WHERE solution_applied_id IS NOT NULL
ON CONFLICT (case_id, solution_id) DO NOTHING;

INSERT INTO case_spare_parts (case_id, spare_part_id)
SELECT id, spare_part_id FROM cases
WHERE spare_part_id IS NOT NULL
ON CONFLICT (case_id, spare_part_id) DO NOTHING;

INSERT INTO case_operatori (case_id, operatore_id)
SELECT id, operatore_id FROM cases
WHERE operatore_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO case_causes (case_id, cause_id)
SELECT id, cause_id FROM cases
WHERE cause_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Rimuovi colonne obsolete da cases
ALTER TABLE cases DROP COLUMN IF EXISTS solution_applied_id;
ALTER TABLE cases DROP COLUMN IF EXISTS spare_part_id;

-- ============================================================
-- CASE EVENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS case_events (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id    uuid        NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  event_type TEXT        NOT NULL,
  message    TEXT,
  actor_id   uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_case_events_case_id ON case_events(case_id);

-- ============================================================
-- REORDERS (magazzino — 1 ordine = 1 articolo)
-- ============================================================
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

-- back-compat: aggiorna struttura se la tabella esisteva già con schema vecchio
ALTER TABLE IF EXISTS reorders ADD COLUMN IF NOT EXISTS spare_part_id     UUID REFERENCES spare_parts(id) ON DELETE RESTRICT;
ALTER TABLE IF EXISTS reorders ADD COLUMN IF NOT EXISTS quantita_ordinata INTEGER NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS reorders ADD COLUMN IF NOT EXISTS quantita_ricevuta INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  ALTER TABLE reorders DROP CONSTRAINT IF EXISTS reorders_status_check;
  ALTER TABLE reorders ADD CONSTRAINT reorders_status_check
    CHECK (status IN ('in_lavorazione','partial','completed','cancelled'));
EXCEPTION WHEN others THEN NULL;
END $$;

ALTER TABLE IF EXISTS reorders ALTER COLUMN status SET DEFAULT 'in_lavorazione';

CREATE INDEX IF NOT EXISTS idx_reorders_spare_part ON reorders(spare_part_id);
CREATE INDEX IF NOT EXISTS idx_reorders_status     ON reorders(status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_reorders_updated_at'
  ) THEN
    CREATE TRIGGER trg_reorders_updated_at
      BEFORE UPDATE ON reorders
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ============================================================
-- SPARE PARTS MOVIMENTI (storico giacenza)
-- ============================================================
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

-- ============================================================
-- SEED DATA
-- ============================================================
INSERT INTO operatori (nome, attivo) VALUES
  ('Operatore 1', true), ('Operatore 2', true), ('Operatore 3', true),
  ('Luigi', true), ('Mario', true), ('Andrea', true), ('Paolo', true)
ON CONFLICT (nome) DO NOTHING;

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

UPDATE machines SET tipologia = COALESCE(NULLIF(tipologia,''), posizione, type);
UPDATE machines SET reparto   = COALESCE(reparto, type);

UPDATE machines SET type = 'nastro'       WHERE type IS NULL AND line = 'Linea 1';
UPDATE machines SET type = 'assemblaggio' WHERE type IS NULL AND line = 'Linea 2' AND code = 'SIMM56';
UPDATE machines SET type = 'controllo'    WHERE type IS NULL AND line = 'Linea 2' AND code = 'SIMM78';
UPDATE machines SET type = 'imballaggio'  WHERE type IS NULL AND line = 'Linea 3';
UPDATE machines SET reparto = COALESCE(reparto, type);

INSERT INTO spare_parts(name, description)
SELECT v.name, v.description
FROM (VALUES
  ('Cinghia di trazione',  'Cinghia principale nastro'),
  ('Sensore ottico',       'Sensore rilevamento prodotto'),
  ('Valvola pneumatica',   'Valvola linea aria'),
  ('Motore riduttore',     'Motore con riduttore integrato'),
  ('Connettore M12',       'Connettore sensore industriale'),
  ('Nastro trasportatore', 'Nastro linea imballaggio')
) AS v(name, description)
WHERE NOT EXISTS (SELECT 1 FROM spare_parts sp WHERE sp.name = v.name);

INSERT INTO spare_part_types(spare_part_id, type)
SELECT sp.id, v.type
FROM (VALUES
  ('Cinghia di trazione','nastro'),
  ('Sensore ottico','nastro'),
  ('Valvola pneumatica','assemblaggio'),
  ('Motore riduttore','assemblaggio'),
  ('Connettore M12','controllo'),
  ('Nastro trasportatore','imballaggio')
) AS v(name, type)
JOIN spare_parts sp ON sp.name = v.name
WHERE NOT EXISTS (
  SELECT 1 FROM spare_part_types spt
  WHERE spt.spare_part_id = sp.id AND spt.type = v.type
);

INSERT INTO spare_part_tipologie(spare_part_id, tipologia)
SELECT sp.id, v.tipologia
FROM (VALUES
  ('Cinghia di trazione','nastro'),
  ('Sensore ottico','nastro'),
  ('Valvola pneumatica','assemblaggio'),
  ('Motore riduttore','assemblaggio'),
  ('Connettore M12','controllo'),
  ('Nastro trasportatore','imballaggio')
) AS v(name, tipologia)
JOIN spare_parts sp ON sp.name = v.name
WHERE NOT EXISTS (
  SELECT 1 FROM spare_part_tipologie spt
  WHERE spt.spare_part_id = sp.id AND spt.tipologia = v.tipologia
);

INSERT INTO solutions_applied(name, description) VALUES
  ('Sostituzione componente',  'Rimozione e montaggio del pezzo difettoso'),
  ('Pulizia e lubrificazione', 'Pulizia area interessata e lubrificazione parti mobili'),
  ('Ricalibrazione sensore',   'Riposizionamento e taratura sensore'),
  ('Aggiornamento parametri',  'Modifica parametri macchina da pannello operatore')
ON CONFLICT DO NOTHING;

-- bcrypt hashes: admin/password, user/user
INSERT INTO users(username,email,password_hash,role) VALUES
  ('admin','admin@machines.local','$2a$10$2EleFFb3GfSA7BOnb1Sj4OR.Rp8E3l0HOI0kjmIZdbtU0f9elVfwe','admin')
ON CONFLICT(username) DO NOTHING;

INSERT INTO users(username,email,password_hash,role) VALUES
  ('user','user@machines.local','$2a$10$c2iqxNmnCJcg0YQVu.wFAuMRIk.wl008naVCAboQt3790bjEWQ8Gu','user')
ON CONFLICT(username) DO NOTHING;
