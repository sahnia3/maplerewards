-- ============================================================
-- EXPANDED CARDS MIGRATION
-- Adds additional loyalty programs, 30+ new cards,
-- card multipliers, transfer partners, and point valuations.
-- All IDs are fixed UUIDs for idempotency.
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- LOYALTY PROGRAMS
-- ══════════════════════════════════════════════════════════════

-- PC Optimum (cashback) — 10,000 pts = $10 => 0.10 cents/pt
INSERT INTO loyalty_programs (id, name, slug, currency_name, program_type, base_cpp, is_active)
VALUES ('10000000-0000-0000-0000-000000000012', 'PC Optimum', 'pc-optimum', 'PC Optimum Points', 'cashback', 0.1000, true)
ON CONFLICT (id) DO NOTHING;

-- Marriott Bonvoy (hotel) — avg ~0.80 CPP
INSERT INTO loyalty_programs (id, name, slug, currency_name, program_type, base_cpp, is_active)
VALUES ('10000000-0000-0000-0000-000000000013', 'Marriott Bonvoy', 'marriott-bonvoy', 'Bonvoy Points', 'hotel', 0.8000, true)
ON CONFLICT (id) DO NOTHING;

-- Hilton Honors (hotel) — avg ~0.50 CPP
INSERT INTO loyalty_programs (id, name, slug, currency_name, program_type, base_cpp, is_active)
VALUES ('10000000-0000-0000-0000-000000000014', 'Hilton Honors', 'hilton-honors', 'Hilton Honors Points', 'hotel', 0.5000, true)
ON CONFLICT (id) DO NOTHING;

-- World of Hyatt (hotel) — avg ~1.80 CPP
INSERT INTO loyalty_programs (id, name, slug, currency_name, program_type, base_cpp, is_active)
VALUES ('10000000-0000-0000-0000-000000000015', 'World of Hyatt', 'world-of-hyatt', 'World of Hyatt Points', 'hotel', 1.8000, true)
ON CONFLICT (id) DO NOTHING;

-- National Bank Rewards (bank) — travel portal ~1.00 CPP
INSERT INTO loyalty_programs (id, name, slug, currency_name, program_type, base_cpp, is_active)
VALUES ('10000000-0000-0000-0000-000000000016', 'National Bank Rewards', 'nbc-rewards', 'NBC Rewards Points', 'bank', 1.0000, true)
ON CONFLICT (id) DO NOTHING;

-- Air Miles (cashback/travel hybrid) — ~0.15 CPP per mile (cash) or ~0.21 dream
INSERT INTO loyalty_programs (id, name, slug, currency_name, program_type, base_cpp, is_active)
VALUES ('10000000-0000-0000-0000-000000000017', 'Air Miles', 'air-miles', 'AIR MILES Reward Miles', 'cashback', 0.1500, true)
ON CONFLICT (id) DO NOTHING;

-- Brim Rewards (bank) — ~1.00 CPP via travel
INSERT INTO loyalty_programs (id, name, slug, currency_name, program_type, base_cpp, is_active)
VALUES ('10000000-0000-0000-0000-000000000018', 'Brim Rewards', 'brim-rewards', 'Brim Points', 'bank', 1.0000, true)
ON CONFLICT (id) DO NOTHING;

-- Desjardins Bonusdollars (bank) — ~1.00 CPP as travel credit
INSERT INTO loyalty_programs (id, name, slug, currency_name, program_type, base_cpp, is_active)
VALUES ('10000000-0000-0000-0000-000000000019', 'Desjardins Bonusdollars', 'desjardins-bonusdollars', 'BONUSDOLLARS', 'bank', 1.0000, true)
ON CONFLICT (id) DO NOTHING;


-- ══════════════════════════════════════════════════════════════
-- CARDS (30+ new cards)
-- ══════════════════════════════════════════════════════════════

-- ── TD Cards ────────────────────────────────────────────────

-- TD Cash Back Visa Infinite — $139/yr (1st yr waived), 3% groceries/gas/transit/streaming/bills, 1% else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000011', 'TD Cash Back Visa Infinite', 'TD Bank', 'visa', '10000000-0000-0000-0000-000000000006', 139.00, 0, 3500.00, 3, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- TD Aeroplan Visa Infinite Privilege — $599/yr, up to 85,000 bonus pts
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000012', 'TD Aeroplan Visa Infinite Privilege', 'TD Bank', 'visa', '10000000-0000-0000-0000-000000000001', 599.00, 55000, 12000.00, 6, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- TD Platinum Travel Visa — $89/yr (1st yr waived), earn TD Rewards
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000013', 'TD Platinum Travel Visa', 'TD Bank', 'visa', '10000000-0000-0000-0000-000000000006', 89.00, 50000, 1000.00, 3, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── RBC Cards ───────────────────────────────────────────────

-- RBC WestJet World Elite Mastercard — $139/yr, up to 45,000 WJ pts
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000014', 'RBC WestJet World Elite Mastercard', 'Royal Bank', 'mastercard', '10000000-0000-0000-0000-000000000008', 139.00, 45000, 5000.00, 3, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- RBC Cash Back Mastercard — $0/yr, 2% groceries, 0.5% else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000015', 'RBC Cash Back Mastercard', 'Royal Bank', 'mastercard', '10000000-0000-0000-0000-000000000003', 0.00, 0, 1000.00, 3, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- RBC ION+ Visa — $48/yr, 3x groceries/dining/gas/streaming, 1x else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000016', 'RBC ION+ Visa', 'Royal Bank', 'visa', '10000000-0000-0000-0000-000000000003', 48.00, 21000, 1500.00, 6, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── Scotiabank Cards ────────────────────────────────────────

