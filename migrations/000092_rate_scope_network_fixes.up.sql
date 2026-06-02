-- Structural-data corrections, step 4 of 4: rate precision, category-scope splits, tier caps,
-- and network fixes (2026-06-01). Depends on 089 (new categories: air-canada ...011, gas ...012,
-- transit ...014, air-miles-partners ...016 must exist; earn_rate widened to numeric(6,4) for the
-- 0.0833 Air Miles writes).
--
-- Conventions:
--  * Existing rows are corrected by immutable id with the prior value pinned in WHERE.
--  * New rows are INSERTed with effective_from = 2026-06-01 and gated WHERE NOT EXISTS on the unique
--    key (card_id, category_id, effective_from) -- distinct from existing rows' 2026-04-05 dates.
--  * "Scope splits": a single combined "Gas & Transit" (or over-broad "Travel") bonus row is repointed
--    to a narrower category (Gas / Transit / Air Canada) so the excluded half falls through to
--    Everything Else. Where a cap_group referenced the old combined category, the cap_group_categories
--    row is migrated to follow the split (only Scotia Passport ...048002 and MBNA Smart Cash ...048006
--    have such cap groups; verified).
--  * Portal-only travel bonuses (Expedia-For-TD, CIBC Rewards Centre) are DEMOTED to the card's base
--    rate -- the conservative default -- rather than kept on broad Travel (would over-credit direct
--    travel) or moved to a new Travel-Portal category (the categorizer cannot detect portal bookings
--    from an MCC). Documented in migrations/000089_STRUCTURAL_REPORT.md.
--  * Marriott Bonvoy 5x and CIBC Costco grocery are intentionally left untouched (see report).
-- Dry-run inside BEGIN ... ROLLBACK before being written.

-- ============================== Network fixes (clean single-column writes) ==============================
-- Desjardins Cash Back World Elite Visa (...054) is a Mastercard, not Visa. [desjardins.com]
UPDATE cards SET network = $$mastercard$$ WHERE id = $$20000000-0000-0000-0000-000000000054$$ AND network = $$visa$$;
-- Wealthsimple Cash Card (...103) is a prepaid Mastercard (sibling Visa Infinite ...104 stays visa). [wealthsimple.com]
UPDATE cards SET network = $$mastercard$$ WHERE id = $$20000000-0000-0000-0000-000000000103$$ AND network = $$visa$$;

-- ============================== BMO Air Miles World Elite Mastercard (...020) precision ==============================
-- Dining/Entertainment carry no permanent elevated tier -- they are really the base 1 Mile/$12 = 0.0833.
-- Everything Else stored 0.08 is the same base, made precise for internal consistency. [bmo.com / princeoftravel.com]
UPDATE card_multipliers SET earn_rate = 0.0833 WHERE id = $$ed7da149-70df-464d-bb36-c9de219fa717$$ AND earn_rate = 0.25;   -- dining
UPDATE card_multipliers SET earn_rate = 0.0833 WHERE id = $$e02b1f55-7cba-461c-b47e-e694338e5ca2$$ AND earn_rate = 0.25;   -- entertainment
UPDATE card_multipliers SET earn_rate = 0.0833 WHERE id = $$3273232a-0217-427a-a5e2-8141348fd243$$ AND earn_rate = 0.08;   -- everything-else

-- ============================== BMO World Elite Mastercard (...010) ==============================
-- This is the BMO Ascend product. Model 5x Travel up to $15,000/yr then 1x on the single Travel row
-- (per-row cap; NO cap_group -- one category). Everything Else 2 -> 1 and fallbacks corrected to base 1.
-- Verified against the correctly-modeled duplicate BMO Ascend WE (...022). [finlywealth.com / princeoftravel.com]
UPDATE card_multipliers SET earn_rate = 5, cap_amount = 15000, cap_period = $$annual$$, fallback_earn_rate = 1
  WHERE id = $$e90dacfe-60b0-4206-993a-7dae47d59501$$ AND earn_rate = 3.00;                                    -- travel 3 -> 5x/$15k
