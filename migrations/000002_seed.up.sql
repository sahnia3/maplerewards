-- ============================================================
-- SEED DATA — Canadian loyalty programs, cards, categories
-- All IDs are fixed UUIDs so this migration is idempotent.
-- ============================================================

-- ── Loyalty Programs ──────────────────────────────────────────────────────────

INSERT INTO loyalty_programs (id, name, slug, currency_name, program_type, base_cpp) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Aeroplan',                        'aeroplan',       'Aeroplan Points',          'airline',  1.50),
  ('10000000-0000-0000-0000-000000000002', 'Amex Membership Rewards Canada',  'amex-mr-ca',     'Membership Rewards Points', 'bank',     1.65),
  ('10000000-0000-0000-0000-000000000003', 'RBC Avion',                       'rbc-avion',      'Avion Points',             'bank',     1.10),
  ('10000000-0000-0000-0000-000000000004', 'Scene+',                          'scene-plus',     'Scene+ Points',            'bank',     0.80),
  ('10000000-0000-0000-0000-000000000005', 'CIBC Aventura',                   'cibc-aventura',  'Aventura Points',          'bank',     1.00),
  ('10000000-0000-0000-0000-000000000006', 'TD Rewards',                      'td-rewards',     'TD Rewards Points',        'bank',     0.50),
  ('10000000-0000-0000-0000-000000000007', 'BMO Rewards',                     'bmo-rewards',    'BMO Rewards Points',       'bank',     0.71),
  ('10000000-0000-0000-0000-000000000008', 'WestJet Rewards',                 'westjet-rewards','WestJet Dollars',          'airline',  1.00),
  ('10000000-0000-0000-0000-000000000009', 'British Airways Executive Club',  'ba-avios',       'Avios',                    'airline',  1.40),
  ('10000000-0000-0000-0000-000000000010', 'Air France/KLM Flying Blue',      'flying-blue',    'Miles',                    'airline',  1.20),
  ('10000000-0000-0000-0000-000000000011', 'Cathay Pacific Asia Miles',       'asia-miles',     'Asia Miles',               'airline',  1.30)
ON CONFLICT (slug) DO NOTHING;

-- ── Cards ─────────────────────────────────────────────────────────────────────
-- welcome_bonus_points | min_spend (CAD) | months

INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months) VALUES
  -- American Express
  ('20000000-0000-0000-0000-000000000001', 'Amex Cobalt',                       'American Express', 'amex',       '10000000-0000-0000-0000-000000000002', 155.88,  15000,  3000.00, 3),
  ('20000000-0000-0000-0000-000000000002', 'Amex Gold Rewards',                 'American Express', 'amex',       '10000000-0000-0000-0000-000000000002', 250.00,  60000,  3000.00, 3),
  ('20000000-0000-0000-0000-000000000003', 'Amex Platinum',                     'American Express', 'amex',       '10000000-0000-0000-0000-000000000002', 799.00, 100000,  15000.00, 3),
  -- TD
  ('20000000-0000-0000-0000-000000000004', 'TD Aeroplan Visa Infinite',         'TD Bank',          'visa',       '10000000-0000-0000-0000-000000000001', 139.00,  20000,  1500.00, 3),
  ('20000000-0000-0000-0000-000000000005', 'TD First Class Travel Visa Infinite','TD Bank',         'visa',       '10000000-0000-0000-0000-000000000006', 120.00, 100000,  1000.00, 3),
  -- RBC
  ('20000000-0000-0000-0000-000000000006', 'RBC Avion Visa Infinite',           'Royal Bank',       'visa',       '10000000-0000-0000-0000-000000000003', 120.00,  35000,  5000.00, 3),
  ('20000000-0000-0000-0000-000000000007', 'RBC Avion Visa Platinum',           'Royal Bank',       'visa',       '10000000-0000-0000-0000-000000000003',  50.00,  15000,  1000.00, 3),
  -- Scotiabank
  ('20000000-0000-0000-0000-000000000008', 'Scotiabank Passport Visa Infinite', 'Scotiabank',       'visa',       '10000000-0000-0000-0000-000000000004', 150.00,  40000,  1000.00, 3),
  -- CIBC
  ('20000000-0000-0000-0000-000000000009', 'CIBC Aventura Visa Infinite',       'CIBC',             'visa',       '10000000-0000-0000-0000-000000000005', 139.00,  35000,  3000.00, 4),
  -- BMO
  ('20000000-0000-0000-0000-000000000010', 'BMO World Elite Mastercard',        'BMO',              'mastercard', '10000000-0000-0000-0000-000000000007', 150.00,  30000,  3000.00, 3)
