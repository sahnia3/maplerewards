-- Card-data correction batch 3 (2026-05-27; follows 000059-000061).
-- Verified vs Prince of Travel earn tables (2026-02). Idempotent pre-value
-- guards; exact .down.sql reverse.

-- ── Scotiabank Passport VI ──  src: princeoftravel.com/credit-cards/scotiabank-passport-visa-infinite-card
-- 2x grocery/dining/entertainment/transit (3x is Empire-stores-only), 1x else,
-- NO general-travel bonus. Use the general 2x for groceries (the optimizer can't
-- tell Empire from other grocers) and drop the bogus 2x travel row.
UPDATE card_multipliers SET earn_rate = 2.00,
    notes = '2x groceries general; 3x at Empire stores (Sobeys/IGA/FreshCo). verified princeoftravel.com 2026-02'
WHERE card_id = (SELECT id FROM cards WHERE name = 'Scotiabank Passport Visa Infinite')
  AND category_id = (SELECT id FROM categories WHERE slug = 'groceries') AND earn_rate = 3.00;

DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'Scotiabank Passport Visa Infinite')
  AND category_id = (SELECT id FROM categories WHERE slug = 'travel') AND earn_rate = 2.00;

-- ── CIBC Dividend VI ──  src: princeoftravel.com/credit-cards/cibc-dividend-visa-infinite-card
-- 4% gas/grocery, 2% transit/dining/BILLS, 1% else. The "pharmacy 2%" row is
-- mis-categorized — its own note reads "2% recurring bill payments" — so move it
-- to recurring-bills. The 2% travel row is bogus (travel earns 1% here); remove.
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Dividend Visa Infinite')
  AND category_id = (SELECT id FROM categories WHERE slug = 'pharmacy') AND earn_rate = 2.00;

INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT (SELECT id FROM cards WHERE name = 'CIBC Dividend Visa Infinite'),
       (SELECT id FROM categories WHERE slug = 'recurring-bills'),
       2.00, 'cashback_pct', 1.00, CURRENT_DATE, '2% recurring bill payments (verified princeoftravel.com 2026-02)'
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers
  WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Dividend Visa Infinite')
    AND category_id = (SELECT id FROM categories WHERE slug = 'recurring-bills'));

DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Dividend Visa Infinite')
  AND category_id = (SELECT id FROM categories WHERE slug = 'travel') AND earn_rate = 2.00;

-- ── TD First Class Travel VI ──  src: princeoftravel.com/credit-cards/td-first-class-travel-visa-infinite-card
-- Was missing its category bonuses (only 8x Expedia travel + 2x base seeded).
-- Add 6x grocery/dining/transit and 4x streaming/bills (TD Rewards ~0.5cpp, so
-- 6x ~= 3% effective). Fallback to the 2x base.
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT (SELECT id FROM cards WHERE name = 'TD First Class Travel Visa Infinite'), c.id, v.rate, 'points', 2.00, CURRENT_DATE, v.note
FROM (VALUES
    ('groceries', 6.00, '6x groceries (verified princeoftravel.com 2026-02)'),
    ('dining', 6.00, '6x dining (verified princeoftravel.com 2026-02)'),
    ('gas-transit', 6.00, '6x transit (verified princeoftravel.com 2026-02)'),
    ('streaming-digital', 4.00, '4x streaming (verified princeoftravel.com 2026-02)'),
    ('recurring-bills', 4.00, '4x recurring bills (verified princeoftravel.com 2026-02)')
) AS v(slug, rate, note)
JOIN categories c ON c.slug = v.slug
WHERE NOT EXISTS (
    SELECT 1 FROM card_multipliers m
    WHERE m.card_id = (SELECT id FROM cards WHERE name = 'TD First Class Travel Visa Infinite')
      AND m.category_id = c.id);
