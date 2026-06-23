-- ============================================================
-- MIGRATION: aggiunge problem_id a solutions_applied
-- Data: 2026-06-23
-- ============================================================

ALTER TABLE solutions_applied
  ADD COLUMN IF NOT EXISTS problem_id UUID
    REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_solutions_applied_problem_id
  ON solutions_applied(problem_id);