-- Scotiabank Gold American Express — $120/yr, up to 45,000 Scene+ pts
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000017', 'Scotiabank Gold American Express', 'Scotiabank', 'amex', '10000000-0000-0000-0000-000000000004', 120.00, 45000, 7500.00, 12, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- Scotiabank Scene+ Visa — $0/yr, 1 Scene+/$1 everywhere
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000018', 'Scotiabank Scene+ Visa', 'Scotiabank', 'visa', '10000000-0000-0000-0000-000000000004', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- Scotia Momentum Visa Infinite — $120/yr, 4% groceries+bills, 2% gas/transit/recurring, 1% else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000019', 'Scotia Momentum Visa Infinite', 'Scotiabank', 'visa', '10000000-0000-0000-0000-000000000004', 120.00, 0, 2000.00, 3, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── BMO Cards ───────────────────────────────────────────────

-- BMO Air Miles World Elite Mastercard — $120/yr (1st yr waived), up to 7,000 Air Miles
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000020', 'BMO Air Miles World Elite Mastercard', 'BMO', 'mastercard', '10000000-0000-0000-0000-000000000017', 120.00, 7000, 4500.00, 4, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- BMO CashBack World Elite Mastercard — $120/yr (1st yr waived), 5% groceries, 4% transit, 3% gas, 1% else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000021', 'BMO CashBack World Elite Mastercard', 'BMO', 'mastercard', '10000000-0000-0000-0000-000000000007', 120.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- BMO Ascend World Elite Mastercard — $150/yr, up to 115,000 BMO Rewards pts
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000022', 'BMO Ascend World Elite Mastercard', 'BMO', 'mastercard', '10000000-0000-0000-0000-000000000007', 150.00, 60000, 5000.00, 4, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── CIBC Cards ──────────────────────────────────────────────

-- CIBC Aeroplan Visa Infinite Privilege — $599/yr, up to 100,000 Aeroplan pts
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000023', 'CIBC Aeroplan Visa Infinite Privilege', 'CIBC', 'visa', '10000000-0000-0000-0000-000000000001', 599.00, 50000, 5000.00, 4, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- CIBC Dividend Visa Infinite — $120/yr, 4% gas+groceries, 2% transport+dining+bills, 1% else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000024', 'CIBC Dividend Visa Infinite', 'CIBC', 'visa', '10000000-0000-0000-0000-000000000005', 120.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- CIBC Costco Mastercard — $0/yr (Costco members), 3% restaurants+Costco gas, 2% Costco.ca+gas, 1% else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000025', 'CIBC Costco Mastercard', 'CIBC', 'mastercard', '10000000-0000-0000-0000-000000000005', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── American Express Cards ──────────────────────────────────

-- Amex SimplyCash — $0/yr, 1.25% flat cashback
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000026', 'SimplyCash Card from American Express', 'American Express', 'amex', '10000000-0000-0000-0000-000000000002', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- Amex SimplyCash Preferred — $119.88/yr ($9.99/mo), 4% gas+groceries, 2% else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000027', 'SimplyCash Preferred Card from American Express', 'American Express', 'amex', '10000000-0000-0000-0000-000000000002', 119.88, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- Amex Aeroplan Card — $120/yr, 2x Air Canada, 1x else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000028', 'American Express Aeroplan Card', 'American Express', 'amex', '10000000-0000-0000-0000-000000000001', 120.00, 25000, 7500.00, 6, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── National Bank ───────────────────────────────────────────

-- National Bank World Elite Mastercard — $150/yr, 5x groceries+dining, 2x else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000029', 'National Bank World Elite Mastercard', 'National Bank', 'mastercard', '10000000-0000-0000-0000-000000000016', 150.00, 40000, 5000.00, 3, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── PC Financial ────────────────────────────────────────────

-- PC Mastercard — $0/yr, 1% everywhere (10 pts/$1), 2.5% Shoppers (25 pts/$1)
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000030', 'PC Mastercard', 'PC Financial', 'mastercard', '10000000-0000-0000-0000-000000000012', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- PC World Elite Mastercard — $0/yr, 3% Loblaw groceries, 4.5% Shoppers, 1% else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000031', 'PC World Elite Mastercard', 'PC Financial', 'mastercard', '10000000-0000-0000-0000-000000000012', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── Rogers Bank ─────────────────────────────────────────────

-- Rogers Red World Elite Mastercard — $0/yr, 1.5% CAD (2% w/ Rogers service), 3% USD
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000032', 'Rogers Red World Elite Mastercard', 'Rogers Bank', 'mastercard', '10000000-0000-0000-0000-000000000006', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── Tangerine ───────────────────────────────────────────────

-- Tangerine Money-Back Credit Card — $0/yr, 2% in up to 3 categories, 0.5% else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000033', 'Tangerine Money-Back Credit Card', 'Tangerine', 'mastercard', '10000000-0000-0000-0000-000000000006', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── Simplii Financial ───────────────────────────────────────

-- Simplii Cash Back Visa — $0/yr, 4% dining, 1.5% groceries+gas+drugstores, 0.5% else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000034', 'Simplii Cash Back Visa', 'Simplii Financial', 'visa', '10000000-0000-0000-0000-000000000006', 0.00, 0, 500.00, 3, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── Neo Financial ───────────────────────────────────────────

-- Neo Mastercard — $0/yr, avg 5% at Neo partners, 1% elsewhere
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000035', 'Neo Mastercard', 'Neo Financial', 'mastercard', '10000000-0000-0000-0000-000000000006', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── Brim Financial ──────────────────────────────────────────

