-- I casi sono registrati come chiusi al momento della creazione.
UPDATE cases SET status = 'closed' WHERE status IS DISTINCT FROM 'closed';
ALTER TABLE cases ALTER COLUMN status SET DEFAULT 'closed';
