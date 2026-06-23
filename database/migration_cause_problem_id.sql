-- ============================================================
-- MIGRATION: aggiunge problem_id (obbligatorio) alle cause
-- Data: 2026-06-23
-- ============================================================

-- 1. Aggiunge la colonna (nullable inizialmente per non rompere righe esistenti)
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS problem_id UUID
    REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_categories_problem_id
  ON categories(problem_id)
  WHERE type = 'cause';

-- NOTA: non mettiamo NOT NULL subito perché le cause esistenti
-- potrebbero non avere ancora un problema assegnato.
-- Dopo aver assegnato manualmente i problem_id a tutte le cause
-- dal pannello admin, puoi lanciare:
--
--   ALTER TABLE categories
--     ALTER COLUMN problem_id SET NOT NULL;
--   (solo per le righe type='cause', non applicabile direttamente
--    senza un check constraint, vedere sotto)
--
-- Oppure aggiungi un CHECK per forzarlo solo sulle cause:
ALTER TABLE categories DROP CONSTRAINT IF EXISTS chk_cause_problem_id;
ALTER TABLE categories ADD CONSTRAINT chk_cause_problem_id
  CHECK (
    type != 'cause' OR problem_id IS NOT NULL
  );
-- Questo vincolo entra in vigore solo su NUOVI INSERT/UPDATE.
-- Le righe cause esistenti senza problem_id restano valide finché
-- non vengono aggiornate.
