-- Reverse batch 14.

-- 5) Scotia Momentum No-Fee (both): remove the added pharmacy + recurring-bills 1%.
DELETE FROM card_multipliers
WHERE card_id IN (SELECT id FROM cards WHERE name IN ('Scotiabank Momentum No-Fee Visa','Scotia Momentum Mastercard No Fee'))
  AND category_id IN (SELECT id FROM categories WHERE slug IN ('pharmacy','recurring-bills'))
  AND effective_to IS NULL AND earn_rate = 1.00 AND earn_type = 'cashback_pct';

-- 4) Scotia Scene+ Visa: remove the added 2x groceries + entertainment.
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'Scotiabank Scene+ Visa')
  AND category_id IN (SELECT id FROM categories WHERE slug IN ('groceries','entertainment'))
  AND effective_to IS NULL AND earn_rate = 2.00 AND earn_type = 'points';

-- 3) NBC Platinum: remove groceries/gas/recurring/travel; restore entertainment 2x;
--    restore dining (drop cap), base to 1.5x.
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'National Bank Platinum Mastercard')
  AND category_id IN (SELECT id FROM categories WHERE slug IN ('groceries','gas-transit','recurring-bills','travel'))
  AND effective_to IS NULL AND earn_type = 'points';
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT c.id, cat.id, 2.00, 'points', 1.00, '2026-04-05', '2x entertainment'
FROM cards c, categories cat
WHERE c.name = 'National Bank Platinum Mastercard' AND cat.slug = 'entertainment'
  AND NOT EXISTS (SELECT 1 FROM card_multipliers m WHERE m.card_id=c.id AND m.category_id=cat.id AND m.effective_to IS NULL);
UPDATE card_multipliers
SET cap_amount = NULL, cap_period = NULL, fallback_earn_rate = 1.50, notes = '2x dining'
WHERE card_id = (SELECT id FROM cards WHERE name = 'National Bank Platinum Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'dining')
  AND effective_to IS NULL AND earn_rate = 2.00 AND earn_type = 'points';
UPDATE card_multipliers
SET earn_rate = 1.50, fallback_earn_rate = 1.00, notes = '1.5x everything else'
WHERE card_id = (SELECT id FROM cards WHERE name = 'National Bank Platinum Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND effective_to IS NULL AND earn_rate = 0.67 AND earn_type = 'points';

-- 2) NBC base Mastercard: restore 1x.
UPDATE card_multipliers
SET earn_rate = 1.00, fallback_earn_rate = 1.00, notes = '1x everything'
WHERE card_id = (SELECT id FROM cards WHERE name = 'National Bank Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND effective_to IS NULL AND earn_rate = 0.50 AND earn_type = 'points';

-- 1) NBC Allure: restore base 1x and the (incorrect) 3x grocery / 2x dining / 2x gas tiers.
UPDATE card_multipliers
SET earn_rate = 1.00, fallback_earn_rate = 1.00, notes = '1x everything else'
WHERE card_id = (SELECT id FROM cards WHERE name = 'National Bank Allure Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND effective_to IS NULL AND earn_rate = 0.50 AND earn_type = 'points';
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT c.id, cat.id, v.rate, 'points', 1.00, '2026-04-05', v.note
FROM cards c
JOIN (VALUES
  ('groceries', 3.00, '3x groceries'),
  ('dining', 2.00, '2x dining'),
  ('gas-transit', 2.00, '2x gas')
) AS v(slug, rate, note) ON TRUE
JOIN categories cat ON cat.slug = v.slug
WHERE c.name = 'National Bank Allure Mastercard'
  AND NOT EXISTS (SELECT 1 FROM card_multipliers m WHERE m.card_id=c.id AND m.category_id=cat.id AND m.effective_to IS NULL);
