-- ── Power-user data corrections (2026-05-15 independent review) ──────────
-- Three additional data fixes flagged by the power-user persona review:
--   1. RBC Avion VI seeded as 1x flat — 2023 refresh added 1.25x on
--      grocery/gas/dining/streaming. Without these the optimizer wildly
--      underrates the card.
--   2. MBNA Rewards WE missing 5x first-$5K intro tier on grocery + dining.
--   3. Marriott Bonvoy → airline transfer routes absent despite the
--      devaluation_events table referencing the 3:1 + 5K bonus rule.

-- ── 1. RBC Avion Visa Infinite (id 006) ────────────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, cap_amount, cap_period, fallback_earn_rate, notes)
VALUES
  ('20000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000001', 1.25, 'points', NULL, NULL, 1.0, '1.25x Avion points on groceries'),
  ('20000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000002', 1.25, 'points', NULL, NULL, 1.0, '1.25x Avion points on dining'),
  ('20000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000004', 1.25, 'points', NULL, NULL, 1.0, '1.25x Avion points on gas & transit'),
  ('20000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000007', 1.25, 'points', NULL, NULL, 1.0, '1.25x Avion points on streaming')
ON CONFLICT DO NOTHING;

-- ── 2. MBNA Rewards World Elite (id 048) ─────────────────────────────────
-- 5x on groceries + dining capped at $5,000/year combined (intro tier);
-- after that the card earns 2x. Modelled here as annual caps on both
-- categories at $5,000 with fallback_earn_rate=2 (standard rate).
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, cap_amount, cap_period, fallback_earn_rate, notes)
VALUES
  ('20000000-0000-0000-0000-000000000048', '30000000-0000-0000-0000-000000000001', 5.0, 'points', 5000.00, 'annual', 2.0, '5x on first $5K/yr groceries; 2x thereafter'),
  ('20000000-0000-0000-0000-000000000048', '30000000-0000-0000-0000-000000000002', 5.0, 'points', 5000.00, 'annual', 2.0, '5x on first $5K/yr dining; 2x thereafter')
ON CONFLICT DO NOTHING;

-- ── 3. Marriott Bonvoy → airline transfers ─────────────────────────────────
-- Marriott uses a 3:1 ratio to most airline partners, with a 5,000-point
-- bonus per 60,000 points transferred — effectively 60K MR → 25K airline
-- (rather than the headline 20K). The bonus is captured in `notes` so the
-- AI tools can reason about it; the headline ratio is the 3:1 base.
-- Marriott Bonvoy program id = 10000000-0000-0000-0000-000000000013.
INSERT INTO transfer_partners (from_program_id, to_program_id, transfer_ratio, minimum_transfer, transfer_increment, processing_days, is_active, notes)
VALUES
  ('10000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001', 0.3333, 3000, 3000, 5, true, 'Marriott → Aeroplan 3:1; +5K bonus per 60K transferred'),
  ('10000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000009', 0.3333, 3000, 3000, 5, true, 'Marriott → BA Avios 3:1; +5K bonus per 60K transferred'),
  ('10000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000010', 0.3333, 3000, 3000, 5, true, 'Marriott → Flying Blue 3:1; +5K bonus per 60K transferred'),
  ('10000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000011', 0.3333, 3000, 3000, 5, true, 'Marriott → Asia Miles 3:1; +5K bonus per 60K transferred'),
  ('10000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000008', 0.3333, 3000, 3000, 5, true, 'Marriott → WestJet Rewards 3:1; +5K bonus per 60K transferred')
ON CONFLICT (from_program_id, to_program_id, effective_from) DO NOTHING;
