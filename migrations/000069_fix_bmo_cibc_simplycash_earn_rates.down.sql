-- Reverse batch 10.

-- 5) SimplyCash: remove the added 2% gas + groceries bonuses.
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'SimplyCash Card from American Express')
  AND category_id = (SELECT id FROM categories WHERE slug = 'gas-transit')
  AND effective_to IS NULL AND earn_rate = 2.00 AND earn_type = 'cashback_pct';
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'SimplyCash Card from American Express')
  AND category_id = (SELECT id FROM categories WHERE slug = 'groceries')
  AND effective_to IS NULL AND earn_rate = 2.00 AND earn_type = 'cashback_pct';

-- 4) CIBC Dividend Visa: remove added 1% gas/dining/recurring; restore groceries to 1%.
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Dividend Visa Card')
  AND category_id = (SELECT id FROM categories WHERE slug = 'gas-transit')
  AND effective_to IS NULL AND earn_rate = 1.00 AND earn_type = 'cashback_pct';
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Dividend Visa Card')
  AND category_id = (SELECT id FROM categories WHERE slug = 'dining')
  AND effective_to IS NULL AND earn_rate = 1.00 AND earn_type = 'cashback_pct';
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Dividend Visa Card')
  AND category_id = (SELECT id FROM categories WHERE slug = 'recurring-bills')
  AND effective_to IS NULL AND earn_rate = 1.00 AND earn_type = 'cashback_pct';
UPDATE card_multipliers
SET earn_rate = 1.00, notes = '1% groceries'
WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Dividend Visa Card')
  AND category_id = (SELECT id FROM categories WHERE slug = 'groceries')
  AND effective_to IS NULL AND earn_rate = 2.00 AND earn_type = 'cashback_pct';

-- 3) CIBC Costco: restore gas cap to $8,000.
UPDATE card_multipliers
SET cap_amount = 8000.00, notes = '3% Costco gas; 2% other gas up to $8k/yr'
WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Costco Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'gas-transit')
  AND effective_to IS NULL AND earn_rate = 3.00 AND cap_amount = 5000.00;

-- 2) BMO Cash Back MC: move the 1% bonus back from recurring-bills to gas-transit.
UPDATE card_multipliers
SET category_id = (SELECT id FROM categories WHERE slug = 'gas-transit'),
    notes = '1% gas'
WHERE card_id = (SELECT id FROM cards WHERE name = 'BMO Cash Back Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'recurring-bills')
  AND effective_to IS NULL AND earn_rate = 1.00 AND earn_type = 'cashback_pct';

-- 1) BMO Ascend WE: restore the (incorrect) 3x streaming-digital row.
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, cap_amount, cap_period, fallback_earn_rate, effective_from, notes)
SELECT c.id, cat.id, 3.00, 'points', 10000.00, 'annual', 1.00, '2026-04-05', '3x recurring bills up to $10k/yr'
FROM cards c, categories cat
WHERE c.name = 'BMO Ascend World Elite Mastercard' AND cat.slug = 'streaming-digital'
  AND NOT EXISTS (SELECT 1 FROM card_multipliers m WHERE m.card_id=c.id AND m.category_id=cat.id AND m.effective_to IS NULL);