UPDATE card_multipliers SET earn_rate = 1, fallback_earn_rate = 1
  WHERE id = $$683315c5-b0c0-4f44-99fe-1038b5f15183$$ AND earn_rate = 2.00;                                    -- everything-else 2 -> 1
UPDATE card_multipliers SET fallback_earn_rate = 1 WHERE id = $$6fe0fc4d-064b-45fa-bb55-cb186316341a$$ AND fallback_earn_rate = 2;  -- dining fb 2 -> 1
UPDATE card_multipliers SET fallback_earn_rate = 1 WHERE id = $$6b7c2e9e-10fe-4de2-ae5e-b81e90e6b86d$$ AND fallback_earn_rate = 2;  -- entertainment fb 2 -> 1

-- ============================== Aeroplan: Air Canada scope splits ==============================
-- "Travel" elevated rates on Aeroplan cards apply ONLY to Air Canada / Air Canada Vacations direct
-- purchases; general travel earns the base rate. For each card: demote (or repoint) the Travel row and
-- add an Air Canada (...011) row at the elevated rate.

-- American Express Aeroplan Card (...028): demote Travel 2 -> 1, add Air Canada 2x. Dining 1.5x stays. [princeoftravel.com]
UPDATE card_multipliers SET earn_rate = 1 WHERE id = $$527d0ae4-9556-4986-b0bd-b20a8beca145$$ AND earn_rate = 2.00;
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT $$20000000-0000-0000-0000-000000000028$$, $$30000000-0000-0000-0000-000000000011$$, 2, $$points$$, 1, DATE $$2026-06-01$$,
       $$2x Aeroplan on Air Canada & Air Canada Vacations direct purchases$$
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers WHERE card_id = $$20000000-0000-0000-0000-000000000028$$ AND category_id = $$30000000-0000-0000-0000-000000000011$$ AND effective_from = DATE $$2026-06-01$$);

-- American Express Aeroplan No Fee Card (...095): only everything-else existed. Add Air Canada 2x AND Dining 1.5x. [americanexpress.com]
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT $$20000000-0000-0000-0000-000000000095$$, $$30000000-0000-0000-0000-000000000011$$, 2, $$points$$, 1, DATE $$2026-06-01$$,
       $$2x Aeroplan on Air Canada & Air Canada Vacations direct purchases$$
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers WHERE card_id = $$20000000-0000-0000-0000-000000000095$$ AND category_id = $$30000000-0000-0000-0000-000000000011$$ AND effective_from = DATE $$2026-06-01$$);
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT $$20000000-0000-0000-0000-000000000095$$, $$30000000-0000-0000-0000-000000000002$$, 1.5, $$points$$, 1, DATE $$2026-06-01$$,
       $$1.5x Aeroplan on eligible dining & food delivery in Canada$$
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers WHERE card_id = $$20000000-0000-0000-0000-000000000095$$ AND category_id = $$30000000-0000-0000-0000-000000000002$$ AND effective_from = DATE $$2026-06-01$$);

-- Amex Aeroplan Business Reserve Card (...082): the existing Travel 3x row IS Air Canada direct -- repoint it to
-- Air Canada (...011); add a Hotels & Car Rentals 2x tier mapped to the broad Travel category (no hotel/car
-- subcategory exists; slight over-credit of other travel, noted in report). Everything Else 1.25x stays. [princeoftravel.com]
UPDATE card_multipliers SET category_id = $$30000000-0000-0000-0000-000000000011$$ WHERE id = $$a09210a4-0959-4974-9f8d-e66c8f1f089a$$ AND category_id = $$30000000-0000-0000-0000-000000000003$$;
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT $$20000000-0000-0000-0000-000000000082$$, $$30000000-0000-0000-0000-000000000003$$, 2, $$points$$, 1.25, DATE $$2026-06-01$$,
       $$2x Aeroplan on hotels & car rentals (mapped to Travel; Air Canada direct earns 3x)$$
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers WHERE card_id = $$20000000-0000-0000-0000-000000000082$$ AND category_id = $$30000000-0000-0000-0000-000000000003$$ AND effective_from = DATE $$2026-06-01$$);

