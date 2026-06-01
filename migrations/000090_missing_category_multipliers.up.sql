-- Structural-data corrections, step 2 of 4: missing-category multiplier rows (2026-06-01).
-- Inserts accelerated-earn rows that were entirely absent from the live DB, using ONLY the
-- pre-existing taxonomy categories (Groceries, Entertainment, Travel, Recurring Bills). Rows
-- that require a NEW category (Air Canada, AIR MILES Partners) or that demote/split an existing
-- row are handled in 092; rows the research deemed unrepresentable are documented in
-- migrations/000089_STRUCTURAL_REPORT.md, not inserted.
--
-- Each INSERT is gated with WHERE NOT EXISTS on the unique key (card_id, category_id,
-- effective_from) so it is idempotent and cannot violate the constraint. effective_from is the
-- fixed migration date 2026-06-01 (distinct from the existing rows' 2026-04-05 / 2026-05-27
-- dates, so no collision). earn_type is chosen per the card's true program (Scene+ -> 'points',
-- BMO Air Miles -> 'miles'); the existing mislabeled base rows on these cards are corrected in 091.
-- Dry-run inside BEGIN ... ROLLBACK before being written.

-- ============================== BMO Ascend World Elite Mastercard (...022) ==============================
-- Missing 3x BMO Rewards on recurring bill payments (uncapped per Prince of Travel; the card's
-- other accelerators have their own separate caps, so NO cap_group). card has dining/ent/travel/
-- everything-else only. category Recurring Bills (...010). [source: princeoftravel.com finding 22]
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT $$20000000-0000-0000-0000-000000000022$$, $$30000000-0000-0000-0000-000000000010$$, 3.00, $$points$$, 1.0, DATE $$2026-06-01$$,
       $$3x BMO Rewards on eligible recurring bill payments$$
WHERE NOT EXISTS (
  SELECT 1 FROM card_multipliers
  WHERE card_id = $$20000000-0000-0000-0000-000000000022$$ AND category_id = $$30000000-0000-0000-0000-000000000010$$
    AND effective_from = DATE $$2026-06-01$$
);

-- ============================== Scotiabank No-Fee Visa Card (...091) ==============================
-- Scene+ POINTS card; card had only everything-else. Mirrors sibling Scotiabank Scene+ Visa (...018):
-- 2x Scene+ at Sobeys/IGA/Safeway/Foodland/FreshCo/Co-ops and 2x at Cineplex. earn_type='points'
-- (the loyalty reassignment + base-row earn_type flip to points are in 091). [source: ratehub.ca finding 87]
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT $$20000000-0000-0000-0000-000000000091$$, $$30000000-0000-0000-0000-000000000001$$, 2.00, $$points$$, 1.0, DATE $$2026-06-01$$,
       $$2x Scene+ at Sobeys/IGA/Safeway/Foodland/FreshCo/Co-ops$$
WHERE NOT EXISTS (
  SELECT 1 FROM card_multipliers
  WHERE card_id = $$20000000-0000-0000-0000-000000000091$$ AND category_id = $$30000000-0000-0000-0000-000000000001$$
    AND effective_from = DATE $$2026-06-01$$
);
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT $$20000000-0000-0000-0000-000000000091$$, $$30000000-0000-0000-0000-000000000006$$, 2.00, $$points$$, 1.0, DATE $$2026-06-01$$,
       $$2x Scene+ at Cineplex$$
WHERE NOT EXISTS (
  SELECT 1 FROM card_multipliers
  WHERE card_id = $$20000000-0000-0000-0000-000000000091$$ AND category_id = $$30000000-0000-0000-0000-000000000006$$
    AND effective_from = DATE $$2026-06-01$$
);

-- ============================== Scotiabank Platinum American Express (...069) ==============================
-- Missing the 3x Scene+ Travel (Expedia) tier for hotels/car-rentals/things-to-do; card had only
-- everything-else 2x. Mapped to the broad Travel category (closest fit; portal-only scope noted) with
-- fallback_earn_rate=2.0 to reflect this card's 2x base. [source: scotiabank.com finding 89]
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT $$20000000-0000-0000-0000-000000000069$$, $$30000000-0000-0000-0000-000000000003$$, 3.00, $$points$$, 2.0, DATE $$2026-06-01$$,
       $$3x Scene+ on hotels, car rentals & things-to-do booked via Scene+ Travel (Expedia); all other purchases 2x$$
WHERE NOT EXISTS (
  SELECT 1 FROM card_multipliers
  WHERE card_id = $$20000000-0000-0000-0000-000000000069$$ AND category_id = $$30000000-0000-0000-0000-000000000003$$
    AND effective_from = DATE $$2026-06-01$$
);

-- ============================== BMO Air Miles Mastercard (...092) ==============================
-- Missing accelerated Groceries: 2 AIR MILES per $25 = 0.08 miles/$ (exact at 2dp). card had only
-- everything-else. earn_type='miles' (the base row's wrong 'points' label is corrected in 091; the
-- AIR MILES Partners tier needs the new category and lives in 092). [source: savvynewcanadians.com finding 19]
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT $$20000000-0000-0000-0000-000000000092$$, $$30000000-0000-0000-0000-000000000001$$, 0.08, $$miles$$, 0.04, DATE $$2026-06-01$$,
       $$2 AIR MILES per $25 at eligible grocery stores (=0.08 miles/$)$$
WHERE NOT EXISTS (
  SELECT 1 FROM card_multipliers
  WHERE card_id = $$20000000-0000-0000-0000-000000000092$$ AND category_id = $$30000000-0000-0000-0000-000000000001$$
    AND effective_from = DATE $$2026-06-01$$
);
