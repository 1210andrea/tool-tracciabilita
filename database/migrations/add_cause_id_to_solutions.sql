-- Migrazione: aggiunge cause_id a solutions_applied
-- Eseguire una sola volta sul DB esistente (non resetta i dati)
-- Data: 2026-06-22

ALTER TABLE solutions_applied
  ADD COLUMN IF NOT EXISTS cause_id UUID REFERENCES categories(id) ON DELETE SET NULL;

COMMENT ON COLUMN solutions_applied.cause_id IS 'Causa (categoria tipo=cause) a cui questa soluzione è associata. Nullable per retrocompatibilità.';
