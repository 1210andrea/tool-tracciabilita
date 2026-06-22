-- Migration: collega soluzioni ai problemi (many-to-many)
-- Eseguire una volta sola sul DB esistente

-- La tabella problem_solutions esiste già (creata da add_problem_cause_solution_links.sql)
-- Questa migration non aggiunge nuove tabelle ma serve come riferimento
-- per il nuovo comportamento: le soluzioni ora si associano direttamente ai problemi
-- tramite la tabella problem_solutions già esistente.

-- Nessuna DDL aggiuntiva necessaria se add_problem_cause_solution_links.sql è già stato eseguito.
SELECT 'Migration add_solution_problems: problem_solutions table already exists, nothing to do.' AS status;
