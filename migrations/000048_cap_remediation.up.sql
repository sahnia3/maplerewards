-- ─────────────────────────────────────────────────────────────────────────────
-- 000048_cap_remediation — verified per-card accelerated-earn caps
-- ─────────────────────────────────────────────────────────────────────────────
-- Replaces the conservative $20K/yr optimizer guardrail (optimizer.go
-- defaultUnverifiedAnnualCap) with VERIFIED published per-card caps for the
-- cards whose terms could be authoritatively sourced. Root cause:
-- docs/OPTIMIZER-CAP-AUDIT.md — 181 uncapped bonus multipliers across 72 of
-- 104 cards had no modelled cap, so the optimizer projected unbounded
-- accelerated earn (founder QA: Scotiabank Gold Amex 500K pts @ $100K).
--
-- Resolution sourcing + per-row source_url: docs/cap-remediation-checklist.md.
-- Cards whose terms could NOT be authoritatively verified (discontinued
-- products: HSBC, MBNA Alaska, Capital One Costco, BMO World Elite, etc.) are
-- intentionally NOT touched here — they remain protected by the shipped
-- conservative guardrail and are marked "UNVERIFIED" in the checklist.
-- Genuinely uncapped cards (PC Optimum, Tangerine 2%-chosen, most Amex MR /
-- Aeroplan / RBC Avion+ION / CIBC points-and-cash) get NO row change: the
-- guardrail only bites accelerated rates, and these are valid/uncapped.
--
-- Two cap models (mutually exclusive in optimizer.go scoreCard):
--   • SHARED  → cap_groups + cap_group_categories (fixed-UUID seed pattern,
--     same as the Amex Cobalt group in 000003); member multipliers keep
--     cap_amount NULL but get fallback_earn_rate set (the capGroup branch
--     blends with the member multiplier's FallbackEarnRate).
--   • PER-MULTIPLIER → card_multipliers.cap_amount/cap_period/fallback_earn_rate.
--
-- NO inline BEGIN/COMMIT: golang-migrate's postgres driver already wraps each
-- migration in one transaction (repo convention — see 000030/000038). An
-- inline BEGIN/COMMIT nests inside that wrapper and prematurely commits,
-- which on re-apply produced duplicate cap_groups. Idempotency instead comes
-- from DELETE-by-fixed-id AND DELETE-by-name (clears any prior run's rows,
-- including random-UUID rows from the earlier CTE attempt) then plain
-- INSERT…SELECT; per-multiplier UPDATEs key on natural keys (card name ×
-- category slug, active rows only). Fixed cap_group UUIDs:
-- 40000000-0000-0000-0000-0000000480NN.
-- ─────────────────────────────────────────────────────────────────────────────

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ PART A — SHARED caps (cap_groups, fixed-UUID seed pattern)                  ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- Idempotent reset: remove this migration's groups by fixed id OR by name
-- (the latter also clears random-UUID rows from any earlier failed attempt).
-- The pre-existing Amex Cobalt group ('food_drink_streaming', …-0001) is not
-- matched by either predicate and stays intact. cap_group_categories cascades.
DELETE FROM cap_groups WHERE id IN (
  '40000000-0000-0000-0000-000000048001','40000000-0000-0000-0000-000000048002',
  '40000000-0000-0000-0000-000000048003','40000000-0000-0000-0000-000000048004',
  '40000000-0000-0000-0000-000000048005','40000000-0000-0000-0000-000000048006',
  '40000000-0000-0000-0000-000000048007','40000000-0000-0000-0000-000000048008'
) OR name IN (
  'Scotia Gold Amex $50K Annual Accelerated Cap',
  'Scotia Passport VI $50K Annual Accelerated Cap',
  'Scotia Momentum VI $25K Annual Accelerated Cap',
  'Amex Business Edge $25K Annual 3x Cap',
  'BMO eclipse VIP $25K Annual Dining/Gas Cap',
  'MBNA Smart Cash $500/mo Gas+Grocery Cap',
  'National Bank Syncro $25K Annual Gas+Grocery Cap',
  'National Bank Platinum $1000/mo Bonus Cap'
);

-- G1 ── Scotiabank Gold American Express — $50,000/yr shared (THE founder fix)
--      src: scotiabank.com official Gold Amex terms ("first $50,000 in
--      purchases … annually Jan 1–Dec 31", then 1x); corroborated rewardscanada.
INSERT INTO cap_groups (id, card_id, name, cap_amount, cap_period)
SELECT '40000000-0000-0000-0000-000000048001', id,
       'Scotia Gold Amex $50K Annual Accelerated Cap', 50000.00, 'annual'
  FROM cards WHERE name = 'Scotiabank Gold American Express';
INSERT INTO cap_group_categories (cap_group_id, category_id)
SELECT '40000000-0000-0000-0000-000000048001', id FROM categories
 WHERE slug IN ('dining','entertainment','groceries','gas-transit','streaming-digital');

-- G2 ── Scotiabank Passport Visa Infinite — $50,000/yr shared
--      src: princeoftravel.com Passport earning data ("up to $50,000/yr, 1x after").
INSERT INTO cap_groups (id, card_id, name, cap_amount, cap_period)
SELECT '40000000-0000-0000-0000-000000048002', id,
       'Scotia Passport VI $50K Annual Accelerated Cap', 50000.00, 'annual'
  FROM cards WHERE name = 'Scotiabank Passport Visa Infinite';
INSERT INTO cap_group_categories (cap_group_id, category_id)
SELECT '40000000-0000-0000-0000-000000048002', id FROM categories
 WHERE slug IN ('groceries','travel','dining','entertainment','gas-transit');

-- G3 ── Scotia Momentum Visa Infinite — $25,000/yr shared, →1% over cap
--      src: scotiabank.com official Momentum VI terms.
INSERT INTO cap_groups (id, card_id, name, cap_amount, cap_period)
SELECT '40000000-0000-0000-0000-000000048003', id,
       'Scotia Momentum VI $25K Annual Accelerated Cap', 25000.00, 'annual'
  FROM cards WHERE name = 'Scotia Momentum Visa Infinite';
INSERT INTO cap_group_categories (cap_group_id, category_id)
SELECT '40000000-0000-0000-0000-000000048003', id FROM categories
 WHERE slug IN ('dining','gas-transit');

-- G4 ── American Express Business Edge — 75,000 pts ≈ $25,000/yr shared 3x
--      src: princeoftravel.com Business Edge (combined 75k-pt annual 3x cap).
INSERT INTO cap_groups (id, card_id, name, cap_amount, cap_period)
SELECT '40000000-0000-0000-0000-000000048004', id,
       'Amex Business Edge $25K Annual 3x Cap', 25000.00, 'annual'
  FROM cards WHERE name = 'American Express Business Edge';
INSERT INTO cap_group_categories (cap_group_id, category_id)
SELECT '40000000-0000-0000-0000-000000048004', id FROM categories
 WHERE slug IN ('gas-transit','dining');

-- G5 ── BMO eclipse Visa Infinite Privilege — $25,000/yr shared dining+gas
--      (groceries is a SEPARATE $15K single cap — see Part B). src: bmo.com PDF.
INSERT INTO cap_groups (id, card_id, name, cap_amount, cap_period)
SELECT '40000000-0000-0000-0000-000000048005', id,
       'BMO eclipse VIP $25K Annual Dining/Gas Cap', 25000.00, 'annual'
  FROM cards WHERE name = 'BMO eclipse Visa Infinite Privilege';
INSERT INTO cap_group_categories (cap_group_id, category_id)
SELECT '40000000-0000-0000-0000-000000048005', id FROM categories
 WHERE slug IN ('dining','gas-transit');

-- G6 ── MBNA Smart Cash Platinum Plus — $500/mo shared gas+grocery, →0.5%
--      src: mbna.ca Smart Cash terms.
INSERT INTO cap_groups (id, card_id, name, cap_amount, cap_period)
SELECT '40000000-0000-0000-0000-000000048006', id,
       'MBNA Smart Cash $500/mo Gas+Grocery Cap', 500.00, 'monthly'
  FROM cards WHERE name = 'MBNA Smart Cash Platinum Plus Mastercard';
INSERT INTO cap_group_categories (cap_group_id, category_id)
SELECT '40000000-0000-0000-0000-000000048006', id FROM categories
 WHERE slug IN ('gas-transit','groceries');

-- G7 ── National Bank Syncro — $25,000/yr shared gas+grocery, →1%
--      src: nbc.ca Syncro terms.
INSERT INTO cap_groups (id, card_id, name, cap_amount, cap_period)
SELECT '40000000-0000-0000-0000-000000048007', id,
       'National Bank Syncro $25K Annual Gas+Grocery Cap', 25000.00, 'annual'
  FROM cards WHERE name = 'National Bank Syncro Mastercard';
INSERT INTO cap_group_categories (cap_group_id, category_id)
SELECT '40000000-0000-0000-0000-000000048007', id FROM categories
 WHERE slug IN ('groceries','gas-transit');

-- G8 ── National Bank Platinum — $1,000/mo gross spend cap on 2x bonus, →1.5x
--      src: nbc.ca Platinum terms (first $1,000 gross monthly, then 1.5pt/$).
INSERT INTO cap_groups (id, card_id, name, cap_amount, cap_period)
SELECT '40000000-0000-0000-0000-000000048008', id,
       'National Bank Platinum $1000/mo Bonus Cap', 1000.00, 'monthly'
  FROM cards WHERE name = 'National Bank Platinum Mastercard';
INSERT INTO cap_group_categories (cap_group_id, category_id)
SELECT '40000000-0000-0000-0000-000000048008', id FROM categories
 WHERE slug IN ('dining');

-- Member-multiplier fallback rates for SHARED-cap cards. The capGroup branch
-- blends with each member multiplier's fallback_earn_rate; default 1.0 is
-- correct for G1/G2/G4/G5 (1x points) and G3/G7 (1% cash). Only the non-1.0
-- fallbacks need an explicit UPDATE: G6 → 0.5%, G8 → 1.5x.
UPDATE card_multipliers SET fallback_earn_rate = 0.5
 WHERE effective_to IS NULL
   AND card_id = (SELECT id FROM cards WHERE name = 'MBNA Smart Cash Platinum Plus Mastercard')
   AND category_id IN (SELECT id FROM categories WHERE slug IN ('gas-transit','groceries'));

UPDATE card_multipliers SET fallback_earn_rate = 1.5
 WHERE effective_to IS NULL
   AND card_id = (SELECT id FROM cards WHERE name = 'National Bank Platinum Mastercard')
   AND category_id = (SELECT id FROM categories WHERE slug = 'dining');

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ PART B — PER-MULTIPLIER caps (card_multipliers)                            ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- Each UPDATE keys on card name × category slug, active rows only — covers
-- every duplicate active multiplier row for the pair idempotently.

-- M1 SimplyCash Preferred Amex — 4% groceries cap $30,000/yr → 2%
UPDATE card_multipliers SET cap_amount = 30000.00, cap_period = 'annual', fallback_earn_rate = 2.0
 WHERE effective_to IS NULL
   AND card_id = (SELECT id FROM cards WHERE name = 'SimplyCash Preferred Card from American Express')
   AND category_id = (SELECT id FROM categories WHERE slug = 'groceries');

-- M2/M3 TD First Class Travel Visa Infinite — 6x dining & groceries cap $25,000/yr → 2x
UPDATE card_multipliers SET cap_amount = 25000.00, cap_period = 'annual', fallback_earn_rate = 2.0
 WHERE effective_to IS NULL
   AND card_id = (SELECT id FROM cards WHERE name = 'TD First Class Travel Visa Infinite')
   AND category_id IN (SELECT id FROM categories WHERE slug IN ('dining','groceries'));

-- M4 RBC Cash Back Preferred World Elite — accelerated cap $25,000/yr → 1%
UPDATE card_multipliers SET cap_amount = 25000.00, cap_period = 'annual', fallback_earn_rate = 1.0
 WHERE effective_to IS NULL
   AND card_id = (SELECT id FROM cards WHERE name = 'RBC Cash Back Preferred World Elite Mastercard')
   AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else');

-- M5 BMO Cash Back Mastercard — 3% groceries cap $500/mo → 0.5%
UPDATE card_multipliers SET cap_amount = 500.00, cap_period = 'monthly', fallback_earn_rate = 0.5
 WHERE effective_to IS NULL
   AND card_id = (SELECT id FROM cards WHERE name = 'BMO Cash Back Mastercard')
   AND category_id = (SELECT id FROM categories WHERE slug = 'groceries');

-- M6 BMO CashBack World Elite — 5% groceries cap $500/mo → 1%
UPDATE card_multipliers SET cap_amount = 500.00, cap_period = 'monthly', fallback_earn_rate = 1.0
 WHERE effective_to IS NULL
   AND card_id = (SELECT id FROM cards WHERE name = 'BMO CashBack World Elite Mastercard')
   AND category_id = (SELECT id FROM categories WHERE slug = 'groceries');

-- M7 BMO eclipse Visa Infinite Privilege — 5x groceries cap $15,000/yr → 1x
UPDATE card_multipliers SET cap_amount = 15000.00, cap_period = 'annual', fallback_earn_rate = 1.0
 WHERE effective_to IS NULL
   AND card_id = (SELECT id FROM cards WHERE name = 'BMO eclipse Visa Infinite Privilege')
   AND category_id = (SELECT id FROM categories WHERE slug = 'groceries');

-- M8/M9 BMO eclipse Visa Infinite — 5x groceries $6,000/yr; gas $20,000/yr → 1x
UPDATE card_multipliers SET cap_amount = 6000.00, cap_period = 'annual', fallback_earn_rate = 1.0
 WHERE effective_to IS NULL
   AND card_id = (SELECT id FROM cards WHERE name = 'BMO eclipse Visa Infinite')
   AND category_id = (SELECT id FROM categories WHERE slug = 'groceries');
UPDATE card_multipliers SET cap_amount = 20000.00, cap_period = 'annual', fallback_earn_rate = 1.0
 WHERE effective_to IS NULL
   AND card_id = (SELECT id FROM cards WHERE name = 'BMO eclipse Visa Infinite')
   AND category_id = (SELECT id FROM categories WHERE slug = 'gas-transit');

-- M10 Desjardins Cash Back World Elite — 4% groceries cap $10,000/yr → 1%
UPDATE card_multipliers SET cap_amount = 10000.00, cap_period = 'annual', fallback_earn_rate = 1.0
 WHERE effective_to IS NULL
   AND card_id = (SELECT id FROM cards WHERE name = 'Desjardins Cash Back World Elite Visa')
   AND category_id = (SELECT id FROM categories WHERE slug = 'groceries');

-- M11 Desjardins Odyssey Visa Gold — 2x dining cap $6,000/yr → 1x
UPDATE card_multipliers SET cap_amount = 6000.00, cap_period = 'annual', fallback_earn_rate = 1.0
 WHERE effective_to IS NULL
   AND card_id = (SELECT id FROM cards WHERE name = 'Desjardins Odyssey Visa Gold')
   AND category_id = (SELECT id FROM categories WHERE slug = 'dining');

-- M12 MBNA Rewards World Elite — 5x dining cap $50,000/yr/category → 1pt/$
UPDATE card_multipliers SET cap_amount = 50000.00, cap_period = 'annual', fallback_earn_rate = 1.0
 WHERE effective_to IS NULL
   AND card_id = (SELECT id FROM cards WHERE name = 'MBNA Rewards World Elite Mastercard')
   AND category_id = (SELECT id FROM categories WHERE slug = 'dining');

-- M13/M14/M15 Neo World Elite — monthly caps → 1%
UPDATE card_multipliers SET cap_amount = 1000.00, cap_period = 'monthly', fallback_earn_rate = 1.0
 WHERE effective_to IS NULL
   AND card_id = (SELECT id FROM cards WHERE name = 'Neo World Elite Mastercard')
   AND category_id = (SELECT id FROM categories WHERE slug = 'groceries');
UPDATE card_multipliers SET cap_amount = 500.00, cap_period = 'monthly', fallback_earn_rate = 1.0
 WHERE effective_to IS NULL
   AND card_id = (SELECT id FROM cards WHERE name = 'Neo World Elite Mastercard')
   AND category_id = (SELECT id FROM categories WHERE slug = 'streaming-digital');
UPDATE card_multipliers SET cap_amount = 1000.00, cap_period = 'monthly', fallback_earn_rate = 1.0
 WHERE effective_to IS NULL
   AND card_id = (SELECT id FROM cards WHERE name = 'Neo World Elite Mastercard')
   AND category_id = (SELECT id FROM categories WHERE slug = 'gas-transit');
