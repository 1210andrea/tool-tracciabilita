-- Migration: collega soluzioni alle cause
-- Esegui con: psql -U <user> -d <db> -f migration_soluzioni_causa.sql
-- NON resetta dati esistenti

ALTER TABLE solutions_applied ADD COLUMN IF NOT EXISTS cause_id uuid REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_solutions_applied_cause_id ON solutions_applied(cause_id);
