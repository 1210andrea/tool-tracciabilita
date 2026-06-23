-- ============================================================
-- MIGRATION: tabella solution_problems (N:M soluzioni <-> problemi)
-- Data: 2026-06-23
-- ============================================================

CREATE TABLE IF NOT EXISTS solution_problems (
  solution_id UUID NOT NULL REFERENCES solutions_applied(id) ON DELETE CASCADE,
  problem_id  UUID NOT NULL REFERENCES categories(id)        ON DELETE CASCADE,
  PRIMARY KEY (solution_id, problem_id)
);

CREATE INDEX IF NOT EXISTS idx_solution_problems_solution_id ON solution_problems(solution_id);
CREATE INDEX IF NOT EXISTS idx_solution_problems_problem_id  ON solution_problems(problem_id);

-- Popola dalla colonna legacy problem_id (retrocompatibilità)
INSERT INTO solution_problems (solution_id, problem_id)
SELECT id, problem_id
FROM solutions_applied
WHERE problem_id IS NOT NULL
ON CONFLICT DO NOTHING;