-- TD Aeroplan Visa Infinite (...004): demote Travel 1.5 -> 1, add Air Canada 1.5x. Gas & Transit 1.5x stays. [td.com]
UPDATE card_multipliers SET earn_rate = 1 WHERE id = $$7994ee12-7e2f-4e7a-9f43-26542a542ae9$$ AND earn_rate = 1.50;
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT $$20000000-0000-0000-0000-000000000004$$, $$30000000-0000-0000-0000-000000000011$$, 1.5, $$points$$, 1, DATE $$2026-06-01$$,
       $$1.5x Aeroplan on Air Canada direct purchases$$
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers WHERE card_id = $$20000000-0000-0000-0000-000000000004$$ AND category_id = $$30000000-0000-0000-0000-000000000011$$ AND effective_from = DATE $$2026-06-01$$);

-- TD Aeroplan Visa Infinite Privilege (...012): demote Travel 2 -> 1.5 (keep fb 1.25), add Air Canada 2x. [td.com]
UPDATE card_multipliers SET earn_rate = 1.5 WHERE id = $$442a6e96-385a-40b8-ab7d-6628c36e34b7$$ AND earn_rate = 2.00;
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT $$20000000-0000-0000-0000-000000000012$$, $$30000000-0000-0000-0000-000000000011$$, 2, $$points$$, 1.25, DATE $$2026-06-01$$,
       $$2x Aeroplan on Air Canada direct purchases$$
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers WHERE card_id = $$20000000-0000-0000-0000-000000000012$$ AND category_id = $$30000000-0000-0000-0000-000000000011$$ AND effective_from = DATE $$2026-06-01$$);

-- TD Aeroplan Visa Platinum (...063): the existing Travel 1x row IS Air Canada direct (1 pt/$1) -- repoint to
-- Air Canada (...011) and set its fallback to the card base 0.67; general travel then falls through to
-- Everything Else 0.67x. Gas & Transit 1x stays. [td.com]
UPDATE card_multipliers SET category_id = $$30000000-0000-0000-0000-000000000011$$, fallback_earn_rate = 0.67
  WHERE id = $$99f788f7-7857-4eff-a87c-421501850c16$$ AND category_id = $$30000000-0000-0000-0000-000000000003$$;

-- CIBC Aeroplan Visa Infinite (...077): (A) demote Travel 1.5 -> 1, add Air Canada 1.5x; (B) Gas/EV earns 1.5x
-- but transit does not -- repoint the combined Gas & Transit row to Gas-only (...012); transit falls through to
-- Everything Else 1x. (Groceries 1.5x is missing entirely -- out of this group's scope, see report.) [cibc.com]
UPDATE card_multipliers SET earn_rate = 1 WHERE id = $$02a00da2-1af0-4e0c-946b-5ada697700b8$$ AND earn_rate = 1.50;
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT $$20000000-0000-0000-0000-000000000077$$, $$30000000-0000-0000-0000-000000000011$$, 1.5, $$points$$, 1, DATE $$2026-06-01$$,
       $$1.5x Aeroplan on Air Canada direct purchases$$
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers WHERE card_id = $$20000000-0000-0000-0000-000000000077$$ AND category_id = $$30000000-0000-0000-0000-000000000011$$ AND effective_from = DATE $$2026-06-01$$);
UPDATE card_multipliers SET category_id = $$30000000-0000-0000-0000-000000000012$$ WHERE id = $$0b5b61d8-bbd4-47b8-9e48-f73dbb0dd0f2$$ AND category_id = $$30000000-0000-0000-0000-000000000004$$;

