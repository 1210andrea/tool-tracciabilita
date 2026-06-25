-- Migrazione 004: tabella reorder_items per ordini multi-riga
-- Eseguire su DB dopo aver applicato le migrazioni precedenti.

-- 1. Rimuovi spare_part_id e colonne quantita da reorders (ora header-only)
--    Se la colonna esiste già come NOT NULL potrebbe fallire: usare CASCADE o ALTER per ogni DB
ALTER TABLE reorders DROP COLUMN IF EXISTS spare_part_id;
ALTER TABLE reorders DROP COLUMN IF EXISTS quantita_ordinata;
ALTER TABLE reorders DROP COLUMN IF EXISTS quantita_ricevuta;

-- 2. Aggiorna status enum: 'in_lavorazione' → 'pending' (se non già aggiornato)
--    Solo se la colonna usa CHECK constraint vecchio
ALTER TABLE reorders
  DROP CONSTRAINT IF EXISTS reorders_status_check;

ALTER TABLE reorders
  ADD CONSTRAINT reorders_status_check
  CHECK (status IN ('pending','partial','completed','cancelled'));

-- Aggiorna eventuali valori legacy
UPDATE reorders SET status = 'pending'   WHERE status = 'in_lavorazione';
UPDATE reorders SET status = 'completed' WHERE status = 'completato';
UPDATE reorders SET status = 'cancelled' WHERE status = 'annullato';

-- 3. Crea tabella reorder_items
CREATE TABLE IF NOT EXISTS reorder_items (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  reorder_id        UUID        NOT NULL REFERENCES reorders(id) ON DELETE CASCADE,
  spare_part_id     UUID        NOT NULL REFERENCES spare_parts(id),
  quantita_ordinata INT         NOT NULL CHECK (quantita_ordinata > 0),
  quantita_ricevuta INT         NOT NULL DEFAULT 0 CHECK (quantita_ricevuta >= 0),
  status            TEXT        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','partial','completed','cancelled')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reorder_items_reorder_id
  ON reorder_items(reorder_id);

CREATE INDEX IF NOT EXISTS idx_reorder_items_spare_part_id
  ON reorder_items(spare_part_id);

-- 4. Assicura colonna quantita_riordino su spare_parts (normalizza alias)
ALTER TABLE spare_parts ADD COLUMN IF NOT EXISTS quantita_riordino INT NOT NULL DEFAULT 10;
UPDATE spare_parts
  SET quantita_riordino = COALESCE(qty_riordino, 10)
  WHERE quantita_riordino = 10 AND qty_riordino IS NOT NULL;
