-- Card-data correction batch 11 (2026-05-27; follows 000069).
-- Verified 2026-05-27 against Prince of Travel earn tables + issuer/aggregator sites.
-- Sources:
--   TD Rewards Visa     : princeoftravel.com/credit-cards/td-rewards-visa-card/
--   TD Aeroplan Platinum: td.com aeroplan-visa-platinum-card (via milesopedia 2026-05)
--   Neo World Elite     : princeoftravel.com/credit-cards/neo-world-elite-mastercard/
--   RBC Rewards+ Visa   : rbcroyalbank.com/credit-cards/rewards/rbc-rewards-plus.html

-- 1) TD Rewards Visa Card: PoT = 4x Expedia(travel), 3x grocery/dining/transit,
--    2x bills/streaming, 1x else. DB was seeded flat 2x everywhere (base wrong;
--    all category bonuses missing). Fix base to 1x and add the bonus tiers.
UPDATE card_multipliers
SET earn_rate = 1.00, fallback_earn_rate = 1.00,
    notes = '1x everything else (PoT 2026-05-27)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'TD Rewards Visa Card')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND effective_to IS NULL AND earn_rate = 2.00 AND earn_type = 'points';

INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT c.id, cat.id, v.rate, 'points', 1.00, '2026-05-27', v.note
FROM cards c
JOIN (VALUES
  ('travel', 4.00, '4x Expedia for TD travel (PoT 2026-05-27)'),
  ('groceries', 3.00, '3x groceries (PoT 2026-05-27)'),
  ('dining', 3.00, '3x dining (PoT 2026-05-27)'),
  ('gas-transit', 3.00, '3x transit (PoT 2026-05-27)'),
  ('recurring-bills', 2.00, '2x bills (PoT 2026-05-27)'),
  ('streaming-digital', 2.00, '2x streaming (PoT 2026-05-27)')
) AS v(slug, rate, note) ON TRUE
JOIN categories cat ON cat.slug = v.slug
WHERE c.name = 'TD Rewards Visa Card'
  AND NOT EXISTS (SELECT 1 FROM card_multipliers m WHERE m.card_id=c.id AND m.category_id=cat.id AND m.effective_to IS NULL);

-- 2) TD Aeroplan Visa Platinum: real = 1 Aeroplan pt/$ on gas/EV/grocery/Air Canada,
--    1 pt per $1.50 (= 0.67x) on everything else. The seeded "1.5x travel" tier does
--    not exist on the Platinum (that is the Visa Infinite). Air Canada = 1x (travel).
UPDATE card_multipliers
SET earn_rate = 1.00, notes = '1x Air Canada / travel (td.com via milesopedia 2026-05-27)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'TD Aeroplan Visa Platinum')
  AND category_id = (SELECT id FROM categories WHERE slug = 'travel')
  AND effective_to IS NULL AND earn_rate = 1.50 AND earn_type = 'points';

UPDATE card_multipliers
SET earn_rate = 0.67, fallback_earn_rate = 0.67,
    notes = '1 pt per $1.50 = 0.67x base (td.com via milesopedia 2026-05-27)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'TD Aeroplan Visa Platinum')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND effective_to IS NULL AND earn_rate = 1.00 AND earn_type = 'points';

INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT c.id, cat.id, 1.00, 'points', 0.67, '2026-05-27', v.note
FROM cards c
JOIN (VALUES
  ('gas-transit', '1x gas/EV (td.com via milesopedia 2026-05-27)'),
  ('groceries', '1x groceries (td.com via milesopedia 2026-05-27)')
) AS v(slug, note) ON TRUE
JOIN categories cat ON cat.slug = v.slug
WHERE c.name = 'TD Aeroplan Visa Platinum'
  AND NOT EXISTS (SELECT 1 FROM card_multipliers m WHERE m.card_id=c.id AND m.category_id=cat.id AND m.effective_to IS NULL);

-- 3) Neo World Elite: base-tier cash back is 5% groceries / 4% RECURRING BILLS /
--    3% gas / 1% else. The 4% bonus was seeded against streaming-digital (the notes
--    even say "4% on recurring bills"). Re-point it to recurring-bills.
UPDATE card_multipliers
SET category_id = (SELECT id FROM categories WHERE slug = 'recurring-bills'),
    notes = '4% recurring bills, first $500/mo (PoT 2026-05-27)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'Neo World Elite Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'streaming-digital')
  AND effective_to IS NULL AND earn_rate = 4.00 AND earn_type = 'cashback_pct';

-- 4) RBC Rewards+ Visa: real = 1 RBC Rewards pt/$ on gas/grocery/drugstore,
--    1 pt per $2 (= 0.5x) on everything else. DB had flat 1x. Fix base to 0.5x and
--    add the 1x gas/grocery/pharmacy bonus tier.
--    NOTE (flag, not fixed here): this card earns RBC *Rewards* points (~0.5c each),
--    not RBC *Avion* (1.1c) which is its current loyalty_program mapping — see report.
UPDATE card_multipliers
SET earn_rate = 0.50, fallback_earn_rate = 0.50,
    notes = '1 pt per $2 = 0.5x base (rbcroyalbank.com 2026-05-27)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'RBC Rewards+ Visa')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND effective_to IS NULL AND earn_rate = 1.00 AND earn_type = 'points';

INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT c.id, cat.id, 1.00, 'points', 0.50, '2026-05-27', v.note
FROM cards c
JOIN (VALUES
  ('gas-transit', '1x gas (rbcroyalbank.com 2026-05-27)'),
  ('groceries', '1x groceries (rbcroyalbank.com 2026-05-27)'),
  ('pharmacy', '1x drugstore (rbcroyalbank.com 2026-05-27)')
) AS v(slug, note) ON TRUE
JOIN categories cat ON cat.slug = v.slug
WHERE c.name = 'RBC Rewards+ Visa'
  AND NOT EXISTS (SELECT 1 FROM card_multipliers m WHERE m.card_id=c.id AND m.category_id=cat.id AND m.effective_to IS NULL);
