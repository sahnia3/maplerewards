-- Card-data correction batch 7 (2026-05-27; follows 000059-000065).
-- Verified vs Prince of Travel (2026-02). Idempotent guards; exact reverse.

-- ── BMO CashBack WE ──  src: princeoftravel.com/credit-cards/bmo-cashback-world-elite-mastercard
-- The "2% streaming" row is mis-categorized — its own note reads "2% recurring
-- bills". Move it to recurring-bills (keep $500/mo cap).
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'BMO CashBack World Elite Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'streaming-digital') AND earn_rate = 2.00;
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, cap_amount, cap_period, fallback_earn_rate, effective_from, notes)
SELECT (SELECT id FROM cards WHERE name = 'BMO CashBack World Elite Mastercard'), (SELECT id FROM categories WHERE slug = 'recurring-bills'),
       2.00, 'cashback_pct', 500.00, 'monthly', 1.00, CURRENT_DATE, '2% recurring bills up to $500/mo (verified princeoftravel.com 2026-02)'
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers WHERE card_id = (SELECT id FROM cards WHERE name = 'BMO CashBack World Elite Mastercard') AND category_id = (SELECT id FROM categories WHERE slug = 'recurring-bills'));

-- ── CIBC Aventura Gold ──  src: princeoftravel.com/credit-cards/cibc-aventura-gold-visa-card
-- 2x travel, 1.5x gas/drugstore/groceries, 1x else. NO dining bonus. Remove the
-- bogus 2x dining; add the missing 1.5x gas/pharmacy/groceries.
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Aventura Gold Visa')
  AND category_id = (SELECT id FROM categories WHERE slug = 'dining') AND earn_rate = 2.00;
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT (SELECT id FROM cards WHERE name = 'CIBC Aventura Gold Visa'), c.id, 1.50, 'points', 1.00, CURRENT_DATE, v.note
FROM (VALUES
    ('gas-transit', '1.5x gas (verified princeoftravel.com 2026-02)'),
    ('pharmacy', '1.5x drugstore (verified princeoftravel.com 2026-02)'),
    ('groceries', '1.5x groceries (verified princeoftravel.com 2026-02)')
) AS v(slug, note)
JOIN categories c ON c.slug = v.slug
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers m WHERE m.card_id = (SELECT id FROM cards WHERE name = 'CIBC Aventura Gold Visa') AND m.category_id = c.id);

-- ── CIBC Dividend Platinum ──  src: princeoftravel.com/credit-cards/cibc-dividend-platinum-visa-card
-- 3% gas/groceries/EV (seed had 2%). Bump gas/grocery 2% -> 3%.
UPDATE card_multipliers SET earn_rate = 3.00, notes = '3% groceries (verified princeoftravel.com 2026-02)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Dividend Platinum Visa')
  AND category_id = (SELECT id FROM categories WHERE slug = 'groceries') AND earn_rate = 2.00;
UPDATE card_multipliers SET earn_rate = 3.00, notes = '3% gas & EV charging (verified princeoftravel.com 2026-02)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Dividend Platinum Visa')
  AND category_id = (SELECT id FROM categories WHERE slug = 'gas-transit') AND earn_rate = 2.00;

-- ── RBC Avion VIP ──  src: princeoftravel.com/credit-cards/rbc-avion-visa-infinite-privilege
-- Post-refresh it earns a FLAT 1.25x on all purchases (the premium is the 35%
-- transfer/redemption boost + perks, not earn multipliers). Remove the bogus
-- 1.5x travel and 1.5x dining rows so all spend earns the 1.25x base.
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'RBC Avion Visa Infinite Privilege')
  AND category_id IN (SELECT id FROM categories WHERE slug IN ('travel', 'dining')) AND earn_rate = 1.50;
