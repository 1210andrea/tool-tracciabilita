-- Rimuove la colonna priority dalla tabella cases (DB esistente).
ALTER TABLE cases DROP COLUMN IF EXISTS priority;
