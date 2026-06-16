-- Migrazione: separazione operatori da utenti
-- Eseguire su database esistente: psql -U <user> -d <db> -f scripts/migrate-operatori.sql

CREATE TABLE IF NOT EXISTS operatori (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome VARCHAR(255) NOT NULL UNIQUE,
  attivo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migra operatori da categories
INSERT INTO operatori (nome, attivo, created_at)
SELECT c.name, true, c.created_at
FROM categories c
WHERE c.type = 'operator'
ON CONFLICT (nome) DO NOTHING;

-- Aggiungi colonna operatore_id su cases
ALTER TABLE cases ADD COLUMN IF NOT EXISTS operatore_id uuid REFERENCES operatori(id) ON DELETE SET NULL;

-- Backfill operatore_id sui casi esistenti tramite utente creatore
UPDATE cases c
SET operatore_id = o.id
FROM users u
JOIN categories cat ON cat.id = u.operator_category_id AND cat.type = 'operator'
JOIN operatori o ON LOWER(o.nome) = LOWER(cat.name)
WHERE c.created_by = u.id
  AND c.operatore_id IS NULL
  AND u.operator_category_id IS NOT NULL;

-- Fallback: match username -> operatore omonimo
UPDATE cases c
SET operatore_id = o.id
FROM users u
JOIN operatori o ON LOWER(o.nome) = LOWER(u.username)
WHERE c.created_by = u.id
  AND c.operatore_id IS NULL;

-- Rimuovi collegamento utente-operatore
ALTER TABLE users DROP COLUMN IF EXISTS operator_category_id;

-- Seed operatori di default
INSERT INTO operatori (nome, attivo) VALUES
  ('Operatore 1', true),
  ('Operatore 2', true),
  ('Operatore 3', true)
ON CONFLICT (nome) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_cases_operatore_id ON cases(operatore_id);