-- Brim World Elite Mastercard — $199/yr (1st yr waived), 2x everywhere (up to $25k), no FX markup 1.5%
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000036', 'Brim World Elite Mastercard', 'Brim Financial', 'mastercard', '10000000-0000-0000-0000-000000000018', 199.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── Desjardins ──────────────────────────────────────────────

-- Desjardins Odyssey World Elite Mastercard — $130/yr, 3% groceries, 2% dining+entertainment+transport, 1.5% else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000037', 'Desjardins Odyssey World Elite Mastercard', 'Desjardins', 'mastercard', '10000000-0000-0000-0000-000000000019', 130.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── Additional premium cards ────────────────────────────────

-- Amex Aeroplan Reserve — $599/yr, 3x Air Canada, 2x dining, 1.25x else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000038', 'American Express Aeroplan Reserve', 'American Express', 'amex', '10000000-0000-0000-0000-000000000001', 599.00, 85000, 7500.00, 3, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- CIBC Aventura Visa Infinite Privilege — premium Aventura card
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000039', 'CIBC Aventura Visa Infinite Privilege', 'CIBC', 'visa', '10000000-0000-0000-0000-000000000005', 499.00, 60000, 5000.00, 4, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- RBC Avion Visa Infinite Privilege — premium Avion card
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000040', 'RBC Avion Visa Infinite Privilege', 'Royal Bank', 'visa', '10000000-0000-0000-0000-000000000003', 399.00, 55000, 5000.00, 3, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- Neo World Elite Mastercard — $125/yr, 5% groceries, 4% bills, 3% gas, 1% else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000041', 'Neo World Elite Mastercard', 'Neo Financial', 'mastercard', '10000000-0000-0000-0000-000000000006', 125.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;


-- ══════════════════════════════════════════════════════════════
-- CARD MULTIPLIERS
-- ══════════════════════════════════════════════════════════════

-- ──── TD Cash Back Visa Infinite (011) ──────────────────────
-- 3% groceries, gas, transit, streaming, bills; 1% else (cashback — use cashback_pct)
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, cap_amount, cap_period, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000011','30000000-0000-0000-0000-000000000001', 3.0,'cashback_pct',15000,'annual',1.0,'3% on groceries up to $15k/yr'),
  ('20000000-0000-0000-0000-000000000011','30000000-0000-0000-0000-000000000004', 3.0,'cashback_pct',15000,'annual',1.0,'3% on gas & transit up to $15k/yr'),
  ('20000000-0000-0000-0000-000000000011','30000000-0000-0000-0000-000000000007', 3.0,'cashback_pct',15000,'annual',1.0,'3% on streaming & digital up to $15k/yr'),
  ('20000000-0000-0000-0000-000000000011','30000000-0000-0000-0000-000000000008', 1.0,'cashback_pct',NULL,NULL,1.0,'1% on everything else')
ON CONFLICT DO NOTHING;

-- ──── TD Aeroplan Visa Infinite Privilege (012) ─────────────
-- 2x Air Canada (Travel), 1.5x groceries/gas/dining/travel, 1.25x else
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000012','30000000-0000-0000-0000-000000000003', 2.0,'points',1.25,'2x on Air Canada; 1.5x on other travel'),
  ('20000000-0000-0000-0000-000000000012','30000000-0000-0000-0000-000000000001', 1.5,'points',1.25,'1.5x groceries'),
  ('20000000-0000-0000-0000-000000000012','30000000-0000-0000-0000-000000000004', 1.5,'points',1.25,'1.5x gas & transit'),
  ('20000000-0000-0000-0000-000000000012','30000000-0000-0000-0000-000000000002', 1.5,'points',1.25,'1.5x dining'),
  ('20000000-0000-0000-0000-000000000012','30000000-0000-0000-0000-000000000008', 1.25,'points',1.25,'1.25x everything else')
ON CONFLICT DO NOTHING;

-- ──── TD Platinum Travel Visa (013) ─────────────────────────
-- 6x Expedia for TD (travel), 4.5x groceries/dining/transit, 3x bills/streaming, 1.5x else
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, cap_amount, cap_period, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000013','30000000-0000-0000-0000-000000000003', 6.0,'points',NULL,NULL,1.5,'6x on Expedia for TD bookings'),
  ('20000000-0000-0000-0000-000000000013','30000000-0000-0000-0000-000000000001', 4.5,'points',15000,'annual',1.5,'4.5x groceries up to $15k/yr'),
  ('20000000-0000-0000-0000-000000000013','30000000-0000-0000-0000-000000000002', 4.5,'points',15000,'annual',1.5,'4.5x dining up to $15k/yr'),
  ('20000000-0000-0000-0000-000000000013','30000000-0000-0000-0000-000000000004', 4.5,'points',15000,'annual',1.5,'4.5x transit up to $15k/yr'),
  ('20000000-0000-0000-0000-000000000013','30000000-0000-0000-0000-000000000007', 3.0,'points',15000,'annual',1.5,'3x streaming up to $15k/yr'),
  ('20000000-0000-0000-0000-000000000013','30000000-0000-0000-0000-000000000008', 1.5,'points',NULL,NULL,1.5,'1.5x everything else')
ON CONFLICT DO NOTHING;

-- ──── RBC WestJet World Elite MC (014) ──────────────────────
-- 2x WestJet flights (travel), 2x groceries/gas/transit, 1.5x else
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000014','30000000-0000-0000-0000-000000000003', 2.0,'points',1.5,'2x on WestJet flights; 1.5x other travel'),
  ('20000000-0000-0000-0000-000000000014','30000000-0000-0000-0000-000000000001', 2.0,'points',1.5,'2x groceries'),
  ('20000000-0000-0000-0000-000000000014','30000000-0000-0000-0000-000000000004', 2.0,'points',1.5,'2x gas & transit'),
  ('20000000-0000-0000-0000-000000000014','30000000-0000-0000-0000-000000000008', 1.5,'points',1.5,'1.5x everything else')
