-- Card-data correction batch 13 (2026-05-27; follows 000071).
-- Verified 2026-05-27 against Prince of Travel + Desjardins issuer site + RBC.
-- Sources:
--   RBC British Airways VI: princeoftravel.com/credit-cards/rbc-british-airways-visa-infinite/
--   RBC WestJet WE        : rbcroyalbank.com/credit-cards/travel/westjet-rbc-world-elite-mastercard.html
--   Desjardins CashBack WE: desjardins.com/en/credit-cards/cash-back-world-elite-mastercard.html (via milesopedia)
--   Desjardins Odyssey WE : princeoftravel.com/credit-cards/desjardins-odyssey-world-elite-mastercard/
--   Desjardins Cash Back V: desjardins.com/en/credit-cards/cash-back-visa.html

-- 1) RBC British Airways VI: 3 Avios on BA, 2 Avios dining, 1 Avios else.
--    DB had a flat 2x everywhere (base wrong; BA + dining tiers missing).
UPDATE card_multipliers
SET earn_rate = 1.00, fallback_earn_rate = 1.00,
    notes = '1 Avios per $1 base (PoT 2026-05-27)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'RBC British Airways Visa Infinite')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND effective_to IS NULL AND earn_rate = 2.00 AND earn_type = 'points';

INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT c.id, cat.id, v.rate, 'points', 1.00, '2026-05-27', v.note
FROM cards c
JOIN (VALUES
  ('travel', 3.00, '3 Avios on British Airways purchases (PoT 2026-05-27)'),
  ('dining', 2.00, '2 Avios on dining (PoT 2026-05-27)')
) AS v(slug, rate, note) ON TRUE
JOIN categories cat ON cat.slug = v.slug
WHERE c.name = 'RBC British Airways Visa Infinite'
  AND NOT EXISTS (SELECT 1 FROM card_multipliers m WHERE m.card_id=c.id AND m.category_id=cat.id AND m.effective_to IS NULL);

-- 2) RBC WestJet WE: 2x WestJet/groceries/gas/transit, 2x dining/streaming/digital,
--    1.5x else. DB was missing the 2x dining + 2x streaming tiers.
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT c.id, cat.id, 2.00, 'points', 1.50, '2026-05-27', v.note
FROM cards c
JOIN (VALUES
  ('dining', '2x dining/food delivery (rbcroyalbank.com 2026-05-27)'),
  ('streaming-digital', '2x streaming/digital subscriptions (rbcroyalbank.com 2026-05-27)')
) AS v(slug, note) ON TRUE
JOIN categories cat ON cat.slug = v.slug
WHERE c.name = 'RBC WestJet World Elite Mastercard'
  AND NOT EXISTS (SELECT 1 FROM card_multipliers m WHERE m.card_id=c.id AND m.category_id=cat.id AND m.effective_to IS NULL);

-- 3) Desjardins Cash Back World Elite: 4% groceries ($10k), 3% dining ($6k),
--    3% entertainment, 3% transit, 1% else. DB had groceries 3% (should be 4%) and a
--    fabricated "3% recurring bills" instead of the real dining/entertainment/transit.
UPDATE card_multipliers
SET earn_rate = 4.00,
    notes = '4% groceries up to $10k/yr (desjardins.com via milesopedia 2026-05-27)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'Desjardins Cash Back World Elite Visa')
  AND category_id = (SELECT id FROM categories WHERE slug = 'groceries')
  AND effective_to IS NULL AND earn_rate = 3.00 AND earn_type = 'cashback_pct';

DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'Desjardins Cash Back World Elite Visa')
  AND category_id = (SELECT id FROM categories WHERE slug = 'recurring-bills')
  AND effective_to IS NULL AND earn_rate = 3.00 AND earn_type = 'cashback_pct';

INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, cap_amount, cap_period, fallback_earn_rate, effective_from, notes)
SELECT c.id, cat.id, 3.00, 'cashback_pct', v.cap, v.period, 1.00, '2026-05-27', v.note
FROM cards c
JOIN (VALUES
  ('dining', 6000.00, 'annual', '3% restaurants up to $6k/yr (desjardins.com via milesopedia 2026-05-27)'),
  ('entertainment', NULL::numeric, NULL::text, '3% entertainment (desjardins.com via milesopedia 2026-05-27)'),
  ('gas-transit', NULL::numeric, NULL::text, '3% public transit (desjardins.com via milesopedia 2026-05-27)')
) AS v(slug, cap, period, note) ON TRUE
JOIN categories cat ON cat.slug = v.slug
WHERE c.name = 'Desjardins Cash Back World Elite Visa'
  AND NOT EXISTS (SELECT 1 FROM card_multipliers m WHERE m.card_id=c.id AND m.category_id=cat.id AND m.effective_to IS NULL);

-- 4) Desjardins Odyssey World Elite: PoT = 3% groceries, 2% restaurants/entertainment/
--    transit, 1.5% else. The seeded "2% travel" is not a real bonus category — remove
--    it (base 1.5% applies). Dining/entertainment/gas-transit 2% + groceries 3% stay.
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'Desjardins Odyssey World Elite Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'travel')
  AND effective_to IS NULL AND earn_rate = 2.00 AND earn_type = 'cashback_pct';

-- 5) Desjardins Cash Back Visa: issuer = 2% restaurants/entertainment/alt-transport/
--    pre-authorized payments, 0.5% else. DB had a flat 1% everywhere.
UPDATE card_multipliers
SET earn_rate = 0.50, fallback_earn_rate = 0.50,
    notes = '0.5% everything else (desjardins.com 2026-05-27)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'Desjardins Cash Back Visa')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND effective_to IS NULL AND earn_rate = 1.00 AND earn_type = 'cashback_pct';

INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT c.id, cat.id, 2.00, 'cashback_pct', 0.50, '2026-05-27', v.note
FROM cards c
JOIN (VALUES
  ('dining', '2% restaurants (desjardins.com 2026-05-27)'),
  ('entertainment', '2% entertainment (desjardins.com 2026-05-27)'),
  ('gas-transit', '2% alternative transportation (desjardins.com 2026-05-27)'),
  ('recurring-bills', '2% pre-authorized payments (desjardins.com 2026-05-27)')
) AS v(slug, note) ON TRUE
JOIN categories cat ON cat.slug = v.slug
WHERE c.name = 'Desjardins Cash Back Visa'
  AND NOT EXISTS (SELECT 1 FROM card_multipliers m WHERE m.card_id=c.id AND m.category_id=cat.id AND m.effective_to IS NULL);
