-- Fixes migration 38's Wealthsimple inserts. The IDs 080/081 were already
-- taken by Amex business cards in earlier seeds; the ON CONFLICT DO NOTHING
-- in 38 caused both Wealthsimple cards to be silently skipped. This file
-- re-attempts the inserts with IDs that come after the current max (102).

INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000103', 'Wealthsimple Cash Card', 'Wealthsimple', 'visa', '10000000-0000-0000-0000-000000000028', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000104', 'Wealthsimple Visa Infinite', 'Wealthsimple', 'visa', '10000000-0000-0000-0000-000000000028', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, cap_amount, cap_period, fallback_earn_rate, notes)
VALUES
  ('20000000-0000-0000-0000-000000000103', '30000000-0000-0000-0000-000000000008', 1.0, 'cashback_pct', NULL, NULL, 1.0, '1% cashback on all purchases'),
  ('20000000-0000-0000-0000-000000000104', '30000000-0000-0000-0000-000000000008', 2.0, 'cashback_pct', NULL, NULL, 1.0, '2% cashback on all purchases — requires Premium or active direct deposit')
ON CONFLICT DO NOTHING;
