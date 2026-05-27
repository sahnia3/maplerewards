-- Card-data correction (2026-05-27 sweep, cont'd from 000059).
-- The consumer American Express Aeroplan Card was missing its 1.5x dining
-- multiplier, so the optimizer/scorecard UNDER-projected dining value on it
-- (defaulting dining to the 1x everything-else rate).
--
-- Published terms (Amex Canada / NerdWallet, verified 2026-05-27):
--   * 2x  Air Canada            (seeded as travel 2.0 — correct, unchanged)
--   * 1.5x dining/restaurants/QSR/coffee/bars/food-delivery (NOT groceries)  <-- missing
--   * 1x  everything else       (seeded — correct, unchanged)
--   src: https://www.americanexpress.com/ca/en/membership-benefits/aeroplan-card/  (verified 2026-05-27)
--
-- Guard: only insert when the row is genuinely absent (idempotent re-run safe).

INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT
    (SELECT id FROM cards WHERE name = 'American Express Aeroplan Card'),
    (SELECT id FROM categories WHERE slug = 'dining'),
    1.50, 'points', 1.00, CURRENT_DATE,
    '1.5x dining incl. restaurants/QSR/coffee/bars/delivery (verified amex.ca 2026-05-27)'
WHERE NOT EXISTS (
    SELECT 1 FROM card_multipliers
    WHERE card_id = (SELECT id FROM cards WHERE name = 'American Express Aeroplan Card')
      AND category_id = (SELECT id FROM categories WHERE slug = 'dining')
);
