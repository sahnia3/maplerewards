-- Card-data correction batch 5 (2026-05-27; follows 000059-000063).
-- Verified vs Prince of Travel earn tables (2026-02). Idempotent pre-value
-- guards; exact .down.sql reverse.

-- ── BMO eclipse VI ──  src: princeoftravel.com/credit-cards/bmo-eclipse-visa-infinite-card
-- 5x dining/grocery/gas/transit (per-category annual caps). Seed had gas/transit
-- at 3% and no dining row. Fix gas/transit 3->5; add dining 5% ($6k/yr cap).
UPDATE card_multipliers SET earn_rate = 5.00, notes = '5% gas & transit ($20k/yr; verified princeoftravel.com 2026-02)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'BMO eclipse Visa Infinite')
  AND category_id = (SELECT id FROM categories WHERE slug = 'gas-transit') AND earn_rate = 3.00;

INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, cap_amount, cap_period, fallback_earn_rate, effective_from, notes)
SELECT (SELECT id FROM cards WHERE name = 'BMO eclipse Visa Infinite'), (SELECT id FROM categories WHERE slug = 'dining'),
       5.00, 'cashback_pct', 6000.00, 'annual', 1.00, CURRENT_DATE, '5% dining ($6k/yr; verified princeoftravel.com 2026-02)'
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers WHERE card_id = (SELECT id FROM cards WHERE name = 'BMO eclipse Visa Infinite') AND category_id = (SELECT id FROM categories WHERE slug = 'dining'));

-- ── CIBC Aventura VI ──  src: princeoftravel.com/credit-cards/cibc-aventura-visa-infinite-card
-- 2x travel, 1.5x gas/drugstore/grocery, 1x else. NO dining bonus — drop it.
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Aventura Visa Infinite')
  AND category_id = (SELECT id FROM categories WHERE slug = 'dining') AND earn_rate = 1.50;

-- ── Marriott Bonvoy Amex ──  src: princeoftravel.com/credit-cards/marriott-bonvoy-american-express-card
-- 5x Marriott (modelled as travel), 2x everything else. Base was seeded 1x and a
-- now-redundant 2x dining row existed. Set base to 2x; drop the dining row.
UPDATE card_multipliers SET earn_rate = 2.00, notes = '2x everything else (verified princeoftravel.com 2026-02)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'Marriott Bonvoy American Express Card')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else') AND earn_rate = 1.00;

DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'Marriott Bonvoy American Express Card')
  AND category_id = (SELECT id FROM categories WHERE slug = 'dining') AND earn_rate = 2.00;

-- ── National Bank WE ──  src: princeoftravel.com/credit-cards/national-bank-world-elite-mastercard
-- 5x grocery/dining, 2x gas/EV/bills/travel, 1x else. Seed had a 2x BASE (over-
-- projecting all spend) + post-cap fallback of 2x, and was missing the 2x tier.
-- Set base to 1x, post-cap grocery/dining fallback to 1x, and add the 2x tier.
UPDATE card_multipliers SET earn_rate = 1.00, notes = '1x everything else (verified princeoftravel.com 2026-02)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'National Bank World Elite Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else') AND earn_rate = 2.00;

UPDATE card_multipliers SET fallback_earn_rate = 1.00
WHERE card_id = (SELECT id FROM cards WHERE name = 'National Bank World Elite Mastercard')
  AND category_id IN (SELECT id FROM categories WHERE slug IN ('groceries', 'dining'))
  AND earn_rate = 5.00 AND fallback_earn_rate = 2.00;

INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT (SELECT id FROM cards WHERE name = 'National Bank World Elite Mastercard'), c.id, 2.00, 'points', 1.00, CURRENT_DATE, v.note
FROM (VALUES
    ('gas-transit', '2x gas/EV/transit (verified princeoftravel.com 2026-02)'),
    ('recurring-bills', '2x bills (verified princeoftravel.com 2026-02)'),
    ('travel', '2x travel (verified princeoftravel.com 2026-02)')
) AS v(slug, note)
JOIN categories c ON c.slug = v.slug
WHERE NOT EXISTS (
    SELECT 1 FROM card_multipliers m
    WHERE m.card_id = (SELECT id FROM cards WHERE name = 'National Bank World Elite Mastercard')
      AND m.category_id = c.id);