-- CIBC Aeroplan Visa Infinite Privilege (...023): demote Travel 2 -> 1.5 (keep fb 1.25), add Air Canada 2x. [cibc.com]
UPDATE card_multipliers SET earn_rate = 1.5 WHERE id = $$a0e244a5-4420-41a2-a9ea-82efaf3d5b50$$ AND earn_rate = 2.00;
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT $$20000000-0000-0000-0000-000000000023$$, $$30000000-0000-0000-0000-000000000011$$, 2, $$points$$, 1.25, DATE $$2026-06-01$$,
       $$2x Aeroplan on Air Canada direct purchases$$
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers WHERE card_id = $$20000000-0000-0000-0000-000000000023$$ AND category_id = $$30000000-0000-0000-0000-000000000011$$ AND effective_from = DATE $$2026-06-01$$);

-- ============================== Travel portal demotions (conservative default) ==============================
-- CIBC Aventura Visa Infinite (...009): Travel 2x is CIBC Rewards Centre (Expedia) portal-only -> demote to base 1.
-- Gas & Transit 1.5x stays. [cibc.com]
UPDATE card_multipliers SET earn_rate = 1 WHERE id = $$bf3e7151-6379-4cdd-8da2-15073dfe2de5$$ AND earn_rate = 2.00;
-- TD First Class Travel Visa Infinite (...005): Travel 8x is Expedia-For-TD-only -> demote to base 2. [td.com]
UPDATE card_multipliers SET earn_rate = 2 WHERE id = $$87aa710f-0c85-4bfa-b1ac-a8f573757419$$ AND earn_rate = 8.00;
-- TD Platinum Travel Visa (...013): Travel 6x is Expedia-For-TD-only -> demote to base 1.5. [td.com]
UPDATE card_multipliers SET earn_rate = 1.5 WHERE id = $$5482eaf2-a44b-4365-b8b3-4187a9a73735$$ AND earn_rate = 6.00;
-- TD Rewards Visa Card (...061): Travel 4x is Expedia-For-TD-only -> demote to base 1. [td.com]
UPDATE card_multipliers SET earn_rate = 1 WHERE id = $$aede16c2-8607-4029-898e-e9e506cbb491$$ AND earn_rate = 4.00;

-- ============================== Gas/Transit scope splits (transit keeps bonus, gas falls through) ==============================
-- TD First Class Travel VI (...005): combined 6x is Public Transit only -> repoint to Transit (...014); gas falls to base 2.
-- (Keeps fb 2 and no cap.) Groceries/Dining 6x stay. [td.com]
UPDATE card_multipliers SET category_id = $$30000000-0000-0000-0000-000000000014$$ WHERE id = $$d5110f18-33a2-48e9-a729-323e6bf05ae8$$ AND category_id = $$30000000-0000-0000-0000-000000000004$$;
-- TD Platinum Travel Visa (...013): combined 4.5x ($15k/yr cap) is Public Transit only -> repoint to Transit (...014); gas falls to base 1.5. [td.com]
UPDATE card_multipliers SET category_id = $$30000000-0000-0000-0000-000000000014$$ WHERE id = $$0c86c8fc-9011-4fe1-bfec-06cea5e5fa6d$$ AND category_id = $$30000000-0000-0000-0000-000000000004$$;
-- TD Rewards Visa Card (...061): combined 3x is Public Transit only -> repoint to Transit (...014); gas falls to base 1. [td.com]
UPDATE card_multipliers SET category_id = $$30000000-0000-0000-0000-000000000014$$ WHERE id = $$523cd372-bb83-4113-a4d8-442621639b1a$$ AND category_id = $$30000000-0000-0000-0000-000000000004$$;

-- Scotiabank Passport Visa Infinite (...008): combined 2x is daily Transit only -> repoint to Transit (...014); gas falls to base 1.
-- Migrate its shared $50k/yr cap group (...048002) member from gas-transit (...004) to transit (...014). [scotiabank.com]
UPDATE card_multipliers SET category_id = $$30000000-0000-0000-0000-000000000014$$ WHERE id = $$127b5dc3-a6cb-44c5-8823-6d44287176d6$$ AND category_id = $$30000000-0000-0000-0000-000000000004$$;
UPDATE cap_group_categories SET category_id = $$30000000-0000-0000-0000-000000000014$$
  WHERE cap_group_id = $$40000000-0000-0000-0000-000000048002$$ AND category_id = $$30000000-0000-0000-0000-000000000004$$;

