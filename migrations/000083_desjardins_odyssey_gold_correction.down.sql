-- Reverse the Desjardins Odyssey Gold Visa correction, restoring the prior seed state.

-- 5'. Remove the four added category multipliers.
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'Desjardins Odyssey Visa Gold')
  AND category_id IN (SELECT id FROM categories WHERE slug IN ('entertainment','gas-transit','recurring-bills','travel'))
  AND earn_type = 'points'
  AND effective_from = DATE '2026-04-05';

-- 4'. Restore dining fallback 0.65 -> 1.00.
UPDATE card_multipliers SET fallback_earn_rate = 1.00
WHERE card_id = (SELECT id FROM cards WHERE name = 'Desjardins Odyssey Visa Gold')
  AND category_id = (SELECT id FROM categories WHERE slug = 'dining')
  AND earn_rate = 2.00 AND earn_type = 'points' AND fallback_earn_rate = 0.65;

-- 3'. Restore everything-else 0.65 -> 1.50 (fallback back to 1.00).
UPDATE card_multipliers SET earn_rate = 1.50, fallback_earn_rate = 1.00
WHERE card_id = (SELECT id FROM cards WHERE name = 'Desjardins Odyssey Visa Gold')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND earn_rate = 0.65 AND earn_type = 'points';

-- 2'. Re-insert the phantom grocery 2x row (exact prior state).
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from)
SELECT (SELECT id FROM cards WHERE name = 'Desjardins Odyssey Visa Gold'),
       (SELECT id FROM categories WHERE slug = 'groceries'),
       2.00, 'points', 1.00, DATE '2026-04-05'
ON CONFLICT (card_id, category_id, effective_from) DO NOTHING;

-- 1'. Restore annual fee 110 -> 70.
UPDATE cards SET annual_fee = 70.00
WHERE name = 'Desjardins Odyssey Visa Gold' AND annual_fee = 110.00;
