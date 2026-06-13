-- Restore the duplicate 'Annual Travel Credit' row exactly as seeded by 000010.
-- (The row double-counts the card's NEXUS credit — this only reverts the
-- database to its pre-000097 state.)

INSERT INTO card_credit_defs (card_id, name, description, value_cad, recurrence, sort_order)
SELECT id, 'Annual Travel Credit', '$100 NEXUS application credit (every 4 years).', 100.00, 'quadrennial', 10
FROM cards c WHERE c.name = 'TD Aeroplan Visa Infinite Privilege'
  AND NOT EXISTS (
    SELECT 1 FROM card_credit_defs d
     WHERE d.card_id = c.id AND d.name = 'Annual Travel Credit' AND d.user_id IS NULL
  );
