-- Reverse batch 3: restore the pre-correction seed state.

-- Scotiabank Passport VI: grocery 2x -> 3x; re-add 2x travel.
UPDATE card_multipliers SET earn_rate = 3.00, notes = '3x at eligible grocery stores (Sobeys, IGA, FreshCo)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'Scotiabank Passport Visa Infinite')
  AND category_id = (SELECT id FROM categories WHERE slug = 'groceries') AND earn_rate = 2.00;

INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT (SELECT id FROM cards WHERE name = 'Scotiabank Passport Visa Infinite'), (SELECT id FROM categories WHERE slug = 'travel'),
       2.00, 'points', 1.00, '2026-04-05', '2x travel'
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers WHERE card_id = (SELECT id FROM cards WHERE name = 'Scotiabank Passport Visa Infinite') AND category_id = (SELECT id FROM categories WHERE slug = 'travel'));

-- CIBC Dividend VI: remove recurring-bills; re-add pharmacy 2% and travel 2%.
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Dividend Visa Infinite')
  AND category_id = (SELECT id FROM categories WHERE slug = 'recurring-bills') AND earn_rate = 2.00;

INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT (SELECT id FROM cards WHERE name = 'CIBC Dividend Visa Infinite'), (SELECT id FROM categories WHERE slug = 'pharmacy'),
       2.00, 'cashback_pct', 1.00, '2026-04-05', '2% recurring bill payments'
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Dividend Visa Infinite') AND category_id = (SELECT id FROM categories WHERE slug = 'pharmacy'));

INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT (SELECT id FROM cards WHERE name = 'CIBC Dividend Visa Infinite'), (SELECT id FROM categories WHERE slug = 'travel'),
       2.00, 'cashback_pct', 1.00, '2026-04-05', '2% transportation/travel'
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Dividend Visa Infinite') AND category_id = (SELECT id FROM categories WHERE slug = 'travel'));

-- TD First Class Travel VI: remove the five added category bonuses.
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'TD First Class Travel Visa Infinite')
  AND category_id IN (SELECT id FROM categories WHERE slug IN ('groceries', 'dining', 'gas-transit', 'streaming-digital', 'recurring-bills'));
