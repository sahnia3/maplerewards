-- Card-data correction batch 10 (2026-05-27; follows 000059-000068).
-- Verified against Prince of Travel earn tables + issuer sites (fetched 2026-05-27).
-- Sources:
--   BMO Ascend WE   : princeoftravel.com/credit-cards/bmo-ascend-world-elite-mastercard/
--   BMO Cash Back MC: princeoftravel.com/credit-cards/bmo-cashback-mastercard/
--   CIBC Costco MC  : princeoftravel.com/credit-cards/cibc-costco-mastercard/
--   CIBC Dividend   : princeoftravel.com/credit-cards/cibc-dividend-visa-card/
--   SimplyCash Amex : princeoftravel.com/credit-cards/simplycash-card-from-american-express/
-- All statements guard on the known pre-value; keyed by card NAME + category SLUG.

-- 1) BMO Ascend WE: PoT lists ONLY 5x travel + 3x Dining & Entertainment + 1x else.
--    The seeded "3x streaming-digital" (mislabelled "3x recurring bills") is NOT a
--    real bonus category on this card. Remove it (dining 3x + entertainment 3x stay).
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'BMO Ascend World Elite Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'streaming-digital')
  AND effective_to IS NULL
  AND earn_rate = 3.00 AND earn_type = 'points';

-- 2) BMO Cash Back MC: PoT = 3% groceries ($500/mo), 1% RECURRING BILLS, 0.5% else.
--    DB had the 1% bonus mislabelled as gas-transit. Re-point it to recurring-bills.
UPDATE card_multipliers
SET category_id = (SELECT id FROM categories WHERE slug = 'recurring-bills'),
    notes = '1% recurring bill payments (PoT 2026-05-27)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'BMO Cash Back Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'gas-transit')
  AND effective_to IS NULL
  AND earn_rate = 1.00 AND earn_type = 'cashback_pct';

-- 3) CIBC Costco MC: elevated gas (3% Costco / 2% other) is capped at FIRST $5,000/yr,
--    not $8,000 (the $8,000 cap applies only to Costco.ca, modelled as groceries).
UPDATE card_multipliers
SET cap_amount = 5000.00,
    notes = '3% Costco gas; 2% other gas up to $5k/yr (PoT 2026-05-27)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Costco Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'gas-transit')
  AND effective_to IS NULL
  AND earn_rate = 3.00 AND cap_amount = 8000.00;

-- 4) CIBC Dividend Visa Card (no-fee): PoT = 2% groceries, 1% gas/transit/dining/
--    recurring bills, 0.5% else. DB had groceries at 1% and was missing the 1% tier.
UPDATE card_multipliers
SET earn_rate = 2.00,
    notes = '2% groceries (PoT 2026-05-27)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Dividend Visa Card')
  AND category_id = (SELECT id FROM categories WHERE slug = 'groceries')
  AND effective_to IS NULL
  AND earn_rate = 1.00 AND earn_type = 'cashback_pct';

INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT c.id, cat.id, 1.00, 'cashback_pct', 1.00, '2026-05-27', '1% gas/transit (PoT 2026-05-27)'
FROM cards c, categories cat
WHERE c.name = 'CIBC Dividend Visa Card' AND cat.slug = 'gas-transit'
  AND NOT EXISTS (SELECT 1 FROM card_multipliers m WHERE m.card_id=c.id AND m.category_id=cat.id AND m.effective_to IS NULL);

INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT c.id, cat.id, 1.00, 'cashback_pct', 1.00, '2026-05-27', '1% dining (PoT 2026-05-27)'
FROM cards c, categories cat
WHERE c.name = 'CIBC Dividend Visa Card' AND cat.slug = 'dining'
  AND NOT EXISTS (SELECT 1 FROM card_multipliers m WHERE m.card_id=c.id AND m.category_id=cat.id AND m.effective_to IS NULL);

INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT c.id, cat.id, 1.00, 'cashback_pct', 1.00, '2026-05-27', '1% recurring bills (PoT 2026-05-27)'
FROM cards c, categories cat
WHERE c.name = 'CIBC Dividend Visa Card' AND cat.slug = 'recurring-bills'
  AND NOT EXISTS (SELECT 1 FROM card_multipliers m WHERE m.card_id=c.id AND m.category_id=cat.id AND m.effective_to IS NULL);

-- 5) SimplyCash Card from Amex: PoT = 2% gas & groceries, 1.25% else. DB had only the
--    1.25% base; add the 2% gas-transit + groceries bonus categories.
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT c.id, cat.id, 2.00, 'cashback_pct', 1.25, '2026-05-27', '2% gas (PoT 2026-05-27)'
FROM cards c, categories cat
WHERE c.name = 'SimplyCash Card from American Express' AND cat.slug = 'gas-transit'
  AND NOT EXISTS (SELECT 1 FROM card_multipliers m WHERE m.card_id=c.id AND m.category_id=cat.id AND m.effective_to IS NULL);

INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT c.id, cat.id, 2.00, 'cashback_pct', 1.25, '2026-05-27', '2% groceries (PoT 2026-05-27)'
FROM cards c, categories cat
WHERE c.name = 'SimplyCash Card from American Express' AND cat.slug = 'groceries'
  AND NOT EXISTS (SELECT 1 FROM card_multipliers m WHERE m.card_id=c.id AND m.category_id=cat.id AND m.effective_to IS NULL);
