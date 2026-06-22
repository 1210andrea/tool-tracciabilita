-- Migration: rimuove il collegamento causa->soluzione
-- Eseguire una volta sola sul DB esistente

ALTER TABLE solutions_applied DROP COLUMN IF EXISTS cause_id;
