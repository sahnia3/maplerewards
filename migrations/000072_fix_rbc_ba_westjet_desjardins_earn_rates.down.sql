-- Reverse batch 13.

-- 5) Desjardins Cash Back Visa: remove the 4 bonus categories; restore flat 1%.
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'Desjardins Cash Back Visa')
  AND category_id IN (SELECT id FROM categories WHERE slug IN ('dining','entertainment','gas-transit','recurring-bills'))
  AND effective_to IS NULL AND earn_rate = 2.00 AND earn_type = 'cashback_pct';
UPDATE card_multipliers
SET earn_rate = 1.00, fallback_earn_rate = 1.00, notes = '1% everywhere'
WHERE card_id = (SELECT id FROM cards WHERE name = 'Desjardins Cash Back Visa')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND effective_to IS NULL AND earn_rate = 0.50 AND earn_type = 'cashback_pct';

-- 4) Desjardins Odyssey WE: restore the 2% travel row.
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT c.id, cat.id, 2.00, 'cashback_pct', 1.50, '2026-04-05', '2% travel'
FROM cards c, categories cat
WHERE c.name = 'Desjardins Odyssey World Elite Mastercard' AND cat.slug = 'travel'
  AND NOT EXISTS (SELECT 1 FROM card_multipliers m WHERE m.card_id=c.id AND m.category_id=cat.id AND m.effective_to IS NULL);

-- 3) Desjardins Cash Back WE: remove dining/entertainment/transit 3%; restore recurring
--    bills 3%; restore groceries to 3%.
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'Desjardins Cash Back World Elite Visa')
  AND category_id IN (SELECT id FROM categories WHERE slug IN ('dining','entertainment','gas-transit'))
  AND effective_to IS NULL AND earn_rate = 3.00 AND earn_type = 'cashback_pct';
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT c.id, cat.id, 3.00, 'cashback_pct', 1.00, '2026-04-05', '3% recurring bills'
FROM cards c, categories cat
WHERE c.name = 'Desjardins Cash Back World Elite Visa' AND cat.slug = 'recurring-bills'
  AND NOT EXISTS (SELECT 1 FROM card_multipliers m WHERE m.card_id=c.id AND m.category_id=cat.id AND m.effective_to IS NULL);
UPDATE card_multipliers
SET earn_rate = 3.00, notes = '3% groceries'
WHERE card_id = (SELECT id FROM cards WHERE name = 'Desjardins Cash Back World Elite Visa')
  AND category_id = (SELECT id FROM categories WHERE slug = 'groceries')
  AND effective_to IS NULL AND earn_rate = 4.00 AND earn_type = 'cashback_pct';

-- 2) RBC WestJet WE: remove the added 2x dining + 2x streaming.
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'RBC WestJet World Elite Mastercard')
  AND category_id IN (SELECT id FROM categories WHERE slug IN ('dining','streaming-digital'))
  AND effective_to IS NULL AND earn_rate = 2.00 AND earn_type = 'points';

-- 1) RBC British Airways VI: remove BA travel 3x + dining 2x; restore flat 2x base.
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'RBC British Airways Visa Infinite')
  AND category_id IN (SELECT id FROM categories WHERE slug IN ('travel','dining'))
  AND effective_to IS NULL AND earn_type = 'points';
UPDATE card_multipliers
SET earn_rate = 2.00, fallback_earn_rate = 1.00, notes = '2x Avios on everything'
WHERE card_id = (SELECT id FROM cards WHERE name = 'RBC British Airways Visa Infinite')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND effective_to IS NULL AND earn_rate = 1.00 AND earn_type = 'points';
