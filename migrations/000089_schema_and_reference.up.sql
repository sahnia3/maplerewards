-- Structural-data corrections, step 1 of 4: schema + reference data (2026-06-01).
-- Generated from the structural-data research specs (missing-categories, cashback-loyalty,
-- rates-precision-scope, simple-and-ambiguous, other-data groups) layered on top of the
-- 124-agent data-accuracy audit. This migration lays the foundation the later migrations
-- depend on, in dependency order:
--   (A) widen card_multipliers.earn_rate / fallback_earn_rate to numeric(6,4) so sub-cent
--       Air Miles rates (e.g. 1 Mile per $12 = 0.0833) survive instead of rounding to 0.08;
--   (B) create the new spend categories used by 090/092 (Air Canada, Gas, Transit,
--       AIR MILES Partners);
--   (C) create the new cashback / proprietary loyalty programs (+ matching point_valuations
--       base rows) used by 091 reassignments;
--   (D) correct existing loyalty-program valuations the "other-data" group found wrong
--       (Air Miles point_valuations on a ~70x-too-low scale; fixed-value floors for
--       MBNA / Home Trust / Capital One; a mild Hilton bump; Home Trust program_type).
--
-- Every reference INSERT is gated with WHERE NOT EXISTS on the natural key (slug / id) so the
-- file is idempotent; every value UPDATE pins the prior value in its WHERE clause so it is a
-- safe no-op if the data has since drifted. Self-validated against the live DB (104 cards,
-- schema_migrations=87) and dry-run inside BEGIN ... ROLLBACK before being written.
-- (golang-migrate wraps each migration in its own transaction, matching migrations 80-88.)

-- ============================== (A) earn_rate precision widen ==============================
-- numeric(5,2) -> numeric(6,4). Widening only (no narrowing), so no data can be lost.
-- Go reads these as float64 (internal/model/types.go:82, internal/repo/cards.go:194), so the
-- extra precision flows end-to-end with no code change. Down narrows back to (5,2); because
-- this group's only sub-cent writes (0.0833) live in 092, narrowing here in 089's down is safe
-- only when 092 has already been reverted (migrations are torn down newest-first, so it is).
ALTER TABLE card_multipliers ALTER COLUMN earn_rate TYPE numeric(6,4);
ALTER TABLE card_multipliers ALTER COLUMN fallback_earn_rate TYPE numeric(6,4);

-- ============================== (B) new spend categories ==============================
-- Fixed literal UUIDs so multiple cards (across 090/092) can share one category id.
-- mcc_codes left NULL: these are either airline/merchant-network scoped (Air Canada,
-- AIR MILES Partners) or refinements of the combined Gas & Transit bucket whose member MCCs
-- already live on the parent; the categorizer keys off broad buckets, documented in the report.
INSERT INTO categories (id, name, slug, parent_id, mcc_codes, country)
SELECT $$30000000-0000-0000-0000-000000000011$$, $$Air Canada$$, $$air-canada$$, NULL, NULL, $$CA$$
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE slug = $$air-canada$$);

INSERT INTO categories (id, name, slug, parent_id, mcc_codes, country)
SELECT $$30000000-0000-0000-0000-000000000012$$, $$Gas$$, $$gas$$, $$30000000-0000-0000-0000-000000000004$$, $${5541,5542}$$, $$CA$$
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE slug = $$gas$$);

INSERT INTO categories (id, name, slug, parent_id, mcc_codes, country)
SELECT $$30000000-0000-0000-0000-000000000014$$, $$Transit$$, $$transit$$, $$30000000-0000-0000-0000-000000000004$$, $${4111,4112,4131,4121}$$, $$CA$$
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE slug = $$transit$$);

INSERT INTO categories (id, name, slug, parent_id, mcc_codes, country)
SELECT $$30000000-0000-0000-0000-000000000016$$, $$AIR MILES Partners$$, $$air-miles-partners$$, NULL, NULL, $$CA$$
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE slug = $$air-miles-partners$$);

-- ============================== (C) new loyalty programs + base valuations ==============================
-- All program_type='cashback', base_cpp=1.0000 (1 cent per cash-dollar = direct cash), matching
-- the existing cibc-dividend / wealthsimple-cash / ct-money convention. A matching point_valuations
-- base row is emitted for each (the dominant pattern; optimizer.getCPP reads point_valuations first).
-- gen_random_uuid() ids (no fixed-UUID convention exists for loyalty_programs); slug is the natural key.