ON CONFLICT DO NOTHING;

-- ──── RBC Cash Back Mastercard (015) ────────────────────────
-- 2% groceries (up to $6k), 0.5% else (1% after $6k)
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, cap_amount, cap_period, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000015','30000000-0000-0000-0000-000000000001', 2.0,'cashback_pct',6000,'annual',1.0,'2% on groceries up to $6k/yr then 1%'),
  ('20000000-0000-0000-0000-000000000015','30000000-0000-0000-0000-000000000008', 0.5,'cashback_pct',6000,'annual',1.0,'0.5% on all other up to $6k/yr then 1%')
ON CONFLICT DO NOTHING;

-- ──── RBC ION+ Visa (016) ───────────────────────────────────
-- 3x groceries/dining/gas/streaming, 1x else
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000016','30000000-0000-0000-0000-000000000001', 3.0,'points',1.0,'3x groceries'),
  ('20000000-0000-0000-0000-000000000016','30000000-0000-0000-0000-000000000002', 3.0,'points',1.0,'3x dining & food delivery'),
  ('20000000-0000-0000-0000-000000000016','30000000-0000-0000-0000-000000000004', 3.0,'points',1.0,'3x gas & transit'),
  ('20000000-0000-0000-0000-000000000016','30000000-0000-0000-0000-000000000007', 3.0,'points',1.0,'3x streaming & digital'),
  ('20000000-0000-0000-0000-000000000016','30000000-0000-0000-0000-000000000008', 1.0,'points',1.0,'1x everything else')
ON CONFLICT DO NOTHING;

-- ──── Scotiabank Gold Amex (017) ────────────────────────────
-- 6x eligible Sobeys/IGA groceries, 5x groceries/dining/entertainment, 3x gas/transit/streaming, 1x else
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000017','30000000-0000-0000-0000-000000000001', 5.0,'points',1.0,'5x groceries (6x at Sobeys/IGA/FreshCo)'),
  ('20000000-0000-0000-0000-000000000017','30000000-0000-0000-0000-000000000002', 5.0,'points',1.0,'5x dining'),
  ('20000000-0000-0000-0000-000000000017','30000000-0000-0000-0000-000000000006', 5.0,'points',1.0,'5x entertainment'),
  ('20000000-0000-0000-0000-000000000017','30000000-0000-0000-0000-000000000004', 3.0,'points',1.0,'3x gas & transit'),
  ('20000000-0000-0000-0000-000000000017','30000000-0000-0000-0000-000000000007', 3.0,'points',1.0,'3x streaming'),
  ('20000000-0000-0000-0000-000000000017','30000000-0000-0000-0000-000000000008', 1.0,'points',1.0,'1x everything else')
ON CONFLICT DO NOTHING;

-- ──── Scotiabank Scene+ Visa (018) ──────────────────────────
-- 1x everywhere flat
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000018','30000000-0000-0000-0000-000000000008', 1.0,'points',1.0,'1x flat on all purchases')
ON CONFLICT DO NOTHING;

-- ──── Scotia Momentum Visa Infinite (019) ───────────────────
-- 4% groceries + recurring bills, 2% gas/transit/food delivery, 1% else (cashback)
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, cap_amount, cap_period, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000019','30000000-0000-0000-0000-000000000001', 4.0,'cashback_pct',25000,'annual',1.0,'4% groceries up to $25k/yr'),
  ('20000000-0000-0000-0000-000000000019','30000000-0000-0000-0000-000000000004', 2.0,'cashback_pct',NULL,NULL,1.0,'2% gas & transit'),
  ('20000000-0000-0000-0000-000000000019','30000000-0000-0000-0000-000000000002', 2.0,'cashback_pct',NULL,NULL,1.0,'2% dining & food delivery'),
  ('20000000-0000-0000-0000-000000000019','30000000-0000-0000-0000-000000000007', 4.0,'cashback_pct',25000,'annual',1.0,'4% recurring bills/streaming'),
  ('20000000-0000-0000-0000-000000000019','30000000-0000-0000-0000-000000000008', 1.0,'cashback_pct',NULL,NULL,1.0,'1% everything else')
ON CONFLICT DO NOTHING;

-- ──── BMO Air Miles World Elite MC (020) ────────────────────
-- ~1 mile/$12 everywhere, 2x at groceries, 3x at AM partners (mapped to dining/entertainment for proxy)
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000020','30000000-0000-0000-0000-000000000001', 2.0,'miles',1.0,'2x miles at eligible grocery stores'),
  ('20000000-0000-0000-0000-000000000020','30000000-0000-0000-0000-000000000002', 3.0,'miles',1.0,'3x at Air Miles partners (restaurants)'),
  ('20000000-0000-0000-0000-000000000020','30000000-0000-0000-0000-000000000006', 3.0,'miles',1.0,'3x at Air Miles partners (entertainment)'),
  ('20000000-0000-0000-0000-000000000020','30000000-0000-0000-0000-000000000008', 1.0,'miles',1.0,'1 mile per $12 everywhere else')
ON CONFLICT DO NOTHING;

