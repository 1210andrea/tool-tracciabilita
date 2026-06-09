-- Pezzi di ricambio + operatore automatico per utente
ALTER TABLE users ADD COLUMN IF NOT EXISTS operator_category_id uuid REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS spare_part_id uuid REFERENCES categories(id) ON DELETE SET NULL;

-- Collega utenti agli operatori omonimi (case-insensitive)
UPDATE users u
SET operator_category_id = c.id
FROM categories c
WHERE c.type = 'operator'
  AND LOWER(c.name) = LOWER(u.username)
  AND u.operator_category_id IS NULL;

INSERT INTO categories(type, name, description) VALUES
('spare_part', 'Cinghia di trazione', 'Cinghia principale nastro'),
('spare_part', 'Sensore ottico', 'Sensore rilevamento prodotto'),
('spare_part', 'Valvola pneumatica', 'Valvola linea aria'),
('spare_part', 'Motore riduttore', 'Motore con riduttore integrato'),
('spare_part', 'Connettore M12', 'Connettore sensore industriale')
ON CONFLICT(type, name) DO NOTHING;