INSERT INTO loyalty_programs (id, name, slug, currency_name, program_type, base_cpp, is_active, country)
SELECT gen_random_uuid(), $$Cash Back$$, $$cashback$$, $$Cash Back$$, $$cashback$$, 1.0000, true, $$CA$$
WHERE NOT EXISTS (SELECT 1 FROM loyalty_programs WHERE slug = $$cashback$$);
INSERT INTO loyalty_programs (id, name, slug, currency_name, program_type, base_cpp, is_active, country)
SELECT gen_random_uuid(), $$Neo Cashback$$, $$neo-cashback$$, $$Neo Cashback$$, $$cashback$$, 1.0000, true, $$CA$$
WHERE NOT EXISTS (SELECT 1 FROM loyalty_programs WHERE slug = $$neo-cashback$$);
INSERT INTO loyalty_programs (id, name, slug, currency_name, program_type, base_cpp, is_active, country)
SELECT gen_random_uuid(), $$Rogers Cash Back$$, $$rogers-cashback$$, $$Rogers Cash Back$$, $$cashback$$, 1.0000, true, $$CA$$
WHERE NOT EXISTS (SELECT 1 FROM loyalty_programs WHERE slug = $$rogers-cashback$$);
INSERT INTO loyalty_programs (id, name, slug, currency_name, program_type, base_cpp, is_active, country)
SELECT gen_random_uuid(), $$Tangerine Money-Back Rewards$$, $$tangerine-money-back$$, $$Money-Back Rewards$$, $$cashback$$, 1.0000, true, $$CA$$
WHERE NOT EXISTS (SELECT 1 FROM loyalty_programs WHERE slug = $$tangerine-money-back$$);
INSERT INTO loyalty_programs (id, name, slug, currency_name, program_type, base_cpp, is_active, country)
SELECT gen_random_uuid(), $$Simplii Cash Back$$, $$simplii-cashback$$, $$Cash Back$$, $$cashback$$, 1.0000, true, $$CA$$
WHERE NOT EXISTS (SELECT 1 FROM loyalty_programs WHERE slug = $$simplii-cashback$$);
INSERT INTO loyalty_programs (id, name, slug, currency_name, program_type, base_cpp, is_active, country)
SELECT gen_random_uuid(), $$Scotia Momentum Cash Back$$, $$scotia-cashback$$, $$Cash Back$$, $$cashback$$, 1.0000, true, $$CA$$
WHERE NOT EXISTS (SELECT 1 FROM loyalty_programs WHERE slug = $$scotia-cashback$$);
INSERT INTO loyalty_programs (id, name, slug, currency_name, program_type, base_cpp, is_active, country)
SELECT gen_random_uuid(), $$RBC Cash Back$$, $$rbc-cash-back$$, $$Cash Back$$, $$cashback$$, 1.0000, true, $$CA$$
WHERE NOT EXISTS (SELECT 1 FROM loyalty_programs WHERE slug = $$rbc-cash-back$$);
INSERT INTO loyalty_programs (id, name, slug, currency_name, program_type, base_cpp, is_active, country)
SELECT gen_random_uuid(), $$BMO Cash Back$$, $$bmo-cashback$$, $$Cash Back$$, $$cashback$$, 1.0000, true, $$CA$$
WHERE NOT EXISTS (SELECT 1 FROM loyalty_programs WHERE slug = $$bmo-cashback$$);
INSERT INTO loyalty_programs (id, name, slug, currency_name, program_type, base_cpp, is_active, country)
SELECT gen_random_uuid(), $$Amex SimplyCash$$, $$amex-simplycash$$, $$Cash Back$$, $$cashback$$, 1.0000, true, $$CA$$
WHERE NOT EXISTS (SELECT 1 FROM loyalty_programs WHERE slug = $$amex-simplycash$$);
INSERT INTO loyalty_programs (id, name, slug, currency_name, program_type, base_cpp, is_active, country)
SELECT gen_random_uuid(), $$CIBC Costco Cash Back$$, $$cibc-costco-cashback$$, $$Costco Cash Back$$, $$cashback$$, 1.0000, true, $$CA$$
WHERE NOT EXISTS (SELECT 1 FROM loyalty_programs WHERE slug = $$cibc-costco-cashback$$);
INSERT INTO loyalty_programs (id, name, slug, currency_name, program_type, base_cpp, is_active, country)
SELECT gen_random_uuid(), $$Tim Cash$$, $$tim-cash$$, $$Tim Cash$$, $$cashback$$, 1.0000, true, $$CA$$
WHERE NOT EXISTS (SELECT 1 FROM loyalty_programs WHERE slug = $$tim-cash$$);
INSERT INTO loyalty_programs (id, name, slug, currency_name, program_type, base_cpp, is_active, country)
SELECT gen_random_uuid(), $$TD Cash Back Dollars$$, $$td-cash-back$$, $$Cash Back Dollars$$, $$cashback$$, 1.0000, true, $$CA$$
WHERE NOT EXISTS (SELECT 1 FROM loyalty_programs WHERE slug = $$td-cash-back$$);

-- matching point_valuations base rows (segment='base', cpp=1.0000, source='manual') for each new program
INSERT INTO point_valuations (loyalty_program_id, segment, cpp, source, effective_date)
SELECT lp.id, $$base$$, 1.0000, $$manual$$, DATE $$2026-06-01$$
FROM loyalty_programs lp
WHERE lp.slug IN ($$cashback$$,$$neo-cashback$$,$$rogers-cashback$$,$$tangerine-money-back$$,$$simplii-cashback$$,
                  $$scotia-cashback$$,$$rbc-cash-back$$,$$bmo-cashback$$,$$amex-simplycash$$,$$cibc-costco-cashback$$,
                  $$tim-cash$$,$$td-cash-back$$)
  AND NOT EXISTS (
    SELECT 1 FROM point_valuations pv
    WHERE pv.loyalty_program_id = lp.id AND pv.segment = $$base$$ AND pv.effective_date = DATE $$2026-06-01$$
  );