-- ──── BMO CashBack World Elite MC (021) ─────────────────────
-- 5% groceries, 4% transit ($300/mo cap), 3% gas ($300/mo cap), 2% bills ($500/mo cap), 1% else
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, cap_amount, cap_period, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000021','30000000-0000-0000-0000-000000000001', 5.0,'cashback_pct',NULL,NULL,1.0,'5% on groceries — no cap'),
  ('20000000-0000-0000-0000-000000000021','30000000-0000-0000-0000-000000000004', 4.0,'cashback_pct',300,'monthly',1.0,'4% transit up to $300/mo; 3% gas up to $300/mo'),
  ('20000000-0000-0000-0000-000000000021','30000000-0000-0000-0000-000000000007', 2.0,'cashback_pct',500,'monthly',1.0,'2% recurring bills up to $500/mo'),
  ('20000000-0000-0000-0000-000000000021','30000000-0000-0000-0000-000000000008', 1.0,'cashback_pct',NULL,NULL,1.0,'1% on everything else')
ON CONFLICT DO NOTHING;

-- ──── BMO Ascend World Elite MC (022) ───────────────────────
-- 5x travel ($15k/yr cap), 3x dining/entertainment/bills ($10k/yr each), 1x else
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, cap_amount, cap_period, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000022','30000000-0000-0000-0000-000000000003', 5.0,'points',15000,'annual',1.0,'5x travel up to $15k/yr'),
  ('20000000-0000-0000-0000-000000000022','30000000-0000-0000-0000-000000000002', 3.0,'points',10000,'annual',1.0,'3x dining up to $10k/yr'),
  ('20000000-0000-0000-0000-000000000022','30000000-0000-0000-0000-000000000006', 3.0,'points',10000,'annual',1.0,'3x entertainment up to $10k/yr'),
  ('20000000-0000-0000-0000-000000000022','30000000-0000-0000-0000-000000000007', 3.0,'points',10000,'annual',1.0,'3x recurring bills up to $10k/yr'),
  ('20000000-0000-0000-0000-000000000022','30000000-0000-0000-0000-000000000008', 1.0,'points',NULL,NULL,1.0,'1x everything else')
ON CONFLICT DO NOTHING;

-- ──── CIBC Aeroplan Visa Infinite Privilege (023) ───────────
-- 2x Air Canada (travel), 1.5x groceries/gas/dining/travel, 1.25x else
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000023','30000000-0000-0000-0000-000000000003', 2.0,'points',1.25,'2x Air Canada; 1.5x other travel'),
  ('20000000-0000-0000-0000-000000000023','30000000-0000-0000-0000-000000000001', 1.5,'points',1.25,'1.5x groceries'),
  ('20000000-0000-0000-0000-000000000023','30000000-0000-0000-0000-000000000004', 1.5,'points',1.25,'1.5x gas & EV charging'),
  ('20000000-0000-0000-0000-000000000023','30000000-0000-0000-0000-000000000002', 1.5,'points',1.25,'1.5x dining'),
  ('20000000-0000-0000-0000-000000000023','30000000-0000-0000-0000-000000000008', 1.25,'points',1.25,'1.25x everything else')
ON CONFLICT DO NOTHING;

-- ──── CIBC Dividend Visa Infinite (024) ─────────────────────
-- 4% gas+groceries, 2% transport+dining+bills, 1% else (cashback)
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000024','30000000-0000-0000-0000-000000000001', 4.0,'cashback_pct',1.0,'4% groceries'),
  ('20000000-0000-0000-0000-000000000024','30000000-0000-0000-0000-000000000004', 4.0,'cashback_pct',1.0,'4% gas & EV charging'),
  ('20000000-0000-0000-0000-000000000024','30000000-0000-0000-0000-000000000002', 2.0,'cashback_pct',1.0,'2% dining'),
  ('20000000-0000-0000-0000-000000000024','30000000-0000-0000-0000-000000000003', 2.0,'cashback_pct',1.0,'2% transportation/travel'),
  ('20000000-0000-0000-0000-000000000024','30000000-0000-0000-0000-000000000005', 2.0,'cashback_pct',1.0,'2% recurring bill payments'),
  ('20000000-0000-0000-0000-000000000024','30000000-0000-0000-0000-000000000008', 1.0,'cashback_pct',1.0,'1% everything else')
ON CONFLICT DO NOTHING;

-- ──── CIBC Costco Mastercard (025) ──────────────────────────
-- 3% restaurants+Costco gas, 2% Costco.ca+gas, 1% else (cashback)
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, cap_amount, cap_period, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000025','30000000-0000-0000-0000-000000000002', 3.0,'cashback_pct',NULL,NULL,1.0,'3% restaurants'),
  ('20000000-0000-0000-0000-000000000025','30000000-0000-0000-0000-000000000004', 3.0,'cashback_pct',8000,'annual',1.0,'3% Costco gas; 2% other gas up to $8k/yr'),
  ('20000000-0000-0000-0000-000000000025','30000000-0000-0000-0000-000000000001', 2.0,'cashback_pct',NULL,NULL,1.0,'2% at Costco (in-store default grocery)'),
  ('20000000-0000-0000-0000-000000000025','30000000-0000-0000-0000-000000000008', 1.0,'cashback_pct',NULL,NULL,1.0,'1% everything else')
ON CONFLICT DO NOTHING;

-- ──── SimplyCash from Amex (026) ────────────────────────────
-- Flat 1.25% cashback on everything
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000026','30000000-0000-0000-0000-000000000008', 1.25,'cashback_pct',1.25,'1.25% flat cashback on all purchases')
ON CONFLICT DO NOTHING;

-- ──── SimplyCash Preferred from Amex (027) ──────────────────
-- 4% gas+groceries, 2% else
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000027','30000000-0000-0000-0000-000000000001', 4.0,'cashback_pct',2.0,'4% on groceries'),
  ('20000000-0000-0000-0000-000000000027','30000000-0000-0000-0000-000000000004', 4.0,'cashback_pct',2.0,'4% on gas'),
  ('20000000-0000-0000-0000-000000000027','30000000-0000-0000-0000-000000000008', 2.0,'cashback_pct',2.0,'2% on everything else')