-- MBNA Smart Cash Platinum Plus Mastercard (...050): combined 2% is Gas only -> repoint to Gas (...012); transit falls to base 0.5%.
-- Migrate its shared $500/mo cap group (...048006) member from gas-transit (...004) to gas (...012). Groceries 2% stays. [mbna.ca]
UPDATE card_multipliers SET category_id = $$30000000-0000-0000-0000-000000000012$$ WHERE id = $$98dedd7a-3847-49a0-af42-860f4a7cdd4b$$ AND category_id = $$30000000-0000-0000-0000-000000000004$$;
UPDATE cap_group_categories SET category_id = $$30000000-0000-0000-0000-000000000012$$
  WHERE cap_group_id = $$40000000-0000-0000-0000-000000048006$$ AND category_id = $$30000000-0000-0000-0000-000000000004$$;

-- Desjardins Cash Back Visa (...053): combined 2% is alternative transportation (transit/rideshare) only -> repoint to
-- Transit (...014); gas/fuel falls to base 0.5%. Dining 2% stays. [desjardins.com]
UPDATE card_multipliers SET category_id = $$30000000-0000-0000-0000-000000000014$$ WHERE id = $$9a4a0cc0-efe2-43ec-9863-2168b16961c8$$ AND category_id = $$30000000-0000-0000-0000-000000000004$$;
-- Desjardins Odyssey World Elite Mastercard (...037): combined 2% is Transit only -> repoint to Transit (...014); gas falls to base 1.5%.
-- (Keeps its $6k/yr cap on the transit row.) Groceries 3% stays. [desjardins.com]
UPDATE card_multipliers SET category_id = $$30000000-0000-0000-0000-000000000014$$ WHERE id = $$43c38c90-fe53-404f-906b-876eb28b1884$$ AND category_id = $$30000000-0000-0000-0000-000000000004$$;

-- American Express Gold Rewards (...002, audit name "American Express Gold Rewards Card"): combined Gas & Transit 2x --
-- gas earns 2x but local/commuter transit is excluded -> repoint to Gas (...012); transit falls through to Everything Else.
-- No cap_group on this card (verified). Resolved id 64d7417f. [americanexpress.com]
UPDATE card_multipliers SET category_id = $$30000000-0000-0000-0000-000000000012$$ WHERE id = $$64d7417f-a3a6-4993-80b8-11dceb2ff8e8$$ AND category_id = $$30000000-0000-0000-0000-000000000004$$;

-- ============================== Gas/Transit splits where gas/transit earn DIFFERENT bonuses ==============================
-- CIBC Dividend Visa Infinite (...024): Gas 4%, Transit 2% (separate tiers) -- repoint combined 4% row to Gas (...012)
-- and add a Transit 2% row. Groceries 4% / Dining 2% stay. [cibc.com]
UPDATE card_multipliers SET category_id = $$30000000-0000-0000-0000-000000000012$$ WHERE id = $$dfe2ead8-0f03-4c0f-85cf-65bdef541f7b$$ AND category_id = $$30000000-0000-0000-0000-000000000004$$;
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT $$20000000-0000-0000-0000-000000000024$$, $$30000000-0000-0000-0000-000000000014$$, 2, $$cashback_pct$$, 1, DATE $$2026-06-01$$,
       $$2% cash back on transit/transportation$$
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers WHERE card_id = $$20000000-0000-0000-0000-000000000024$$ AND category_id = $$30000000-0000-0000-0000-000000000014$$ AND effective_from = DATE $$2026-06-01$$);

