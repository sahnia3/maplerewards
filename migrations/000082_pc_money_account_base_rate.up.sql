-- Card-data correction (2026-05-27): the PC Money Account earns 10 PC Optimum points
-- per $1 EVERYWHERE (= 1%, at 0.1c/pt) and up to 25 pts/$1 at Shoppers Drug Mart
-- (= 2.5%). The "Everything Else" multiplier was seeded at 0.5% (5 pts/$1) — exactly
-- half the real base rate — which under-valued every non-Shoppers purchase. Correct it
-- to 1.00%. The pharmacy 2.5% and groceries 1% rows are already correct (groceries = the
-- everywhere rate as applied at Loblaw banners). src: pcfinancial.ca (PC Money Account
-- rewards guide, verified 2026-05-27).
UPDATE card_multipliers SET earn_rate = 1.00
WHERE card_id = (SELECT id FROM cards WHERE name = 'PC Money Account')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND earn_type = 'cashback_pct'
  AND earn_rate = 0.50;