ON CONFLICT DO NOTHING;

-- ──── American Express Aeroplan Card (028) ──────────────────
-- 2x Air Canada (travel), 1x else
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000028','30000000-0000-0000-0000-000000000003', 2.0,'points',1.0,'2x on Air Canada purchases'),
  ('20000000-0000-0000-0000-000000000028','30000000-0000-0000-0000-000000000008', 1.0,'points',1.0,'1x everything else')
ON CONFLICT DO NOTHING;

-- ──── National Bank World Elite MC (029) ────────────────────
-- 5x groceries+dining ($2.5k/mo cap then 2x), 2x else
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, cap_amount, cap_period, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000029','30000000-0000-0000-0000-000000000001', 5.0,'points',2500,'monthly',2.0,'5x groceries up to $2.5k/mo then 2x'),
  ('20000000-0000-0000-0000-000000000029','30000000-0000-0000-0000-000000000002', 5.0,'points',2500,'monthly',2.0,'5x dining up to $2.5k/mo then 2x'),
  ('20000000-0000-0000-0000-000000000029','30000000-0000-0000-0000-000000000008', 2.0,'points',NULL,NULL,2.0,'2x on everything else')
ON CONFLICT DO NOTHING;

-- ──── PC Mastercard (030) ───────────────────────────────────
-- 25 pts/$1 Shoppers (2.5%), 10 pts/$1 else (1%)
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000030','30000000-0000-0000-0000-000000000005', 25.0,'points',10.0,'25 pts/$1 at Shoppers Drug Mart (2.5% value)'),
  ('20000000-0000-0000-0000-000000000030','30000000-0000-0000-0000-000000000008', 10.0,'points',10.0,'10 pts/$1 everywhere else (1% value)')
ON CONFLICT DO NOTHING;

-- ──── PC World Elite Mastercard (031) ───────────────────────
-- 45 pts/$1 Shoppers (4.5%), 30 pts/$1 groceries (3%), 30 pts/L gas (3%), 10 pts/$1 else (1%)
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000031','30000000-0000-0000-0000-000000000005', 45.0,'points',10.0,'45 pts/$1 Shoppers Drug Mart (4.5% value)'),
  ('20000000-0000-0000-0000-000000000031','30000000-0000-0000-0000-000000000001', 30.0,'points',10.0,'30 pts/$1 Loblaw groceries (3% value)'),
  ('20000000-0000-0000-0000-000000000031','30000000-0000-0000-0000-000000000004', 30.0,'points',10.0,'~30 pts/L at Esso/Mobil (3% value)'),
  ('20000000-0000-0000-0000-000000000031','30000000-0000-0000-0000-000000000008', 10.0,'points',10.0,'10 pts/$1 everywhere else (1% value)')
ON CONFLICT DO NOTHING;

-- ──── Rogers Red World Elite MC (032) ───────────────────────
-- 1.5% (2% w/ Rogers) CAD, 3% USD (mapped: travel for USD bonus, else for CAD)
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000032','30000000-0000-0000-0000-000000000003', 3.0,'cashback_pct',1.5,'3% on USD purchases (travel/foreign)'),
  ('20000000-0000-0000-0000-000000000032','30000000-0000-0000-0000-000000000008', 1.5,'cashback_pct',1.5,'1.5% CAD purchases (2% with Rogers/Fido service)')
ON CONFLICT DO NOTHING;

-- ──── Tangerine Money-Back Credit Card (033) ────────────────
-- 2% in up to 3 chosen categories, 0.5% else
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000033','30000000-0000-0000-0000-000000000001', 2.0,'cashback_pct',0.5,'2% in chosen categories (e.g. groceries)'),
  ('20000000-0000-0000-0000-000000000033','30000000-0000-0000-0000-000000000004', 2.0,'cashback_pct',0.5,'2% in chosen categories (e.g. gas)'),
  ('20000000-0000-0000-0000-000000000033','30000000-0000-0000-0000-000000000002', 2.0,'cashback_pct',0.5,'2% in chosen categories (e.g. dining)'),
  ('20000000-0000-0000-0000-000000000033','30000000-0000-0000-0000-000000000008', 0.5,'cashback_pct',0.5,'0.5% on all other purchases')
ON CONFLICT DO NOTHING;

-- ──── Simplii Cash Back Visa (034) ──────────────────────────
-- 4% dining ($5k/yr cap), 1.5% groceries/gas/drugstores ($15k/yr cap), 0.5% else
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, cap_amount, cap_period, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000034','30000000-0000-0000-0000-000000000002', 4.0,'cashback_pct',5000,'annual',0.5,'4% dining up to $5k/yr'),
  ('20000000-0000-0000-0000-000000000034','30000000-0000-0000-0000-000000000001', 1.5,'cashback_pct',15000,'annual',0.5,'1.5% groceries up to $15k/yr'),
  ('20000000-0000-0000-0000-000000000034','30000000-0000-0000-0000-000000000004', 1.5,'cashback_pct',15000,'annual',0.5,'1.5% gas up to $15k/yr'),
  ('20000000-0000-0000-0000-000000000034','30000000-0000-0000-0000-000000000005', 1.5,'cashback_pct',15000,'annual',0.5,'1.5% drugstores up to $15k/yr'),
  ('20000000-0000-0000-0000-000000000034','30000000-0000-0000-0000-000000000008', 0.5,'cashback_pct',NULL,NULL,0.5,'0.5% everything else')
ON CONFLICT DO NOTHING;

