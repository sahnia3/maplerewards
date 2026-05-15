-- ── Data corrections from independent review (2026-05-15) ──────────────────
--
-- Three corrections flagged by power-user review:
--   1. Aeroplan base CPP was two years stale at 1.5¢. PoT and Milesopedia
--      have both trimmed their default valuation to 2.0¢ for the 2026 chart.
--   2. Cobalt 5x multiplier rows had per-category $2,500/mo caps that, in
--      combination with the shared cap_group, allowed the optimizer to
--      double-count budget. The shared group is the source of truth; the
--      per-row caps are nullified here so the optimizer relies on it alone.
--   3. Wealthsimple Cash Card and Visa Infinite were absent from the catalog
--      — biggest 2026 power-user complaint (free, 1%/2% flat, no FX fee).

-- ── 1. Aeroplan base CPP refresh ───────────────────────────────────────────
UPDATE loyalty_programs
   SET base_cpp = 2.00
 WHERE slug = 'aeroplan' AND base_cpp = 1.50;

-- ── 2. Cobalt per-row caps → null (cap_groups carries the shared $2,500) ──
-- Card id 20000000-0000-0000-0000-000000000001 = Amex Cobalt.
-- Category 001=groceries, 002=dining, 007=streaming. Wiping cap_amount on
-- these rows ensures the optimizer doesn't apply both the per-row cap AND
-- the cap_group cap simultaneously.
UPDATE card_multipliers
   SET cap_amount = NULL, cap_period = NULL
 WHERE card_id = '20000000-0000-0000-0000-000000000001'
   AND category_id IN (
     '30000000-0000-0000-0000-000000000001',
     '30000000-0000-0000-0000-000000000002',
     '30000000-0000-0000-0000-000000000007'
   );

-- ── 3. Wealthsimple Cash + Visa Infinite ───────────────────────────────────
-- Wealthsimple's program isn't a points program — it's pure cashback at 1% or
-- 2% to the user's Wealthsimple Cash account. Modelled as cashback so CPP=1.0
-- means 1¢ per "point" of cashback.

INSERT INTO loyalty_programs (id, name, slug, currency_name, program_type, base_cpp, is_active)
VALUES ('10000000-0000-0000-0000-000000000028', 'Wealthsimple Cash', 'wealthsimple-cash', 'CAD cashback', 'cashback', 1.0000, true)
ON CONFLICT (id) DO NOTHING;

-- Wealthsimple Cash Card (the prepaid one) — 1% back, no fee, no FX fee.
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000080', 'Wealthsimple Cash Card', 'Wealthsimple', 'visa', '10000000-0000-0000-0000-000000000028', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- Wealthsimple Visa Infinite — 2% back flat, no fee at $4K/mo direct deposit
-- (modelled as $0 here; users with no DD see effective 1.5% downgrade).
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000081', 'Wealthsimple Visa Infinite', 'Wealthsimple', 'visa', '10000000-0000-0000-0000-000000000028', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- Flat multipliers on Everything Else.
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, cap_amount, cap_period, fallback_earn_rate, notes)
VALUES
  ('20000000-0000-0000-0000-000000000080', '30000000-0000-0000-0000-000000000008', 1.0, 'cashback_pct', NULL, NULL, 1.0, '1% cashback on all purchases'),
  ('20000000-0000-0000-0000-000000000081', '30000000-0000-0000-0000-000000000008', 2.0, 'cashback_pct', NULL, NULL, 1.0, '2% cashback on all purchases — requires Premium or active direct deposit')
ON CONFLICT DO NOTHING;
