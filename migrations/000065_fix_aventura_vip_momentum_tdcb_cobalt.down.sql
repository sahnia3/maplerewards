-- Reverse batch 6.

-- Amex Cobalt: remove the restored 2x travel.
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'Amex Cobalt')
  AND category_id = (SELECT id FROM categories WHERE slug = 'travel') AND earn_rate = 2.00;

-- CIBC Aventura VIP: travel 3x -> 2x; gas/dining/groceries 2x -> 1.5x; remove entertainment.
UPDATE card_multipliers SET earn_rate = 2.00, notes = '2x travel via CIBC Rewards Centre'
WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Aventura Visa Infinite Privilege')
  AND category_id = (SELECT id FROM categories WHERE slug = 'travel') AND earn_rate = 3.00;
UPDATE card_multipliers SET earn_rate = 1.50
WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Aventura Visa Infinite Privilege')
  AND category_id IN (SELECT id FROM categories WHERE slug IN ('groceries', 'dining', 'gas-transit')) AND earn_rate = 2.00;
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Aventura Visa Infinite Privilege')
  AND category_id = (SELECT id FROM categories WHERE slug = 'entertainment') AND earn_rate = 2.00;

-- TD Cash Back VI: remove recurring-bills.
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'TD Cash Back Visa Infinite')
  AND category_id = (SELECT id FROM categories WHERE slug = 'recurring-bills') AND earn_rate = 3.00;

-- Scotia Momentum VI: remove recurring-bills; re-add 2% dining.
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'Scotia Momentum Visa Infinite')
  AND category_id = (SELECT id FROM categories WHERE slug = 'recurring-bills') AND earn_rate = 4.00;
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT (SELECT id FROM cards WHERE name = 'Scotia Momentum Visa Infinite'), (SELECT id FROM categories WHERE slug = 'dining'),
       2.00, 'cashback_pct', 1.00, '2026-04-05', '2% dining & food delivery'
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers WHERE card_id = (SELECT id FROM cards WHERE name = 'Scotia Momentum Visa Infinite') AND category_id = (SELECT id FROM categories WHERE slug = 'dining'));
