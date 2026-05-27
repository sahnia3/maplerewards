-- Reverse batch 12.

-- 6) Wealthsimple Cash Card: restore 1%.
UPDATE card_multipliers
SET earn_rate = 1.00, fallback_earn_rate = 1.00, notes = '1% cashback on all purchases'
WHERE card_id = (SELECT id FROM cards WHERE name = 'Wealthsimple Cash Card')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND effective_to IS NULL AND earn_rate = 0.00 AND earn_type = 'cashback_pct';

-- 5) Manulife Visa Platinum: remove the 2% groceries; restore base to 1.5%.
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'Manulife Visa Platinum')
  AND category_id = (SELECT id FROM categories WHERE slug = 'groceries')
  AND effective_to IS NULL AND earn_rate = 2.00 AND earn_type = 'cashback_pct';
UPDATE card_multipliers
SET earn_rate = 1.50, fallback_earn_rate = 1.00, notes = '1.5% everything with Manulife account'
WHERE card_id = (SELECT id FROM cards WHERE name = 'Manulife Visa Platinum')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND effective_to IS NULL AND earn_rate = 0.50 AND earn_type = 'cashback_pct';

-- 4) MBNA Smart Cash: remove $500/mo caps; restore base to 1%.
UPDATE card_multipliers
SET cap_amount = NULL, cap_period = NULL, notes = '2% gas'
WHERE card_id = (SELECT id FROM cards WHERE name = 'MBNA Smart Cash Platinum Plus Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'gas-transit')
  AND effective_to IS NULL AND earn_rate = 2.00 AND cap_amount = 500.00;
UPDATE card_multipliers
SET cap_amount = NULL, cap_period = NULL, notes = '2% groceries'
WHERE card_id = (SELECT id FROM cards WHERE name = 'MBNA Smart Cash Platinum Plus Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'groceries')
  AND effective_to IS NULL AND earn_rate = 2.00 AND cap_amount = 500.00;
UPDATE card_multipliers
SET earn_rate = 1.00, fallback_earn_rate = 1.00, notes = '1% everything else'
WHERE card_id = (SELECT id FROM cards WHERE name = 'MBNA Smart Cash Platinum Plus Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND effective_to IS NULL AND earn_rate = 0.50 AND earn_type = 'cashback_pct';

-- 3) RBC Cash Back Preferred WE: restore 2%.
UPDATE card_multipliers
SET earn_rate = 2.00, notes = '2% on all purchases'
WHERE card_id = (SELECT id FROM cards WHERE name = 'RBC Cash Back Preferred World Elite Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND effective_to IS NULL AND earn_rate = 1.50 AND earn_type = 'cashback_pct';

-- 2) Brim World Elite: restore 2x / $25k cap.
UPDATE card_multipliers
SET earn_rate = 2.00, cap_amount = 25000.00, cap_period = 'annual', fallback_earn_rate = 1.00,
    notes = '2x on all purchases up to $25k/yr; reduced FX fee 1.5%'
WHERE card_id = (SELECT id FROM cards WHERE name = 'Brim World Elite Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND effective_to IS NULL AND earn_rate = 1.00 AND cap_amount IS NULL;

-- 1) Brim Mastercard: restore 1x.
UPDATE card_multipliers
SET earn_rate = 1.00, fallback_earn_rate = 1.00, notes = '1x everything, no FX fees'
WHERE card_id = (SELECT id FROM cards WHERE name = 'Brim Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND effective_to IS NULL AND earn_rate = 0.50 AND earn_type = 'points';
