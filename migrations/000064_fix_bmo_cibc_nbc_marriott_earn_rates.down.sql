-- Reverse batch 5: restore the pre-correction seed state.

-- BMO eclipse VI: gas/transit 5% -> 3%; remove the added dining row.
UPDATE card_multipliers SET earn_rate = 3.00, notes = '3% gas & transit'
WHERE card_id = (SELECT id FROM cards WHERE name = 'BMO eclipse Visa Infinite')
  AND category_id = (SELECT id FROM categories WHERE slug = 'gas-transit') AND earn_rate = 5.00;
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'BMO eclipse Visa Infinite')
  AND category_id = (SELECT id FROM categories WHERE slug = 'dining') AND earn_rate = 5.00;

-- CIBC Aventura VI: re-add 1.5x dining.
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT (SELECT id FROM cards WHERE name = 'CIBC Aventura Visa Infinite'), (SELECT id FROM categories WHERE slug = 'dining'),
       1.50, 'points', 1.00, '2026-04-05', '1.5x dining'
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Aventura Visa Infinite') AND category_id = (SELECT id FROM categories WHERE slug = 'dining'));

-- Marriott Bonvoy Amex: base 2x -> 1x; re-add 2x dining.
UPDATE card_multipliers SET earn_rate = 1.00, notes = '1x everything else'
WHERE card_id = (SELECT id FROM cards WHERE name = 'Marriott Bonvoy American Express Card')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else') AND earn_rate = 2.00;
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT (SELECT id FROM cards WHERE name = 'Marriott Bonvoy American Express Card'), (SELECT id FROM categories WHERE slug = 'dining'),
       2.00, 'points', 1.00, '2026-04-05', '2x dining'
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers WHERE card_id = (SELECT id FROM cards WHERE name = 'Marriott Bonvoy American Express Card') AND category_id = (SELECT id FROM categories WHERE slug = 'dining'));

-- National Bank WE: base 1x -> 2x; grocery/dining post-cap fallback 1x -> 2x; remove the added 2x tier.
UPDATE card_multipliers SET earn_rate = 2.00, notes = '2x on everything else'
WHERE card_id = (SELECT id FROM cards WHERE name = 'National Bank World Elite Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else') AND earn_rate = 1.00;
UPDATE card_multipliers SET fallback_earn_rate = 2.00
WHERE card_id = (SELECT id FROM cards WHERE name = 'National Bank World Elite Mastercard')
  AND category_id IN (SELECT id FROM categories WHERE slug IN ('groceries', 'dining'))
  AND earn_rate = 5.00 AND fallback_earn_rate = 1.00;
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'National Bank World Elite Mastercard')
  AND category_id IN (SELECT id FROM categories WHERE slug IN ('gas-transit', 'recurring-bills', 'travel'))
  AND earn_rate = 2.00;