ON CONFLICT DO NOTHING;

-- ── Categories ────────────────────────────────────────────────────────────────

INSERT INTO categories (id, name, slug, mcc_codes) VALUES
  ('30000000-0000-0000-0000-000000000001', 'Groceries',           'groceries',        ARRAY[5411,5422,5441,5451,5462,5499]),
  ('30000000-0000-0000-0000-000000000002', 'Dining',              'dining',           ARRAY[5812,5813,5814]),
  ('30000000-0000-0000-0000-000000000003', 'Travel',              'travel',           ARRAY[4112,4511,4722,7011,7512,3000,3001,3002]),
  ('30000000-0000-0000-0000-000000000004', 'Gas & Transit',       'gas-transit',      ARRAY[5541,5542,5172,4111,4131,4121]),
  ('30000000-0000-0000-0000-000000000005', 'Pharmacy',            'pharmacy',         ARRAY[5912,5122]),
  ('30000000-0000-0000-0000-000000000006', 'Entertainment',       'entertainment',    ARRAY[7832,7922,7929,7941,7996,7993]),
  ('30000000-0000-0000-0000-000000000007', 'Streaming & Digital', 'streaming-digital',ARRAY[4813,5815,7372,5045]),
  ('30000000-0000-0000-0000-000000000008', 'Everything Else',     'everything-else',  NULL)
ON CONFLICT (slug) DO NOTHING;

-- ── Card Multipliers ──────────────────────────────────────────────────────────
-- Format: card_id | category_id | earn_rate | earn_type | cap_amount | cap_period | fallback | notes

-- ---- Amex Cobalt (20000000-...001) ----
-- 5x food/drink/streaming (combined $2,500/month cap), 2x transit+travel, 1x else
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, cap_amount, cap_period, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001', 5.0,'points',2500,'monthly',1.0,'5x up to $2,500/month combined food & drink'),
  ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002', 5.0,'points',2500,'monthly',1.0,'5x up to $2,500/month combined food & drink'),
  ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000007', 5.0,'points',2500,'monthly',1.0,'5x on eligible streaming subscriptions'),
  ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003', 2.0,'points',NULL, NULL,      1.0,'2x on eligible travel purchases'),
  ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004', 2.0,'points',NULL, NULL,      1.0,'2x on transit'),
  ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000008', 1.0,'points',NULL, NULL,      1.0,'1x base')
ON CONFLICT DO NOTHING;

-- ---- Amex Gold Rewards (20000000-...002) ----
-- 2x groceries, dining, travel, gas, pharmacy; 1x else
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate) VALUES
  ('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001', 2.0,'points',1.0),
  ('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002', 2.0,'points',1.0),
  ('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000003', 2.0,'points',1.0),
  ('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000004', 2.0,'points',1.0),
  ('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000005', 2.0,'points',1.0),
  ('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000008', 1.0,'points',1.0)
ON CONFLICT DO NOTHING;

-- ---- Amex Platinum (20000000-...003) ----
-- 3x travel + dining; 1x else
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate) VALUES
  ('20000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000003', 3.0,'points',1.0),
  ('20000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000002', 3.0,'points',1.0),
  ('20000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000008', 1.0,'points',1.0)
ON CONFLICT DO NOTHING;

