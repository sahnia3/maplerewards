-- Card-data correction batch 12 (2026-05-27; follows 000070).
-- Verified 2026-05-27 against Prince of Travel earn tables + issuer/aggregator sites.
-- Sources:
--   Brim MC / Brim WE : princeoftravel.com/credit-cards/brim-mastercard/ , /brim-world-elite-mastercard/
--   RBC CashBack Pref WE: princeoftravel.com/credit-cards/rbc-cash-back-preferred-world-elite-mastercard/
--   MBNA Smart Cash   : mbna.ca/en/credit-cards/cash-back/smart-cash-mastercard (via milesopedia 2026-05)
--   Manulife Platinum : manulifebank.ca (via money.ca / milesopedia 2026-05)
--   Wealthsimple Cash : wealthsimple.com/en-ca help centre (cashback ended Oct 2025)

-- 1) Brim Mastercard: PoT base earn = 0.5x all purchases (DB had 1x).
UPDATE card_multipliers
SET earn_rate = 0.50, fallback_earn_rate = 0.50,
    notes = '0.5x all purchases, no FX fees (PoT 2026-05-27)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'Brim Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND effective_to IS NULL AND earn_rate = 1.00 AND earn_type = 'points';

-- 2) Brim World Elite: PoT base earn = 1x all purchases, no annual cap (DB had 2x/$25k).
UPDATE card_multipliers
SET earn_rate = 1.00, cap_amount = NULL, cap_period = NULL, fallback_earn_rate = 1.00,
    notes = '1x all purchases; reduced FX fee 1.5% (PoT 2026-05-27)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'Brim World Elite Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND effective_to IS NULL AND earn_rate = 2.00 AND cap_amount = 25000.00;

-- 3) RBC Cash Back Preferred World Elite: PoT = 1.5% all purchases (up to $25k/yr,
--    1% after). DB had 2% (the 1.5% rate was mis-entered as 2%).
UPDATE card_multipliers
SET earn_rate = 1.50,
    notes = '1.5% all purchases up to $25k/yr, 1% after (PoT 2026-05-27)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'RBC Cash Back Preferred World Elite Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND effective_to IS NULL AND earn_rate = 2.00 AND earn_type = 'cashback_pct';

-- 4) MBNA Smart Cash Platinum Plus: 2% gas & groceries on first $500/mo combined,
--    0.5% else (DB base was 1%, and the $500/mo cap was missing).
UPDATE card_multipliers
SET earn_rate = 0.50, fallback_earn_rate = 0.50,
    notes = '0.5% everything else (mbna.ca via milesopedia 2026-05-27)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'MBNA Smart Cash Platinum Plus Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND effective_to IS NULL AND earn_rate = 1.00 AND earn_type = 'cashback_pct';

UPDATE card_multipliers
SET cap_amount = 500.00, cap_period = 'monthly',
    notes = '2% gas, first $500/mo combined gas+grocery (mbna.ca via milesopedia 2026-05-27)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'MBNA Smart Cash Platinum Plus Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'gas-transit')
  AND effective_to IS NULL AND earn_rate = 2.00 AND cap_amount IS NULL;

UPDATE card_multipliers
SET cap_amount = 500.00, cap_period = 'monthly',
    notes = '2% groceries, first $500/mo combined gas+grocery (mbna.ca via milesopedia 2026-05-27)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'MBNA Smart Cash Platinum Plus Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'groceries')
  AND effective_to IS NULL AND earn_rate = 2.00 AND cap_amount IS NULL;

-- 5) Manulife Visa Platinum: 2% groceries (first $15k/yr), 0.5% else.
--    DB had a flat 1.5% which does not match the product.
UPDATE card_multipliers
SET earn_rate = 0.50, fallback_earn_rate = 0.50,
    notes = '0.5% everything else (manulifebank.ca via money.ca 2026-05-27)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'Manulife Visa Platinum')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND effective_to IS NULL AND earn_rate = 1.50 AND earn_type = 'cashback_pct';

INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, cap_amount, cap_period, fallback_earn_rate, effective_from, notes)
SELECT c.id, cat.id, 2.00, 'cashback_pct', 15000.00, 'annual', 0.50, '2026-05-27', '2% groceries up to $15k/yr (manulifebank.ca via money.ca 2026-05-27)'
FROM cards c, categories cat
WHERE c.name = 'Manulife Visa Platinum' AND cat.slug = 'groceries'
  AND NOT EXISTS (SELECT 1 FROM card_multipliers m WHERE m.card_id=c.id AND m.category_id=cat.id AND m.effective_to IS NULL);

-- 6) Wealthsimple Cash Card: cash back on the prepaid Cash card was REMOVED in
--    Oct 2025 (now 0%). DB still carried 1%. Set to 0%.
UPDATE card_multipliers
SET earn_rate = 0.00, fallback_earn_rate = 0.00,
    notes = '0% cashback (Wealthsimple ended Cash card cashback Oct 2025; wealthsimple.com 2026-05-27)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'Wealthsimple Cash Card')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND effective_to IS NULL AND earn_rate = 1.00 AND earn_type = 'cashback_pct';
