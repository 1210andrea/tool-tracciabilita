-- ============================================================
-- MIGRATION: multi-operatori e multi-cause per i casi
-- Data: 2026-06-23
-- NON rilanciare init.sql: eseguire solo questo script
-- ============================================================

-- 1. Tabella di join: un caso può avere più operatori
CREATE TABLE IF NOT EXISTS case_operatori (
  case_id      UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  operatore_id UUID NOT NULL REFERENCES operatori(id) ON DELETE CASCADE,
  PRIMARY KEY (case_id, operatore_id)
);

CREATE INDEX IF NOT EXISTS idx_case_operatori_case_id ON case_operatori(case_id);
CREATE INDEX IF NOT EXISTS idx_case_operatori_operatore_id ON case_operatori(operatore_id);

-- 2. Tabella di join: un caso può avere più cause
CREATE TABLE IF NOT EXISTS case_causes (
  case_id  UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  cause_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (case_id, cause_id)
);

CREATE INDEX IF NOT EXISTS idx_case_causes_case_id ON case_causes(case_id);
CREATE INDEX IF NOT EXISTS idx_case_causes_cause_id ON case_causes(cause_id);

-- 3. Popola case_operatori dai dati esistenti (retrocompatibilità)
INSERT INTO case_operatori (case_id, operatore_id)
SELECT id, operatore_id
FROM cases
WHERE operatore_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 4. Popola case_causes dai dati esistenti (retrocompatibilità)
INSERT INTO case_causes (case_id, cause_id)
SELECT id, cause_id
FROM cases
WHERE cause_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ============================================================
-- I campi cases.operatore_id e cases.cause_id vengono mantenuti
-- per compatibilità con i dati storici e le query esistenti.
-- Il backend li aggiornerà sempre con il primo valore dell'array.
-- ============================================================