-- ---- TD Aeroplan Visa Infinite (20000000-...004) ----
-- 3x Air Canada (mapped to Travel), 1.5x groceries + gas, 1x else
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000003', 3.0,'points',1.0,'3x on Air Canada purchases (MCC 4511)'),
  ('20000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000001', 1.5,'points',1.0,'1.5x groceries'),
  ('20000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000004', 1.5,'points',1.0,'1.5x gas & transit'),
  ('20000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000008', 1.0,'points',1.0,'1x everything else')
ON CONFLICT DO NOTHING;

-- ---- TD First Class Travel VI (20000000-...005) ----
-- 8x TD Rewards on online travel (Expedia for TD); 2x everything else
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000003', 8.0,'points',2.0,'8x on Expedia for TD bookings; 2x direct'),
  ('20000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000008', 2.0,'points',2.0,'2x on all other purchases')
ON CONFLICT DO NOTHING;

-- ---- RBC Avion Visa Infinite (20000000-...006) ----
-- 1x flat — value comes from transfer partners (Avios, Asia Miles)
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000006','30000000-0000-0000-0000-000000000008', 1.0,'points',1.0,'1x flat — optimize via transfer partners')
ON CONFLICT DO NOTHING;

-- ---- RBC Avion Visa Platinum (20000000-...007) ----
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate) VALUES
  ('20000000-0000-0000-0000-000000000007','30000000-0000-0000-0000-000000000008', 1.0,'points',1.0)
ON CONFLICT DO NOTHING;

-- ---- Scotiabank Passport Visa Infinite (20000000-...008) ----
-- 3x groceries (Sobeys/IGA/FreshCo), 2x dining/entertainment/transit, 1x else
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000008','30000000-0000-0000-0000-000000000001', 3.0,'points',1.0,'3x at eligible grocery stores (Sobeys, IGA, FreshCo)'),
  ('20000000-0000-0000-0000-000000000008','30000000-0000-0000-0000-000000000002', 2.0,'points',1.0,'2x dining'),
  ('20000000-0000-0000-0000-000000000008','30000000-0000-0000-0000-000000000006', 2.0,'points',1.0,'2x entertainment'),
  ('20000000-0000-0000-0000-000000000008','30000000-0000-0000-0000-000000000004', 2.0,'points',1.0,'2x transit'),
  ('20000000-0000-0000-0000-000000000008','30000000-0000-0000-0000-000000000003', 2.0,'points',1.0,'2x travel'),
  ('20000000-0000-0000-0000-000000000008','30000000-0000-0000-0000-000000000008', 1.0,'points',1.0,'1x everything else')
ON CONFLICT DO NOTHING;

-- ---- CIBC Aventura Visa Infinite (20000000-...009) ----
-- 2x travel (CIBC Rewards Centre), 1.5x groceries/dining/gas/pharmacy, 1x else
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000009','30000000-0000-0000-0000-000000000003', 2.0,'points',1.0,'2x on travel via CIBC Rewards Centre'),
  ('20000000-0000-0000-0000-000000000009','30000000-0000-0000-0000-000000000001', 1.5,'points',1.0,'1.5x groceries'),
  ('20000000-0000-0000-0000-000000000009','30000000-0000-0000-0000-000000000002', 1.5,'points',1.0,'1.5x dining'),
  ('20000000-0000-0000-0000-000000000009','30000000-0000-0000-0000-000000000004', 1.5,'points',1.0,'1.5x gas & transit'),
  ('20000000-0000-0000-0000-000000000009','30000000-0000-0000-0000-000000000005', 1.5,'points',1.0,'1.5x pharmacy'),
  ('20000000-0000-0000-0000-000000000009','30000000-0000-0000-0000-000000000008', 1.0,'points',1.0,'1x everything else')
ON CONFLICT DO NOTHING;