-- BMO CashBack World Elite Mastercard (...021): Transit 4%, Gas & EV 3% ($300/mo cap) -- repoint the combined 4% row
-- (currently cap $300/mo) to Transit-only (...014) AND drop its cap (the $300 cap belongs to gas); add a Gas 3% row with
-- the $300/mo cap. Groceries 5% / Recurring Bills 2% stay. [milesopedia.com / ratehub.ca]
UPDATE card_multipliers SET category_id = $$30000000-0000-0000-0000-000000000014$$, cap_amount = NULL, cap_period = NULL
  WHERE id = $$0f1dd19a-0f5f-4fdb-ab6a-3bca08f38f65$$ AND category_id = $$30000000-0000-0000-0000-000000000004$$ AND cap_amount = 300.00;
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, cap_amount, cap_period, fallback_earn_rate, effective_from, notes)
SELECT $$20000000-0000-0000-0000-000000000021$$, $$30000000-0000-0000-0000-000000000012$$, 3, $$cashback_pct$$, 300, $$monthly$$, 1, DATE $$2026-06-01$$,
       $$3% cash back on gas & EV charging (capped $300/mo)$$
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers WHERE card_id = $$20000000-0000-0000-0000-000000000021$$ AND category_id = $$30000000-0000-0000-0000-000000000012$$ AND effective_from = DATE $$2026-06-01$$);

-- ============================== Triangle (CT Money per-litre approximation) ==============================
-- Triangle Mastercard (...051): Gas & Transit 2% is really 5c/L CT Money at Gas+/Petro-Canada (per-litre, not %),
-- and there is no transit bonus -> repoint to Gas-only (...012) so transit falls to base; keep the ~2% effective
-- approximation already stored, refresh the note. [princeoftravel.com / triangle.canadiantire.ca]
UPDATE card_multipliers SET category_id = $$30000000-0000-0000-0000-000000000012$$,
       notes = $$approx: 5c/L CT Money at Gas+/Petro-Canada, modelled as ~2% effective; transit earns base$$
  WHERE id = $$e0225cea-602a-404d-a439-aae3abdedf30$$ AND category_id = $$30000000-0000-0000-0000-000000000004$$;
-- Triangle World Elite Mastercard (...052): Gas & Transit 3.5% is really 5c/L (regular) CT Money at Gas+ (per-litre),
-- no transit bonus -> repoint to Gas-only (...012); keep ~3.3% regular-grade approximation (premium uplift unrepresentable),
-- refresh note. The Groceries CT-Money value fix is the earn-rate group's, not this group's. [princeoftravel.com]
UPDATE card_multipliers SET category_id = $$30000000-0000-0000-0000-000000000012$$, earn_rate = 3.3,
       notes = $$approx: 5c/L CT Money at Gas+ (regular grade), modelled as ~3.3% at $1.50/L; transit earns base$$
  WHERE id = $$6f1f0949-b0a6-4918-be04-15d6c09d61b7$$ AND category_id = $$30000000-0000-0000-0000-000000000004$$ AND earn_rate = 3.50;

-- ============================== BMO Air Miles Mastercard (...092) AIR MILES Partners tier ==============================
-- 3 AIR MILES per $25 = 0.12 miles/$ at participating AIR MILES Partners. Uses the new merchant-network category
-- air-miles-partners (...016); won't match generic spend in the optimizer (opt-in bonus, noted in report). Groceries
-- 0.08 was added in 090. earn_type='miles', fallback to base 0.04. [savvynewcanadians.com]
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT $$20000000-0000-0000-0000-000000000092$$, $$30000000-0000-0000-0000-000000000016$$, 0.12, $$miles$$, 0.04, DATE $$2026-06-01$$,
       $$3 AIR MILES per $25 at participating AIR MILES Partners (=0.12 miles/$)$$
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers WHERE card_id = $$20000000-0000-0000-0000-000000000092$$ AND category_id = $$30000000-0000-0000-0000-000000000016$$ AND effective_from = DATE $$2026-06-01$$);
