-- Card-data correction (2026-05-27): the Desjardins Odyssey Gold Visa was seeded with a
-- fabricated earn structure (2x groceries, 1.5x everything-else, $70 annual fee). The
-- official Desjardins terms (desjardins.com/en/credit-cards/odyssey-gold-visa.html,
-- verified 2026-05-27) are different. Rewards are paid in BONUSDOLLARS; this DB models
-- BonusDollars at base_cpp = 1.0c/pt, so an earn_rate of N (points) = N% effective:
--   * 2%  Restaurants (dining), Entertainment, Alternative transportation (gas-transit),
--         Pre-authorized payments (recurring-bills), Travel
--   * 0.65% all other purchases  (there is NO grocery bonus)
--   * Annual fee $110 (not $70)
-- Published caps: Restaurants + Pre-authorized payments share a $6,000/yr pool, and
-- Travel a separate $15,000/yr pool; beyond each, earning drops to the 0.65% "other"
-- rate (fallback_earn_rate = 0.65). The shared Restaurants+Pre-authorized pool is
-- modelled here as two per-category $6,000 caps using the optimizer's existing
-- per-multiplier cap mechanism (a bounded, conservative approximation — the exact
-- shared-pool refinement via cap_groups belongs to the gated cap-precision work).
-- src: desjardins.com/en/credit-cards/odyssey-gold-visa.html (2026-05-27).

-- 1. Correct the annual fee.
UPDATE cards SET annual_fee = 110.00
WHERE name = 'Desjardins Odyssey Visa Gold' AND annual_fee = 70.00;

-- 2. Remove the phantom 2x grocery bonus (this card has no grocery category).
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'Desjardins Odyssey Visa Gold')
  AND category_id = (SELECT id FROM categories WHERE slug = 'groceries')
  AND earn_rate = 2.00 AND earn_type = 'points';

-- 3. Everything-else 1.5% -> 0.65%.
UPDATE card_multipliers SET earn_rate = 0.65, fallback_earn_rate = 0.65
WHERE card_id = (SELECT id FROM cards WHERE name = 'Desjardins Odyssey Visa Gold')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND earn_rate = 1.50 AND earn_type = 'points';

-- 4. Dining keeps 2x ($6,000/yr cap already set); fix the post-cap fallback to 0.65%.
UPDATE card_multipliers SET fallback_earn_rate = 0.65
WHERE card_id = (SELECT id FROM cards WHERE name = 'Desjardins Odyssey Visa Gold')
  AND category_id = (SELECT id FROM categories WHERE slug = 'dining')
  AND earn_rate = 2.00 AND earn_type = 'points' AND fallback_earn_rate = 1.00;

-- 5. Add the four missing 2x categories (entertainment, alternative transportation,
--    pre-authorized payments, travel) with their published caps + 0.65% fallback.
INSERT INTO card_multipliers
  (card_id, category_id, earn_rate, earn_type, cap_amount, cap_period, fallback_earn_rate, effective_from, notes)
SELECT
  (SELECT id FROM cards WHERE name = 'Desjardins Odyssey Visa Gold'),
  cat.id, v.earn_rate, 'points', v.cap_amount, v.cap_period, 0.65, DATE '2026-04-05', v.notes
FROM (VALUES
  ('entertainment',   2.00, NULL::numeric,     NULL::text, '2% entertainment (desjardins.com 2026-05-27)'),
  ('gas-transit',     2.00, NULL::numeric,     NULL::text, '2% alternative transportation (desjardins.com 2026-05-27)'),
  ('recurring-bills', 2.00, 6000.00::numeric,  'annual',   '2% pre-authorized payments; $6k/yr pool shared with dining, then 0.65% (desjardins.com 2026-05-27)'),
  ('travel',          2.00, 15000.00::numeric, 'annual',   '2% travel; $15k/yr then 0.65% (desjardins.com 2026-05-27)')
) AS v(cat_slug, earn_rate, cap_amount, cap_period, notes)
JOIN categories cat ON cat.slug = v.cat_slug
ON CONFLICT (card_id, category_id, effective_from) DO NOTHING;
