-- Reverse batch 11.

-- 4) RBC Rewards+ Visa: remove the 1x gas/grocery/pharmacy tier; restore base to 1x.
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'RBC Rewards+ Visa')
  AND category_id IN (SELECT id FROM categories WHERE slug IN ('gas-transit','groceries','pharmacy'))
  AND effective_to IS NULL AND earn_rate = 1.00 AND earn_type = 'points';
UPDATE card_multipliers
SET earn_rate = 1.00, fallback_earn_rate = 1.00, notes = '1x everything'
WHERE card_id = (SELECT id FROM cards WHERE name = 'RBC Rewards+ Visa')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND effective_to IS NULL AND earn_rate = 0.50 AND earn_type = 'points';

-- 3) Neo World Elite: move the 4% bonus back to streaming-digital.
UPDATE card_multipliers
SET category_id = (SELECT id FROM categories WHERE slug = 'streaming-digital'),
    notes = '4% on recurring bills'
WHERE card_id = (SELECT id FROM cards WHERE name = 'Neo World Elite Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'recurring-bills')
  AND effective_to IS NULL AND earn_rate = 4.00 AND earn_type = 'cashback_pct';

-- 2) TD Aeroplan Visa Platinum: remove 1x gas/groceries; restore travel 1.5x, base 1x.
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'TD Aeroplan Visa Platinum')
  AND category_id IN (SELECT id FROM categories WHERE slug IN ('gas-transit','groceries'))
  AND effective_to IS NULL AND earn_rate = 1.00 AND earn_type = 'points';
UPDATE card_multipliers
SET earn_rate = 0.67, fallback_earn_rate = 1.00, notes = '1x everything else'
WHERE FALSE; -- placeholder, no-op (kept for symmetry)
UPDATE card_multipliers
SET earn_rate = 1.00, fallback_earn_rate = 1.00, notes = '1x everything else'
WHERE card_id = (SELECT id FROM cards WHERE name = 'TD Aeroplan Visa Platinum')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND effective_to IS NULL AND earn_rate = 0.67 AND earn_type = 'points';
UPDATE card_multipliers
SET earn_rate = 1.50, notes = '1.5x travel'
WHERE card_id = (SELECT id FROM cards WHERE name = 'TD Aeroplan Visa Platinum')
  AND category_id = (SELECT id FROM categories WHERE slug = 'travel')
  AND effective_to IS NULL AND earn_rate = 1.00 AND earn_type = 'points';

-- 1) TD Rewards Visa Card: remove the 6 added category tiers; restore base to flat 2x.
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'TD Rewards Visa Card')
  AND category_id IN (SELECT id FROM categories WHERE slug IN
      ('travel','groceries','dining','gas-transit','recurring-bills','streaming-digital'))
  AND effective_to IS NULL AND earn_type = 'points';
UPDATE card_multipliers
SET earn_rate = 2.00, fallback_earn_rate = 1.00, notes = '2x TD Rewards everywhere'
WHERE card_id = (SELECT id FROM cards WHERE name = 'TD Rewards Visa Card')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND effective_to IS NULL AND earn_rate = 1.00 AND earn_type = 'points';
