-- Reverse 000059: restore the pre-correction (incorrect) seed values so the
-- migration round-trips exactly.

-- TD Aeroplan Visa Infinite: 1.5x -> 3.0x
UPDATE card_multipliers SET
    earn_rate = 3.00,
    notes = '3x on Air Canada purchases (MCC 4511)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'TD Aeroplan Visa Infinite')
  AND category_id = (SELECT id FROM categories WHERE slug = 'travel')
  AND earn_rate = 1.50;

-- Amex Aeroplan Business Reserve: travel 3.0x -> 2.0x (restore fallback 1.0)
UPDATE card_multipliers SET
    earn_rate = 2.00,
    fallback_earn_rate = 1.00,
    notes = '2x travel'
WHERE card_id = (SELECT id FROM cards WHERE name = 'Amex Aeroplan Business Reserve Card')
  AND category_id = (SELECT id FROM categories WHERE slug = 'travel')
  AND earn_rate = 3.00;

-- Amex Aeroplan Business Reserve: re-insert the dining row exactly as seeded
-- (earn 3.0, fallback 1.0, effective_from 2026-04-05, note '3x dining').
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT
    (SELECT id FROM cards WHERE name = 'Amex Aeroplan Business Reserve Card'),
    (SELECT id FROM categories WHERE slug = 'dining'),
    3.00, 'points', 1.00, '2026-04-05', '3x dining'
WHERE NOT EXISTS (
    SELECT 1 FROM card_multipliers
    WHERE card_id = (SELECT id FROM cards WHERE name = 'Amex Aeroplan Business Reserve Card')
      AND category_id = (SELECT id FROM categories WHERE slug = 'dining')
);