-- ============================== (D) other-data valuation corrections ==============================
-- The live product reads point_valuations FIRST (optimizer.getCPP, internal/service/optimizer.go:410
-- -> internal/repo/valuations.go:20) and only falls back to loyalty_programs.base_cpp when no row
-- exists; the wallet-summary / compare / card-detail / portfolio handlers read base_cpp directly.
-- Both stores therefore must move in lockstep, so each correction below pairs a point_valuations
-- UPDATE with a base_cpp UPDATE where applicable. All UPDATEs pin the prior value.

-- Air Miles (slug air-miles, id ...017): point_valuations rows are on a ~70x-too-low scale
-- (base 0.15 / business 0.21 / economy 0.12) while base_cpp is correctly 10.5 (95 Miles=$10 in-store).
-- This understated the two BMO Air Miles cards to ~0.012% return. Fix the valuations to the
-- authoritative scale (in-store fixed ~10.5c; travel 12-15c). base_cpp=10.5 stays as-is.
UPDATE point_valuations SET cpp = 10.5000 WHERE loyalty_program_id = $$10000000-0000-0000-0000-000000000017$$ AND segment = $$base$$     AND cpp = 0.1500;
UPDATE point_valuations SET cpp = 13.0000 WHERE loyalty_program_id = $$10000000-0000-0000-0000-000000000017$$ AND segment = $$business$$ AND cpp = 0.2100;
UPDATE point_valuations SET cpp = 12.0000 WHERE loyalty_program_id = $$10000000-0000-0000-0000-000000000017$$ AND segment = $$economy$$  AND cpp = 0.1200;

-- MBNA Rewards (slug mbna-rewards, id ...022): fixed-value, NO transfer partners (verified: zero
-- transfer_partners rows), so base_cpp == redemption value. Both sources peg travel redemption at
-- 1.0c; current 0.7c is below even the cash floor. 0.7 -> 1.0 (paired).
UPDATE loyalty_programs SET base_cpp = 1.0000 WHERE id = $$10000000-0000-0000-0000-000000000022$$ AND base_cpp = 0.7000;
UPDATE point_valuations SET cpp = 1.0000 WHERE loyalty_program_id = $$10000000-0000-0000-0000-000000000022$$ AND segment = $$base$$ AND cpp = 0.7000;

-- Home Trust Rewards (slug home-trust-rewards, id ...025): the sole card is a flat 1% cash-back-as-
-- statement-credit card = exactly 1.0c, and it is not a points program. 0.5 -> 1.0 (paired) AND
-- program_type 'bank' -> 'cashback' (CHECK allows 'cashback'; matches air-miles/ct-money/cibc-dividend).
UPDATE loyalty_programs SET base_cpp = 1.0000 WHERE id = $$10000000-0000-0000-0000-000000000025$$ AND base_cpp = 0.5000;
UPDATE loyalty_programs SET program_type = $$cashback$$ WHERE id = $$10000000-0000-0000-0000-000000000025$$ AND program_type = $$bank$$;
UPDATE point_valuations SET cpp = 1.0000 WHERE loyalty_program_id = $$10000000-0000-0000-0000-000000000025$$ AND segment = $$base$$ AND cpp = 0.5000;

-- Capital One Rewards (slug capital-one-rewards, id ...021): the Canadian cards run a fixed-value
-- miles system (1 mile = 1c against travel), NO transfer partners (verified). Audit's 2.3c is a US
-- transfer-aspirational figure -> rejected. Correct fixed value = 1.0c. 0.5 -> 1.0 (paired).
UPDATE loyalty_programs SET base_cpp = 1.0000 WHERE id = $$10000000-0000-0000-0000-000000000021$$ AND base_cpp = 0.5000;
UPDATE point_valuations SET cpp = 1.0000 WHERE loyalty_program_id = $$10000000-0000-0000-0000-000000000021$$ AND segment = $$base$$ AND cpp = 0.5000;

-- Hilton Honors (slug hilton-honors, id ...014): mild bump to the YAML/weighted midpoint, staying
-- under the 0.7c hotel-night ceiling. 0.5 -> 0.6 (paired; business/economy segments left as-is).
UPDATE loyalty_programs SET base_cpp = 0.6000 WHERE id = $$10000000-0000-0000-0000-000000000014$$ AND base_cpp = 0.5000;
UPDATE point_valuations SET cpp = 0.6000 WHERE loyalty_program_id = $$10000000-0000-0000-0000-000000000014$$ AND segment = $$base$$ AND cpp = 0.5000;

-- NOTE (intentionally NOT changed): rbc-avion (1.1), rbc-rewards (0.5), flying-blue (1.2) keep their
-- conservative floors -- the audit's 1.8/2.3 "consensus" figures are transfer-aspirational ceilings
-- already surfaced via transfer_partners / YAML cpp_range.high, and base_cpp is the valueLow floor
-- (internal/handler/summary.go:50). Applying them would double-count and inflate every floor estimate.
