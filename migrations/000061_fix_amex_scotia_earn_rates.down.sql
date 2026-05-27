-- Reverse 000061: restore the pre-correction (incorrect) seed state exactly.

-- Amex Cobalt: streaming 3x -> 5x; re-add the 2x travel row.
UPDATE card_multipliers SET earn_rate = 5.00, notes = '5x on eligible streaming subscriptions'
WHERE card_id = (SELECT id FROM cards WHERE name = 'Amex Cobalt')
  AND category_id = (SELECT id FROM categories WHERE slug = 'streaming-digital')
  AND earn_rate = 3.00;

INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT (SELECT id FROM cards WHERE name = 'Amex Cobalt'), (SELECT id FROM categories WHERE slug = 'travel'),
       2.00, 'points', 1.00, '2026-04-05', '2x on eligible travel purchases'
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers
  WHERE card_id = (SELECT id FROM cards WHERE name = 'Amex Cobalt')
    AND category_id = (SELECT id FROM categories WHERE slug = 'travel'));

-- Amex Platinum: dining/travel 2x -> 3x (restore NULL notes).
UPDATE card_multipliers SET earn_rate = 3.00, notes = NULL
WHERE card_id = (SELECT id FROM cards WHERE name = 'Amex Platinum')
  AND category_id = (SELECT id FROM categories WHERE slug = 'dining') AND earn_rate = 2.00;
UPDATE card_multipliers SET earn_rate = 3.00, notes = NULL
WHERE card_id = (SELECT id FROM cards WHERE name = 'Amex Platinum')
  AND category_id = (SELECT id FROM categories WHERE slug = 'travel') AND earn_rate = 2.00;

-- Amex Gold Rewards: re-add the 2x dining row.
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT (SELECT id FROM cards WHERE name = 'Amex Gold Rewards'), (SELECT id FROM categories WHERE slug = 'dining'),
       2.00, 'points', 1.00, '2026-04-05', NULL
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers
  WHERE card_id = (SELECT id FROM cards WHERE name = 'Amex Gold Rewards')
    AND category_id = (SELECT id FROM categories WHERE slug = 'dining'));

-- Scotiabank Platinum Amex: base 2x -> 1x; re-add 5x dining, 5x entertainment, 3x travel.
UPDATE card_multipliers SET earn_rate = 1.00, notes = '1x everything else'
WHERE card_id = (SELECT id FROM cards WHERE name = 'Scotiabank Platinum American Express')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else') AND earn_rate = 2.00;

INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT (SELECT id FROM cards WHERE name = 'Scotiabank Platinum American Express'), (SELECT id FROM categories WHERE slug = 'dining'),
       5.00, 'points', 1.00, '2026-04-05', '5x dining'
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers WHERE card_id = (SELECT id FROM cards WHERE name = 'Scotiabank Platinum American Express') AND category_id = (SELECT id FROM categories WHERE slug = 'dining'));
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT (SELECT id FROM cards WHERE name = 'Scotiabank Platinum American Express'), (SELECT id FROM categories WHERE slug = 'entertainment'),
       5.00, 'points', 1.00, '2026-04-05', '5x entertainment'
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers WHERE card_id = (SELECT id FROM cards WHERE name = 'Scotiabank Platinum American Express') AND category_id = (SELECT id FROM categories WHERE slug = 'entertainment'));
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT (SELECT id FROM cards WHERE name = 'Scotiabank Platinum American Express'), (SELECT id FROM categories WHERE slug = 'travel'),
       3.00, 'points', 1.00, '2026-04-05', '3x travel'
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers WHERE card_id = (SELECT id FROM cards WHERE name = 'Scotiabank Platinum American Express') AND category_id = (SELECT id FROM categories WHERE slug = 'travel'));

-- Structural dupes: re-insert the stale 2026-04-05 twins.
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT (SELECT id FROM cards WHERE name = 'American Express Business Edge'), (SELECT id FROM categories WHERE slug = 'everything-else'),
       1.00, 'points', 1.00, '2026-04-05', '1x everything else'
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers WHERE card_id = (SELECT id FROM cards WHERE name = 'American Express Business Edge') AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else') AND effective_from = '2026-04-05');
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT (SELECT id FROM cards WHERE name = 'American Express Platinum Business'), (SELECT id FROM categories WHERE slug = 'everything-else'),
       1.50, 'points', 1.00, '2026-04-05', '1.5x everything else'
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers WHERE card_id = (SELECT id FROM cards WHERE name = 'American Express Platinum Business') AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else') AND effective_from = '2026-04-05');

-- MBNA dining: restore cap $5,000 -> $50,000, then re-add the stale 2x@2026-04-05 row.
UPDATE card_multipliers SET cap_amount = 50000.00
WHERE card_id = (SELECT id FROM cards WHERE name = 'MBNA Rewards World Elite Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'dining') AND earn_rate = 5.00 AND cap_amount = 5000.00;
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, cap_amount, cap_period, fallback_earn_rate, effective_from, notes)
SELECT (SELECT id FROM cards WHERE name = 'MBNA Rewards World Elite Mastercard'), (SELECT id FROM categories WHERE slug = 'dining'),
       2.00, 'points', 50000.00, 'annual', 1.00, '2026-04-05', '2x dining'
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers WHERE card_id = (SELECT id FROM cards WHERE name = 'MBNA Rewards World Elite Mastercard') AND category_id = (SELECT id FROM categories WHERE slug = 'dining') AND effective_from = '2026-04-05');
