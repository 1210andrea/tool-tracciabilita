-- Migration: collega cause e soluzioni ai problemi (many-to-many)
-- Eseguire una volta sola sul DB esistente

-- Tabella di join: problema <-> causa
CREATE TABLE IF NOT EXISTS problem_causes (
  problem_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  cause_id   UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (problem_id, cause_id)
);

-- Tabella di join: problema <-> soluzione
CREATE TABLE IF NOT EXISTS problem_solutions (
  problem_id  UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  solution_id UUID NOT NULL REFERENCES solutions_applied(id) ON DELETE CASCADE,
  PRIMARY KEY (problem_id, solution_id)
);
