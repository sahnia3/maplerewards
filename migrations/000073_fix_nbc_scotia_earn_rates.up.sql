-- Card-data correction batch 14 (2026-05-27; follows 000072).
-- Verified 2026-05-27 against National Bank (nbc.ca) + Scotiabank issuer terms
-- (cross-checked via milesopedia 2026-05 and princeoftravel).
-- Sources:
--   NBC Allure / base   : nbc.ca/personal/mastercard-credit-cards/{allure,no-fee}.html
--   NBC Platinum        : nbc.ca/personal/mastercard-credit-cards/platinum.html (via milesopedia 2026-05)
--   Scotia Scene+ Visa  : scotiabank.com .../scene-card/welcome-kit/earning-sceneplus-points.html
--   Scotia Momentum NoFee: scotiabank.com .../momentum-no-fee-card.html

-- 1) NBC Allure: real product = flat 1 point per $2 (= 0.5x) across ALL categories.
--    The seeded 3x grocery / 2x dining / 2x gas tiers are fabricated. Remove them and
--    drop the base to 0.5x.
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'National Bank Allure Mastercard')
  AND category_id IN (SELECT id FROM categories WHERE slug IN ('groceries','dining','gas-transit'))
  AND effective_to IS NULL AND earn_type = 'points';
UPDATE card_multipliers
SET earn_rate = 0.50, fallback_earn_rate = 0.50,
    notes = '1 pt per $2 = 0.5x all categories (nbc.ca 2026-05-27)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'National Bank Allure Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND effective_to IS NULL AND earn_rate = 1.00 AND earn_type = 'points';

-- 2) NBC base Mastercard (no-fee): real = 1 point per $2 (= 0.5x) flat (DB had 1x).
UPDATE card_multipliers
SET earn_rate = 0.50, fallback_earn_rate = 0.50,
    notes = '1 pt per $2 = 0.5x all purchases (nbc.ca 2026-05-27)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'National Bank Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND effective_to IS NULL AND earn_rate = 1.00 AND earn_type = 'points';

-- 3) NBC Platinum: 2x grocery + restaurant (first $1,000/mo, 1.5x after), 1.5x gas/EV/
--    recurring/travel, 1 pt per $1.50 (= 0.67x) else. DB had dining 2x + a fabricated
--    entertainment 2x + an over-stated 1.5x base, and was missing groceries/gas/
--    recurring/travel. Restructure.
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'National Bank Platinum Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'entertainment')
  AND effective_to IS NULL AND earn_rate = 2.00 AND earn_type = 'points';
UPDATE card_multipliers
SET cap_amount = 1000.00, cap_period = 'monthly', fallback_earn_rate = 0.67,
    notes = '2x dining, first $1,000/mo (nbc.ca via milesopedia 2026-05-27)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'National Bank Platinum Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'dining')
  AND effective_to IS NULL AND earn_rate = 2.00 AND earn_type = 'points';
UPDATE card_multipliers
SET earn_rate = 0.67, fallback_earn_rate = 0.67,
    notes = '1 pt per $1.50 = 0.67x base (nbc.ca via milesopedia 2026-05-27)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'National Bank Platinum Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND effective_to IS NULL AND earn_rate = 1.50 AND earn_type = 'points';

INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, cap_amount, cap_period, fallback_earn_rate, effective_from, notes)
SELECT c.id, cat.id, v.rate, 'points', v.cap, v.period, 0.67, '2026-05-27', v.note
FROM cards c
JOIN (VALUES
  ('groceries', 2.00, 1000.00::numeric, 'monthly'::text, '2x groceries, first $1,000/mo (nbc.ca via milesopedia 2026-05-27)'),
  ('gas-transit', 1.50, NULL::numeric, NULL::text, '1.5x gas/EV (nbc.ca via milesopedia 2026-05-27)'),
  ('recurring-bills', 1.50, NULL::numeric, NULL::text, '1.5x recurring bills (nbc.ca via milesopedia 2026-05-27)'),
  ('travel', 1.50, NULL::numeric, NULL::text, '1.5x a la carte travel (nbc.ca via milesopedia 2026-05-27)')
) AS v(slug, rate, cap, period, note) ON TRUE
JOIN categories cat ON cat.slug = v.slug
WHERE c.name = 'National Bank Platinum Mastercard'
  AND NOT EXISTS (SELECT 1 FROM card_multipliers m WHERE m.card_id=c.id AND m.category_id=cat.id AND m.effective_to IS NULL);

-- 4) Scotia Scene+ Visa (no-fee): base 1x + 2x groceries + 2x entertainment (Cineplex).
--    DB had only the flat 1x base; add the two 2x bonus categories.
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT c.id, cat.id, 2.00, 'points', 1.00, '2026-05-27', v.note
FROM cards c
JOIN (VALUES
  ('groceries', '2x at Sobeys/Safeway/FreshCo/participating grocers (scotiabank.com 2026-05-27)'),
  ('entertainment', '2x at Cineplex (scotiabank.com 2026-05-27)')
) AS v(slug, note) ON TRUE
JOIN categories cat ON cat.slug = v.slug
WHERE c.name = 'Scotiabank Scene+ Visa'
  AND NOT EXISTS (SELECT 1 FROM card_multipliers m WHERE m.card_id=c.id AND m.category_id=cat.id AND m.effective_to IS NULL);

-- 5) Scotia Momentum No-Fee (both the Visa and the MC No-Fee twin): 1% gas/grocery/
--    drugstore/recurring, 0.5% else. DB had only gas + grocery 1%; add pharmacy +
--    recurring-bills 1% to both cards.
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT c.id, cat.id, 1.00, 'cashback_pct', 1.00, '2026-05-27', v.note
FROM cards c
JOIN (VALUES
  ('Scotiabank Momentum No-Fee Visa', 'pharmacy', '1% drugstore (scotiabank.com 2026-05-27)'),
  ('Scotiabank Momentum No-Fee Visa', 'recurring-bills', '1% recurring payments (scotiabank.com 2026-05-27)'),
  ('Scotia Momentum Mastercard No Fee', 'pharmacy', '1% drugstore (scotiabank.com 2026-05-27)'),
  ('Scotia Momentum Mastercard No Fee', 'recurring-bills', '1% recurring payments (scotiabank.com 2026-05-27)')
) AS v(card_name, slug, note) ON c.name = v.card_name
JOIN categories cat ON cat.slug = v.slug
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers m WHERE m.card_id=c.id AND m.category_id=cat.id AND m.effective_to IS NULL);
