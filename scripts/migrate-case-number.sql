ALTER TABLE cases ADD COLUMN IF NOT EXISTS case_number SERIAL;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
  FROM cases
)
UPDATE cases SET case_number = ordered.rn
FROM ordered WHERE cases.id = ordered.id;

CREATE UNIQUE INDEX IF NOT EXISTS cases_case_number_idx ON cases(case_number);
