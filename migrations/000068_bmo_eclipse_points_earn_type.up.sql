-- Card-data correction batch 9 (2026-05-27; follows 000059-000067).
-- VALUE-MODEL FIX: BMO eclipse VI/VIP are BMO Rewards POINTS cards (5 pts/$ on
-- bonus categories) but were seeded earn_type=cashback_pct, so the optimizer
-- valued "5 points" as "5%" (~5c/$) instead of 5 x 0.71c = ~3.55c/$ — over-
-- valuing the cards ~40%.
--
-- The sibling BMO Rewards points cards already use the correct convention:
-- BMO Ascend WE, BMO World Elite MC, and BMO Rewards MC are all earn_type=points
-- and the optimizer applies the program CPP. BMO Rewards base_cpp = 0.71c is
-- already set in loyalty_programs. Align eclipse VI/VIP to earn_type=points so
-- the same CPP is applied.
--
-- The genuine BMO *CashBack* cards (CashBack WE/MC) are real cash back and
-- correctly remain earn_type=cashback_pct — not touched.

UPDATE card_multipliers SET earn_type = 'points'
WHERE card_id IN (SELECT id FROM cards WHERE name IN ('BMO eclipse Visa Infinite', 'BMO eclipse Visa Infinite Privilege'))
  AND earn_type = 'cashback_pct';