-- ──── Neo Mastercard (035) ──────────────────────────────────
-- ~5% avg at Neo partners, 1% elsewhere (cashback)
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000035','30000000-0000-0000-0000-000000000002', 5.0,'cashback_pct',1.0,'~5% avg at Neo partner restaurants'),
  ('20000000-0000-0000-0000-000000000035','30000000-0000-0000-0000-000000000008', 1.0,'cashback_pct',1.0,'1% at non-partner merchants')
ON CONFLICT DO NOTHING;

-- ──── Brim World Elite MC (036) ─────────────────────────────
-- 2x everywhere up to $25k/yr, 1x after
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, cap_amount, cap_period, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000036','30000000-0000-0000-0000-000000000008', 2.0,'points',25000,'annual',1.0,'2x on all purchases up to $25k/yr; reduced FX fee 1.5%')
ON CONFLICT DO NOTHING;

-- ──── Desjardins Odyssey World Elite MC (037) ───────────────
-- 3% groceries ($10k cap), 2% dining/entertainment/alt transport ($6k cap), 1.5% else
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, cap_amount, cap_period, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000037','30000000-0000-0000-0000-000000000001', 3.0,'cashback_pct',10000,'annual',1.5,'3% groceries up to $10k/yr'),
  ('20000000-0000-0000-0000-000000000037','30000000-0000-0000-0000-000000000002', 2.0,'cashback_pct',6000,'annual',1.5,'2% dining up to $6k/yr'),
  ('20000000-0000-0000-0000-000000000037','30000000-0000-0000-0000-000000000006', 2.0,'cashback_pct',6000,'annual',1.5,'2% entertainment up to $6k/yr'),
  ('20000000-0000-0000-0000-000000000037','30000000-0000-0000-0000-000000000004', 2.0,'cashback_pct',6000,'annual',1.5,'2% alt transportation up to $6k/yr'),
  ('20000000-0000-0000-0000-000000000037','30000000-0000-0000-0000-000000000003', 2.0,'cashback_pct',NULL,NULL,1.5,'2% travel'),
  ('20000000-0000-0000-0000-000000000037','30000000-0000-0000-0000-000000000008', 1.5,'cashback_pct',NULL,NULL,1.5,'1.5% everything else')
ON CONFLICT DO NOTHING;

-- ──── Amex Aeroplan Reserve (038) ───────────────────────────
-- 3x Air Canada (travel), 2x dining, 1.25x else
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000038','30000000-0000-0000-0000-000000000003', 3.0,'points',1.25,'3x Air Canada; includes travel purchases'),
  ('20000000-0000-0000-0000-000000000038','30000000-0000-0000-0000-000000000002', 2.0,'points',1.25,'2x dining & food delivery'),
  ('20000000-0000-0000-0000-000000000038','30000000-0000-0000-0000-000000000008', 1.25,'points',1.25,'1.25x everything else')
ON CONFLICT DO NOTHING;

-- ──── CIBC Aventura Visa Infinite Privilege (039) ───────────
-- 2x travel, 1.5x groceries/gas/dining, 1.25x else
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000039','30000000-0000-0000-0000-000000000003', 2.0,'points',1.25,'2x travel via CIBC Rewards Centre'),
  ('20000000-0000-0000-0000-000000000039','30000000-0000-0000-0000-000000000001', 1.5,'points',1.25,'1.5x groceries'),
  ('20000000-0000-0000-0000-000000000039','30000000-0000-0000-0000-000000000004', 1.5,'points',1.25,'1.5x gas & transit'),
  ('20000000-0000-0000-0000-000000000039','30000000-0000-0000-0000-000000000002', 1.5,'points',1.25,'1.5x dining'),
  ('20000000-0000-0000-0000-000000000039','30000000-0000-0000-0000-000000000008', 1.25,'points',1.25,'1.25x everything else')
ON CONFLICT DO NOTHING;

-- ──── RBC Avion Visa Infinite Privilege (040) ───────────────
-- 1.25x flat on all purchases — premium transfer partner access
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000040','30000000-0000-0000-0000-000000000003', 1.5,'points',1.25,'1.5x travel purchases'),
  ('20000000-0000-0000-0000-000000000040','30000000-0000-0000-0000-000000000002', 1.5,'points',1.25,'1.5x dining'),
  ('20000000-0000-0000-0000-000000000040','30000000-0000-0000-0000-000000000008', 1.25,'points',1.25,'1.25x everything else')
ON CONFLICT DO NOTHING;

-- ──── Neo World Elite MC (041) ──────────────────────────────
-- 5% groceries, 4% bills, 3% gas, 1% else
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, notes) VALUES
  ('20000000-0000-0000-0000-000000000041','30000000-0000-0000-0000-000000000001', 5.0,'cashback_pct',1.0,'5% on groceries'),
  ('20000000-0000-0000-0000-000000000041','30000000-0000-0000-0000-000000000007', 4.0,'cashback_pct',1.0,'4% on recurring bills'),
  ('20000000-0000-0000-0000-000000000041','30000000-0000-0000-0000-000000000004', 3.0,'cashback_pct',1.0,'3% on gas'),
  ('20000000-0000-0000-0000-000000000041','30000000-0000-0000-0000-000000000008', 1.0,'cashback_pct',1.0,'1% on everything else')
ON CONFLICT DO NOTHING;


-- ══════════════════════════════════════════════════════════════
-- TRANSFER PARTNERS
-- ══════════════════════════════════════════════════════════════

-- Amex MR Canada -> Marriott Bonvoy (5:6 ratio = 1.2000)
INSERT INTO transfer_partners (from_program_id, to_program_id, transfer_ratio, minimum_transfer, processing_days, notes)
VALUES ('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000013', 1.2000, 1000, 2, 'Amex MR CA -> Marriott Bonvoy 5:6 (periodic 30% bonuses)')
ON CONFLICT DO NOTHING;

