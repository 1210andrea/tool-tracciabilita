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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE IF EXISTS machines ADD COLUMN IF NOT EXISTS line TEXT;

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL DEFAULT 'general',
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(type, name)
);
ALTER TABLE IF EXISTS categories ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'general';

CREATE TABLE IF NOT EXISTS cases (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  machine_id uuid NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  operator_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  problem_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  cause_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  solution TEXT,
  ai_solution TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE IF EXISTS cases ADD COLUMN IF NOT EXISTS operator_id uuid REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS cases ADD COLUMN IF NOT EXISTS problem_id uuid REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS cases ADD COLUMN IF NOT EXISTS cause_id uuid REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS cases ADD COLUMN IF NOT EXISTS ai_solution TEXT;

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

INSERT INTO machines(code,name,line,location) VALUES
('SIMM45','Linea 1 - Taglio','Linea 1','Reparto A'),
('SIMM47','Linea 1 - Saldo','Linea 1','Reparto A'),
('SIMM56','Linea 2 - Assemblaggio','Linea 2','Reparto B'),
('SIMM78','Linea 2 - Controllo','Linea 2','Reparto B'),
('SIMM91','Linea 3 - Imballaggio','Linea 3','Reparto C')
ON CONFLICT(code) DO NOTHING;

-- bcrypt hashes: admin/password, user/user
INSERT INTO users(username,email,password_hash,role) VALUES
('admin','admin@machines.local','$2a$10$2EleFFb3GfSA7BOnb1Sj4OR.Rp8E3l0HOI0kjmIZdbtU0f9elVfwe','admin')
ON CONFLICT(username) DO NOTHING;

INSERT INTO users(username,email,password_hash,role) VALUES
('user','user@machines.local','$2a$10$c2iqxNmnCJcg0YQVu.wFAuMRIk.wl008naVCAboQt3790bjEWQ8Gu','user')
ON CONFLICT(username) DO NOTHING;