-- ---- BMO World Elite Mastercard (20000000-...010) ----
-- 3x travel/dining/entertainment; 2x everything else
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate) VALUES
  ('20000000-0000-0000-0000-000000000010','30000000-0000-0000-0000-000000000003', 3.0,'points',2.0),
  ('20000000-0000-0000-0000-000000000010','30000000-0000-0000-0000-000000000002', 3.0,'points',2.0),
  ('20000000-0000-0000-0000-000000000010','30000000-0000-0000-0000-000000000006', 3.0,'points',2.0),
  ('20000000-0000-0000-0000-000000000010','30000000-0000-0000-0000-000000000008', 2.0,'points',2.0)
ON CONFLICT DO NOTHING;

-- ── Point Valuations (2026-03-03 estimates) ───────────────────────────────────

INSERT INTO point_valuations (loyalty_program_id, segment, cpp, source, effective_date) VALUES
  -- Base valuations
  ('10000000-0000-0000-0000-000000000001', 'base',     1.50, 'manual', '2026-03-03'),
  ('10000000-0000-0000-0000-000000000002', 'base',     1.65, 'manual', '2026-03-03'),
  ('10000000-0000-0000-0000-000000000003', 'base',     1.10, 'manual', '2026-03-03'),
  ('10000000-0000-0000-0000-000000000004', 'base',     0.80, 'manual', '2026-03-03'),
  ('10000000-0000-0000-0000-000000000005', 'base',     1.00, 'manual', '2026-03-03'),
  ('10000000-0000-0000-0000-000000000006', 'base',     0.50, 'manual', '2026-03-03'),
  ('10000000-0000-0000-0000-000000000007', 'base',     0.71, 'manual', '2026-03-03'),
  ('10000000-0000-0000-0000-000000000008', 'base',     1.00, 'manual', '2026-03-03'),
  ('10000000-0000-0000-0000-000000000009', 'base',     1.40, 'manual', '2026-03-03'),
  ('10000000-0000-0000-0000-000000000010', 'base',     1.20, 'manual', '2026-03-03'),
  ('10000000-0000-0000-0000-000000000011', 'base',     1.30, 'manual', '2026-03-03'),
  -- Sweet-spot business class valuations
  ('10000000-0000-0000-0000-000000000001', 'business', 2.50, 'manual', '2026-03-03'),
  ('10000000-0000-0000-0000-000000000009', 'business', 3.00, 'manual', '2026-03-03'),
  ('10000000-0000-0000-0000-000000000011', 'business', 2.80, 'manual', '2026-03-03')
ON CONFLICT (loyalty_program_id, segment, effective_date) DO NOTHING;

-- ── Transfer Partners (Canadian-validated routes only) ────────────────────────
-- Note: Canadian Amex MR cannot transfer to Marriott Bonvoy or Delta (US-only).

INSERT INTO transfer_partners (from_program_id, to_program_id, transfer_ratio, minimum_transfer, processing_days, notes) VALUES
  -- Amex MR Canada → partners
  ('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001', 1.0000, 1000, 2, 'Amex MR CA → Aeroplan 1:1'),
  ('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000009', 1.0000, 1000, 2, 'Amex MR CA → BA Avios 1:1'),
  ('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000010', 1.0000, 1000, 2, 'Amex MR CA → Flying Blue 1:1'),
  ('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000011', 1.0000, 1000, 2, 'Amex MR CA → Asia Miles 1:1'),
  -- RBC Avion → partners
  ('10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000009', 1.0000, 5000, 3, 'RBC Avion → BA Avios 1:1'),
  ('10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000011', 1.0000, 5000, 3, 'RBC Avion → Asia Miles 1:1')
ON CONFLICT DO NOTHING;

-- ── Aeroplan 2026 SQC Thresholds ─────────────────────────────────────────────

INSERT INTO aeroplan_status_thresholds (status_level, sqc_required, min_revenue_cad, effective_year) VALUES
  ('25K',        25000,  NULL,    2026),
  ('35K',        35000,  NULL,    2026),
  ('50K',        50000,  3000.00, 2026),
  ('75K',        75000,  6000.00, 2026),
  ('Super Elite',100000, 12000.00,2026)
ON CONFLICT DO NOTHING;