-- Amex MR Canada -> Hilton Honors (1:1)
INSERT INTO transfer_partners (from_program_id, to_program_id, transfer_ratio, minimum_transfer, processing_days, notes)
VALUES ('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000014', 1.0000, 1000, 2, 'Amex MR CA -> Hilton Honors 1:1')
ON CONFLICT DO NOTHING;

-- RBC Avion -> WestJet Rewards (1:1)
INSERT INTO transfer_partners (from_program_id, to_program_id, transfer_ratio, minimum_transfer, processing_days, notes)
VALUES ('10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000008', 1.0000, 1000, 3, 'RBC Avion -> WestJet 1:1')
ON CONFLICT DO NOTHING;

-- RBC Avion -> American Airlines AAdvantage (10:7 = 0.7000)
INSERT INTO transfer_partners (from_program_id, to_program_id, transfer_ratio, minimum_transfer, processing_days, notes)
VALUES ('10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001', 0.7000, 5000, 5, 'RBC Avion -> AAdvantage 10:7 (use for oneworld awards)')
ON CONFLICT DO NOTHING;

-- Marriott Bonvoy -> Aeroplan (3:1 with 5k bonus at 60k = effective 0.3667 for large transfers)
INSERT INTO transfer_partners (from_program_id, to_program_id, transfer_ratio, minimum_transfer, processing_days, notes)
VALUES ('10000000-0000-0000-0000-000000000013','10000000-0000-0000-0000-000000000001', 0.3333, 3000, 5, 'Marriott -> Aeroplan 3:1 (5k bonus per 60k transferred)')
ON CONFLICT DO NOTHING;

-- Marriott Bonvoy -> BA Avios (3:1 with 5k bonus at 60k)
INSERT INTO transfer_partners (from_program_id, to_program_id, transfer_ratio, minimum_transfer, processing_days, notes)
VALUES ('10000000-0000-0000-0000-000000000013','10000000-0000-0000-0000-000000000009', 0.3333, 3000, 5, 'Marriott -> BA Avios 3:1 (5k bonus per 60k transferred)')
ON CONFLICT DO NOTHING;

-- Marriott Bonvoy -> Asia Miles (3:1 with 5k bonus at 60k)
INSERT INTO transfer_partners (from_program_id, to_program_id, transfer_ratio, minimum_transfer, processing_days, notes)
VALUES ('10000000-0000-0000-0000-000000000013','10000000-0000-0000-0000-000000000011', 0.3333, 3000, 5, 'Marriott -> Asia Miles 3:1 (5k bonus per 60k transferred)')
ON CONFLICT DO NOTHING;

-- Marriott Bonvoy -> Flying Blue (3:1 with 5k bonus at 60k)
INSERT INTO transfer_partners (from_program_id, to_program_id, transfer_ratio, minimum_transfer, processing_days, notes)
VALUES ('10000000-0000-0000-0000-000000000013','10000000-0000-0000-0000-000000000010', 0.3333, 3000, 5, 'Marriott -> Flying Blue 3:1 (5k bonus per 60k transferred)')
ON CONFLICT DO NOTHING;


-- ══════════════════════════════════════════════════════════════
-- POINT VALUATIONS (new programs)
-- ══════════════════════════════════════════════════════════════

INSERT INTO point_valuations (loyalty_program_id, segment, cpp, source, effective_date) VALUES
  -- PC Optimum
  ('10000000-0000-0000-0000-000000000012', 'base',     0.10, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000012', 'economy',  0.15, 'manual', '2026-03-09'),

  -- Marriott Bonvoy
  ('10000000-0000-0000-0000-000000000013', 'base',     0.80, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000013', 'economy',  0.60, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000013', 'business', 1.20, 'manual', '2026-03-09'),

  -- Hilton Honors
  ('10000000-0000-0000-0000-000000000014', 'base',     0.50, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000014', 'economy',  0.40, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000014', 'business', 0.60, 'manual', '2026-03-09'),

  -- World of Hyatt
  ('10000000-0000-0000-0000-000000000015', 'base',     1.80, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000015', 'economy',  1.50, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000015', 'business', 2.50, 'manual', '2026-03-09'),

  -- National Bank Rewards
  ('10000000-0000-0000-0000-000000000016', 'base',     1.00, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000016', 'economy',  0.80, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000016', 'business', 1.00, 'manual', '2026-03-09'),

  -- Air Miles
  ('10000000-0000-0000-0000-000000000017', 'base',     0.15, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000017', 'economy',  0.12, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000017', 'business', 0.21, 'manual', '2026-03-09'),

  -- Brim Rewards
  ('10000000-0000-0000-0000-000000000018', 'base',     1.00, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000018', 'economy',  0.80, 'manual', '2026-03-09'),

  -- Desjardins Bonusdollars
  ('10000000-0000-0000-0000-000000000019', 'base',     1.00, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000019', 'economy',  0.80, 'manual', '2026-03-09'),

  -- Additional economy/business for existing programs
  ('10000000-0000-0000-0000-000000000001', 'economy',  1.20, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000002', 'economy',  1.30, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000002', 'business', 2.20, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000003', 'economy',  0.90, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000003', 'business', 1.50, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000004', 'economy',  0.70, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000005', 'economy',  0.80, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000005', 'business', 1.20, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000006', 'economy',  0.40, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000007', 'economy',  0.55, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000007', 'business', 1.00, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000008', 'economy',  1.00, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000010', 'economy',  1.00, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000010', 'business', 1.80, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000011', 'economy',  1.10, 'manual', '2026-03-09')
ON CONFLICT (loyalty_program_id, segment, effective_date) DO NOTHING;
