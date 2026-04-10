-- ============================================================
-- EXPANDED CARDS V2 MIGRATION
-- Adds 60+ new cards from additional issuers, new categories,
-- and new loyalty programs to bring total to 100+ cards.
-- All IDs are fixed UUIDs for idempotency.
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- NEW CATEGORIES
-- ══════════════════════════════════════════════════════════════

INSERT INTO categories (id, name, slug, mcc_codes) VALUES
  ('30000000-0000-0000-0000-000000000009', 'Online Shopping', 'online-shopping', ARRAY[5399,5999,5961,5964,5965,5966,5967,5968,5969]),
  ('30000000-0000-0000-0000-000000000010', 'Recurring Bills', 'recurring-bills', ARRAY[4812,4814,4899,4900,6300])
ON CONFLICT (slug) DO NOTHING;

-- ══════════════════════════════════════════════════════════════
-- NEW LOYALTY PROGRAMS
-- ══════════════════════════════════════════════════════════════

-- HSBC Rewards (bank) — ~0.80 CPP
INSERT INTO loyalty_programs (id, name, slug, currency_name, program_type, base_cpp, is_active)
VALUES ('10000000-0000-0000-0000-000000000020', 'HSBC Rewards', 'hsbc-rewards', 'HSBC Rewards Points', 'bank', 0.8000, true)
ON CONFLICT (id) DO NOTHING;

-- Capital One Rewards (bank) — ~0.50 CPP
INSERT INTO loyalty_programs (id, name, slug, currency_name, program_type, base_cpp, is_active)
VALUES ('10000000-0000-0000-0000-000000000021', 'Capital One Rewards', 'capital-one-rewards', 'Capital One Rewards Miles', 'bank', 0.5000, true)
ON CONFLICT (id) DO NOTHING;

-- MBNA Rewards (bank) — ~0.70 CPP
INSERT INTO loyalty_programs (id, name, slug, currency_name, program_type, base_cpp, is_active)
VALUES ('10000000-0000-0000-0000-000000000022', 'MBNA Rewards', 'mbna-rewards', 'MBNA Rewards Points', 'bank', 0.7000, true)
ON CONFLICT (id) DO NOTHING;

-- Canadian Tire Money (cashback) — 1 CT dollar = 1 CAD
INSERT INTO loyalty_programs (id, name, slug, currency_name, program_type, base_cpp, is_active)
VALUES ('10000000-0000-0000-0000-000000000023', 'Canadian Tire Money', 'ct-money', 'CT Money', 'cashback', 1.0000, true)
ON CONFLICT (id) DO NOTHING;

-- Scotia Rewards (bank) — ~1.00 CPP travel portal
INSERT INTO loyalty_programs (id, name, slug, currency_name, program_type, base_cpp, is_active)
VALUES ('10000000-0000-0000-0000-000000000024', 'Scotia Rewards', 'scotia-rewards', 'Scotia Rewards Points', 'bank', 1.0000, true)
ON CONFLICT (id) DO NOTHING;

-- Home Trust Rewards (bank) — ~0.50 CPP
INSERT INTO loyalty_programs (id, name, slug, currency_name, program_type, base_cpp, is_active)
VALUES ('10000000-0000-0000-0000-000000000025', 'Home Trust Rewards', 'home-trust-rewards', 'Home Trust Points', 'bank', 0.5000, true)
ON CONFLICT (id) DO NOTHING;

-- Manulife Rewards (bank) — ~1.00 CPP travel portal
INSERT INTO loyalty_programs (id, name, slug, currency_name, program_type, base_cpp, is_active)
VALUES ('10000000-0000-0000-0000-000000000026', 'Manulife Rewards', 'manulife-rewards', 'Manulife Bank Points', 'bank', 1.0000, true)
ON CONFLICT (id) DO NOTHING;

-- CIBC Dividend (cashback) — direct cashback
INSERT INTO loyalty_programs (id, name, slug, currency_name, program_type, base_cpp, is_active)
VALUES ('10000000-0000-0000-0000-000000000027', 'CIBC Dividend Cashback', 'cibc-dividend', 'Cashback', 'cashback', 1.0000, true)
ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════
-- CARDS (60+ new cards)
-- Card IDs continue from 20000000-...-000000000042
-- ══════════════════════════════════════════════════════════════

-- ── HSBC Cards ────────────────────────────────────────────────

-- HSBC World Elite Mastercard — $149/yr, 3x travel, 1.5x else, no FX fees
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000042', 'HSBC World Elite Mastercard', 'HSBC', 'mastercard', '10000000-0000-0000-0000-000000000020', 149.00, 60000, 4000.00, 3, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- HSBC +Rewards Mastercard — $0/yr, 2x dining/gas, 1x else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000043', 'HSBC +Rewards Mastercard', 'HSBC', 'mastercard', '10000000-0000-0000-0000-000000000020', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── Capital One Cards ─────────────────────────────────────────

-- Capital One Costco Mastercard — $0/yr (w/ Costco membership), 3% restaurants, 2% gas/Costco, 1% else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000044', 'Capital One Costco Mastercard', 'Capital One', 'mastercard', '10000000-0000-0000-0000-000000000021', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- Capital One Aspire Travel Platinum Mastercard — $120/yr, 2x everything
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000045', 'Capital One Aspire Travel Platinum Mastercard', 'Capital One', 'mastercard', '10000000-0000-0000-0000-000000000021', 120.00, 40000, 1000.00, 3, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- Capital One Aspire Travel World Elite Mastercard — $150/yr, 2x everything
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000046', 'Capital One Aspire Travel World Elite Mastercard', 'Capital One', 'mastercard', '10000000-0000-0000-0000-000000000021', 150.00, 60000, 3000.00, 3, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- Capital One Guaranteed Mastercard — $59/yr, 0.5% cashback (secured card)
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000047', 'Capital One Guaranteed Mastercard', 'Capital One', 'mastercard', '10000000-0000-0000-0000-000000000021', 59.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── MBNA Cards ────────────────────────────────────────────────

-- MBNA Rewards World Elite Mastercard — $89/yr, 2x travel/dining, 1x else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000048', 'MBNA Rewards World Elite Mastercard', 'MBNA', 'mastercard', '10000000-0000-0000-0000-000000000022', 89.00, 20000, 2000.00, 3, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- MBNA True Line Mastercard — $0/yr, no rewards (low rate 12.99%)
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000049', 'MBNA True Line Mastercard', 'MBNA', 'mastercard', '10000000-0000-0000-0000-000000000022', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- MBNA Smart Cash Platinum Plus Mastercard — $0/yr, 5% gas/groceries (first 6 mo), 1% else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000050', 'MBNA Smart Cash Platinum Plus Mastercard', 'MBNA', 'mastercard', '10000000-0000-0000-0000-000000000022', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── Canadian Tire / Triangle Cards ────────────────────────────

-- Canadian Tire Triangle Mastercard — $0/yr, 4¢/L at CT Gas, 0.4% CT, 0.2% else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000051', 'Triangle Mastercard', 'Canadian Tire', 'mastercard', '10000000-0000-0000-0000-000000000023', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- Canadian Tire Triangle World Elite Mastercard — $0/yr, 7¢/L at CT Gas, 1.5% CT stores, 0.5% else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000052', 'Triangle World Elite Mastercard', 'Canadian Tire', 'mastercard', '10000000-0000-0000-0000-000000000023', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── Desjardins Cards ──────────────────────────────────────────

-- Desjardins Cash Back Visa — $0/yr, 1% everything
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000053', 'Desjardins Cash Back Visa', 'Desjardins', 'visa', '10000000-0000-0000-0000-000000000019', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- Desjardins Cash Back World Elite Visa — $85/yr, 3% groceries+recurring, 1% else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000054', 'Desjardins Cash Back World Elite Visa', 'Desjardins', 'visa', '10000000-0000-0000-0000-000000000019', 85.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- Desjardins Odyssey Visa Gold — $70/yr, 2x groceries/dining, 1.5x else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000055', 'Desjardins Odyssey Visa Gold', 'Desjardins', 'visa', '10000000-0000-0000-0000-000000000019', 70.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── National Bank Cards ───────────────────────────────────────

-- National Bank MC — $0/yr, 1x everywhere
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000056', 'National Bank Mastercard', 'National Bank', 'mastercard', '10000000-0000-0000-0000-000000000016', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- National Bank Syncro MC — $0/yr, 2% groceries+gas+recurring, 0.5% else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000057', 'National Bank Syncro Mastercard', 'National Bank', 'mastercard', '10000000-0000-0000-0000-000000000016', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- National Bank Allure MC — $79/yr, 3x groceries, 2x gas/dining, 1x else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000058', 'National Bank Allure Mastercard', 'National Bank', 'mastercard', '10000000-0000-0000-0000-000000000016', 79.00, 20000, 3000.00, 3, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── Home Trust Cards ──────────────────────────────────────────

-- Home Trust Preferred Visa — $0/yr, 1% cashback, no FX fees
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000059', 'Home Trust Preferred Visa', 'Home Trust', 'visa', '10000000-0000-0000-0000-000000000025', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── Manulife Cards ────────────────────────────────────────────

-- Manulife Visa Platinum — $0/yr, 1.5% on everything if Manulife Bank customer
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000060', 'Manulife Visa Platinum', 'Manulife Bank', 'visa', '10000000-0000-0000-0000-000000000026', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── Additional TD Cards ──────────────────────────────────────

-- TD Rewards Visa — $0/yr, 2x everything (entry level)
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000061', 'TD Rewards Visa Card', 'TD Bank', 'visa', '10000000-0000-0000-0000-000000000006', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- TD Cash Back Visa — $0/yr, 1% groceries, 0.75% gas/bills, 0.5% else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000062', 'TD Cash Back Visa Card', 'TD Bank', 'visa', '10000000-0000-0000-0000-000000000006', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- TD Aeroplan Visa Platinum — $89/yr, 1.5x Aeroplan on everything
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000063', 'TD Aeroplan Visa Platinum', 'TD Bank', 'visa', '10000000-0000-0000-0000-000000000001', 89.00, 10000, 1000.00, 3, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── Additional RBC Cards ─────────────────────────────────────

-- RBC Rewards+ Visa — $0/yr, 1x everywhere (entry)
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000064', 'RBC Rewards+ Visa', 'Royal Bank', 'visa', '10000000-0000-0000-0000-000000000003', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- RBC Cash Back Preferred World Elite Mastercard — $99/yr, 2% all purchases
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000065', 'RBC Cash Back Preferred World Elite Mastercard', 'Royal Bank', 'mastercard', '10000000-0000-0000-0000-000000000003', 99.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- RBC Signature WestJet Mastercard — $0/yr, 1.5x WestJet, 1x else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000066', 'RBC WestJet Mastercard', 'Royal Bank', 'mastercard', '10000000-0000-0000-0000-000000000008', 0.00, 15000, 1500.00, 3, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── Additional Scotiabank Cards ──────────────────────────────

-- Scotiabank Value Visa — $29/yr, low-rate card, 0.5% cashback
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000067', 'Scotiabank Value Visa Card', 'Scotiabank', 'visa', '10000000-0000-0000-0000-000000000024', 29.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- Scotiabank Momentum No-Fee Visa — $0/yr, 1% groceries+gas, 0.5% else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000068', 'Scotiabank Momentum No-Fee Visa', 'Scotiabank', 'visa', '10000000-0000-0000-0000-000000000004', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- Scotia Passport Visa Infinite Card (Scene+) — alternate variant w/ no FX
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000069', 'Scotiabank Platinum American Express', 'Scotiabank', 'amex', '10000000-0000-0000-0000-000000000004', 399.00, 80000, 7500.00, 6, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── Additional BMO Cards ─────────────────────────────────────

-- BMO Cash Back Mastercard — $0/yr, 3% groceries, 1% gas, 0.5% else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000070', 'BMO Cash Back Mastercard', 'BMO', 'mastercard', '10000000-0000-0000-0000-000000000007', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- BMO Rewards Mastercard — $0/yr, 1x everywhere
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000071', 'BMO Rewards Mastercard', 'BMO', 'mastercard', '10000000-0000-0000-0000-000000000007', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- BMO eclipse Visa Infinite — $120/yr, 5% groceries, 3% gas/transit, 1% else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000072', 'BMO eclipse Visa Infinite', 'BMO', 'visa', '10000000-0000-0000-0000-000000000007', 120.00, 50000, 3000.00, 3, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- BMO eclipse Visa Infinite Privilege — $180/yr, 5% groceries, 4% transit, 3% gas, 1% else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000073', 'BMO eclipse Visa Infinite Privilege', 'BMO', 'visa', '10000000-0000-0000-0000-000000000007', 180.00, 75000, 4000.00, 3, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── Additional CIBC Cards ────────────────────────────────────

-- CIBC Select Visa — $0/yr, 0.5% cashback (basic entry card)
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000074', 'CIBC Select Visa Card', 'CIBC', 'visa', '10000000-0000-0000-0000-000000000027', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- CIBC Dividend Visa — $0/yr, 1% groceries, 0.5% else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000075', 'CIBC Dividend Visa Card', 'CIBC', 'visa', '10000000-0000-0000-0000-000000000027', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- CIBC Dividend Platinum Visa — $30/yr, 2% gas+groceries, 1% dining, 0.5% else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000076', 'CIBC Dividend Platinum Visa', 'CIBC', 'visa', '10000000-0000-0000-0000-000000000027', 30.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- CIBC Aeroplan Visa Infinite — $139/yr, 1.5x Aeroplan
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000077', 'CIBC Aeroplan Visa Infinite', 'CIBC', 'visa', '10000000-0000-0000-0000-000000000001', 139.00, 20000, 1500.00, 4, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── Additional Amex Cards ────────────────────────────────────

-- Amex Marriott Bonvoy Card — $120/yr, 5x at Marriott, 2x dining/travel, 1x else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000078', 'Marriott Bonvoy American Express Card', 'American Express', 'amex', '10000000-0000-0000-0000-000000000013', 120.00, 55000, 3000.00, 3, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- Amex Green Card — $0/yr, 1x everywhere
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000079', 'American Express Green Card', 'American Express', 'amex', '10000000-0000-0000-0000-000000000002', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- Amex Business Edge — $99/yr, 3x gas/office supplies, 2x dining, 1x else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000080', 'American Express Business Edge', 'American Express', 'amex', '10000000-0000-0000-0000-000000000002', 99.00, 40000, 5000.00, 3, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- Amex Platinum Business — $499/yr, 2x travel, 1.5x else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000081', 'American Express Platinum Business', 'American Express', 'amex', '10000000-0000-0000-0000-000000000002', 499.00, 80000, 10000.00, 3, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- Amex Business Aeroplan Reserve — $599/yr, 3x dining, 2x travel, 1.25x else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000082', 'Amex Aeroplan Business Reserve Card', 'American Express', 'amex', '10000000-0000-0000-0000-000000000001', 599.00, 75000, 7500.00, 3, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── Brim Financial Additional ─────────────────────────────────

-- Brim Mastercard — $0/yr, 1x everywhere, no FX fees
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000083', 'Brim Mastercard', 'Brim Financial', 'mastercard', '10000000-0000-0000-0000-000000000018', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── Rogers Bank Additional ────────────────────────────────────

-- Rogers World Elite Mastercard — $0/yr, 1.75% CAD, 4% USD, cashback as bill credit
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000084', 'Rogers World Elite Mastercard', 'Rogers Bank', 'mastercard', '10000000-0000-0000-0000-000000000006', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- Rogers Platinum Mastercard — $0/yr, 1% CAD, 3% USD
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000085', 'Rogers Platinum Mastercard', 'Rogers Bank', 'mastercard', '10000000-0000-0000-0000-000000000006', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── Tangerine Additional ──────────────────────────────────────

-- Tangerine World Mastercard — $0/yr, 2% in up to 3 categories (with Tangerine savings), 0.5% else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000086', 'Tangerine World Mastercard', 'Tangerine', 'mastercard', '10000000-0000-0000-0000-000000000006', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── Simplii Additional ───────────────────────────────────────

-- Simplii Visa Card — $0/yr, 0.5% cashback (basic card)
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000087', 'Simplii Financial Visa Card', 'Simplii Financial', 'visa', '10000000-0000-0000-0000-000000000006', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── Neo Financial Additional ──────────────────────────────────

-- Neo Secured Mastercard — $0/yr, 1% at Neo partners, 0.5% else (secured card for credit building)
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000088', 'Neo Secured Mastercard', 'Neo Financial', 'mastercard', '10000000-0000-0000-0000-000000000006', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── PC Financial Additional ──────────────────────────────────

-- PC Financial Mastercard (no fee, basic) — 10 pts/$1 (1% at PC stores, base 0.5% else)
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000089', 'PC Money Account', 'PC Financial', 'mastercard', '10000000-0000-0000-0000-000000000012', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- ── Additional Premium Variants ───────────────────────────────

-- TD First Class Travel Visa Infinite Privilege — $599/yr premium
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000090', 'TD First Class Travel Visa Infinite Privilege', 'TD Bank', 'visa', '10000000-0000-0000-0000-000000000006', 599.00, 150000, 7500.00, 3, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- Scotiabank Ultimate Visa — $0/yr, 1% cash back
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000091', 'Scotiabank No-Fee Visa Card', 'Scotiabank', 'visa', '10000000-0000-0000-0000-000000000024', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- BMO Air Miles Mastercard — $0/yr, 1x Air Miles on everything
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000092', 'BMO Air Miles Mastercard', 'BMO', 'mastercard', '10000000-0000-0000-0000-000000000017', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- CIBC Aventura Gold Visa — $79/yr, 1.5x Aventura, 2x dining
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000093', 'CIBC Aventura Gold Visa', 'CIBC', 'visa', '10000000-0000-0000-0000-000000000005', 79.00, 15000, 1500.00, 4, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- MBNA Alaska Airlines World Elite MC — $99/yr, 3x Alaska/groceries/gas, 1x else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000094', 'MBNA Alaska Airlines World Elite Mastercard', 'MBNA', 'mastercard', '10000000-0000-0000-0000-000000000022', 99.00, 30000, 1000.00, 3, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- Amex Aeroplan Card (no fee) — $0/yr, 1x Aeroplan
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000095', 'American Express Aeroplan No Fee Card', 'American Express', 'amex', '10000000-0000-0000-0000-000000000001', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- RBC British Airways Visa Infinite — $165/yr, 2x Avios on everything
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000096', 'RBC British Airways Visa Infinite', 'Royal Bank', 'visa', '10000000-0000-0000-0000-000000000009', 165.00, 30000, 3000.00, 3, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- BMO Preferred Rate Mastercard — $29/yr, low rate, 0.5% cashback
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000097', 'BMO Preferred Rate Mastercard', 'BMO', 'mastercard', '10000000-0000-0000-0000-000000000007', 29.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- Scotia Momentum Mastercard — $0/yr, 1% groceries+gas, 0.5% else (no fee version)
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000098', 'Scotia Momentum Mastercard No Fee', 'Scotiabank', 'mastercard', '10000000-0000-0000-0000-000000000004', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- HSBC Cashback Mastercard — $0/yr, 0.5% all purchases
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000099', 'HSBC Cashback Mastercard', 'HSBC', 'mastercard', '10000000-0000-0000-0000-000000000020', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- Desjardins Remises Visa — $0/yr, 0.5% everywhere
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000100', 'Desjardins Remises Visa', 'Desjardins', 'visa', '10000000-0000-0000-0000-000000000019', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- National Bank Platinum MC — $65/yr, 2x dining/entertainment, 1.5x else
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000101', 'National Bank Platinum Mastercard', 'National Bank', 'mastercard', '10000000-0000-0000-0000-000000000016', 65.00, 15000, 2000.00, 3, true, 'CA')
ON CONFLICT (id) DO NOTHING;

-- CIBC Tim Hortons Visa — $0/yr, earn Tim Rewards (modeled as cashback)
INSERT INTO cards (id, name, issuer, network, loyalty_program_id, annual_fee, welcome_bonus_points, welcome_bonus_min_spend, welcome_bonus_months, is_active, country)
VALUES ('20000000-0000-0000-0000-000000000102', 'CIBC Tim Hortons Visa', 'CIBC', 'visa', '10000000-0000-0000-0000-000000000027', 0.00, 0, 0.00, 0, true, 'CA')
ON CONFLICT (id) DO NOTHING;


-- ══════════════════════════════════════════════════════════════
-- CARD MULTIPLIERS for new cards
-- ══════════════════════════════════════════════════════════════

-- ──── HSBC World Elite Mastercard (042) ───────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000042','30000000-0000-0000-0000-000000000003', 3.0,'points','3x travel'),
  ('20000000-0000-0000-0000-000000000042','30000000-0000-0000-0000-000000000002', 2.0,'points','2x dining'),
  ('20000000-0000-0000-0000-000000000042','30000000-0000-0000-0000-000000000008', 1.5,'points','1.5x everything else')
ON CONFLICT DO NOTHING;

-- ──── HSBC +Rewards Mastercard (043) ──────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000043','30000000-0000-0000-0000-000000000002', 2.0,'points','2x dining'),
  ('20000000-0000-0000-0000-000000000043','30000000-0000-0000-0000-000000000004', 2.0,'points','2x gas & transit'),
  ('20000000-0000-0000-0000-000000000043','30000000-0000-0000-0000-000000000008', 1.0,'points','1x everything else')
ON CONFLICT DO NOTHING;

-- ──── Capital One Costco MC (044) ─────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000044','30000000-0000-0000-0000-000000000002', 3.0,'cashback_pct','3% restaurants'),
  ('20000000-0000-0000-0000-000000000044','30000000-0000-0000-0000-000000000004', 2.0,'cashback_pct','2% gas'),
  ('20000000-0000-0000-0000-000000000044','30000000-0000-0000-0000-000000000001', 2.0,'cashback_pct','2% grocery/Costco'),
  ('20000000-0000-0000-0000-000000000044','30000000-0000-0000-0000-000000000008', 1.0,'cashback_pct','1% everything else')
ON CONFLICT DO NOTHING;

-- ──── Capital One Aspire Platinum (045) ───────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000045','30000000-0000-0000-0000-000000000008', 2.0,'points','2x everything')
ON CONFLICT DO NOTHING;

-- ──── Capital One Aspire WE (046) ─────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000046','30000000-0000-0000-0000-000000000008', 2.0,'points','2x everything')
ON CONFLICT DO NOTHING;

-- ──── Capital One Guaranteed (047) ────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000047','30000000-0000-0000-0000-000000000008', 0.5,'cashback_pct','0.5% everything else')
ON CONFLICT DO NOTHING;

-- ──── MBNA Rewards WE MC (048) ────────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000048','30000000-0000-0000-0000-000000000003', 2.0,'points','2x travel'),
  ('20000000-0000-0000-0000-000000000048','30000000-0000-0000-0000-000000000002', 2.0,'points','2x dining'),
  ('20000000-0000-0000-0000-000000000048','30000000-0000-0000-0000-000000000008', 1.0,'points','1x everything else')
ON CONFLICT DO NOTHING;

-- ──── MBNA True Line (049) ────────────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000049','30000000-0000-0000-0000-000000000008', 0.0,'points','No rewards — low rate card')
ON CONFLICT DO NOTHING;

-- ──── MBNA Smart Cash (050) ───────────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000050','30000000-0000-0000-0000-000000000004', 2.0,'cashback_pct','2% gas'),
  ('20000000-0000-0000-0000-000000000050','30000000-0000-0000-0000-000000000001', 2.0,'cashback_pct','2% groceries'),
  ('20000000-0000-0000-0000-000000000050','30000000-0000-0000-0000-000000000008', 1.0,'cashback_pct','1% everything else')
ON CONFLICT DO NOTHING;

-- ──── Triangle Mastercard (051) ───────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000051','30000000-0000-0000-0000-000000000004', 2.0,'cashback_pct','~2% effective at CT gas'),
  ('20000000-0000-0000-0000-000000000051','30000000-0000-0000-0000-000000000008', 0.4,'cashback_pct','0.4% CT stores, 0.2% elsewhere')
ON CONFLICT DO NOTHING;

-- ──── Triangle World Elite MC (052) ───────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000052','30000000-0000-0000-0000-000000000004', 3.5,'cashback_pct','~3.5% effective at CT gas'),
  ('20000000-0000-0000-0000-000000000052','30000000-0000-0000-0000-000000000001', 1.5,'cashback_pct','1.5% at CT/SportChek'),
  ('20000000-0000-0000-0000-000000000052','30000000-0000-0000-0000-000000000008', 0.5,'cashback_pct','0.5% everywhere else')
ON CONFLICT DO NOTHING;

-- ──── Desjardins Cash Back Visa (053) ─────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000053','30000000-0000-0000-0000-000000000008', 1.0,'cashback_pct','1% everywhere')
ON CONFLICT DO NOTHING;

-- ──── Desjardins Cash Back WE Visa (054) ──────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000054','30000000-0000-0000-0000-000000000001', 3.0,'cashback_pct','3% groceries'),
  ('20000000-0000-0000-0000-000000000054','30000000-0000-0000-0000-000000000010', 3.0,'cashback_pct','3% recurring bills'),
  ('20000000-0000-0000-0000-000000000054','30000000-0000-0000-0000-000000000008', 1.0,'cashback_pct','1% everything else')
ON CONFLICT DO NOTHING;

-- ──── Desjardins Odyssey Visa Gold (055) ──────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000055','30000000-0000-0000-0000-000000000001', 2.0,'points','2x groceries'),
  ('20000000-0000-0000-0000-000000000055','30000000-0000-0000-0000-000000000002', 2.0,'points','2x dining'),
  ('20000000-0000-0000-0000-000000000055','30000000-0000-0000-0000-000000000008', 1.5,'points','1.5x everything else')
ON CONFLICT DO NOTHING;

-- ──── National Bank MC (056) ──────────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000056','30000000-0000-0000-0000-000000000008', 1.0,'points','1x everything')
ON CONFLICT DO NOTHING;

-- ──── National Bank Syncro MC (057) ───────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000057','30000000-0000-0000-0000-000000000001', 2.0,'cashback_pct','2% groceries'),
  ('20000000-0000-0000-0000-000000000057','30000000-0000-0000-0000-000000000004', 2.0,'cashback_pct','2% gas'),
  ('20000000-0000-0000-0000-000000000057','30000000-0000-0000-0000-000000000010', 2.0,'cashback_pct','2% recurring bills'),
  ('20000000-0000-0000-0000-000000000057','30000000-0000-0000-0000-000000000008', 0.5,'cashback_pct','0.5% everything else')
ON CONFLICT DO NOTHING;

-- ──── National Bank Allure MC (058) ───────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000058','30000000-0000-0000-0000-000000000001', 3.0,'points','3x groceries'),
  ('20000000-0000-0000-0000-000000000058','30000000-0000-0000-0000-000000000004', 2.0,'points','2x gas'),
  ('20000000-0000-0000-0000-000000000058','30000000-0000-0000-0000-000000000002', 2.0,'points','2x dining'),
  ('20000000-0000-0000-0000-000000000058','30000000-0000-0000-0000-000000000008', 1.0,'points','1x everything else')
ON CONFLICT DO NOTHING;

-- ──── Home Trust Preferred Visa (059) ─────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000059','30000000-0000-0000-0000-000000000008', 1.0,'cashback_pct','1% all purchases, no FX fees')
ON CONFLICT DO NOTHING;

-- ──── Manulife Visa Platinum (060) ────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000060','30000000-0000-0000-0000-000000000008', 1.5,'cashback_pct','1.5% everything with Manulife account')
ON CONFLICT DO NOTHING;

-- ──── TD Rewards Visa (061) ───────────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000061','30000000-0000-0000-0000-000000000008', 2.0,'points','2x TD Rewards everywhere')
ON CONFLICT DO NOTHING;

-- ──── TD Cash Back Visa (062) ─────────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000062','30000000-0000-0000-0000-000000000001', 1.0,'cashback_pct','1% groceries'),
  ('20000000-0000-0000-0000-000000000062','30000000-0000-0000-0000-000000000004', 0.75,'cashback_pct','0.75% gas'),
  ('20000000-0000-0000-0000-000000000062','30000000-0000-0000-0000-000000000010', 0.75,'cashback_pct','0.75% bills'),
  ('20000000-0000-0000-0000-000000000062','30000000-0000-0000-0000-000000000008', 0.5,'cashback_pct','0.5% everything else')
ON CONFLICT DO NOTHING;

-- ──── TD Aeroplan Visa Platinum (063) ─────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000063','30000000-0000-0000-0000-000000000003', 1.5,'points','1.5x travel'),
  ('20000000-0000-0000-0000-000000000063','30000000-0000-0000-0000-000000000008', 1.0,'points','1x everything else')
ON CONFLICT DO NOTHING;

-- ──── RBC Rewards+ Visa (064) ─────────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000064','30000000-0000-0000-0000-000000000008', 1.0,'points','1x everything')
ON CONFLICT DO NOTHING;

-- ──── RBC Cash Back Preferred WE MC (065) ─────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000065','30000000-0000-0000-0000-000000000008', 2.0,'cashback_pct','2% on all purchases')
ON CONFLICT DO NOTHING;

-- ──── RBC WestJet MC (066) ────────────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000066','30000000-0000-0000-0000-000000000003', 1.5,'points','1.5x WestJet'),
  ('20000000-0000-0000-0000-000000000066','30000000-0000-0000-0000-000000000008', 1.0,'points','1x everything else')
ON CONFLICT DO NOTHING;

-- ──── Scotiabank Value Visa (067) ─────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000067','30000000-0000-0000-0000-000000000008', 0.5,'cashback_pct','0.5% everything — low rate card')
ON CONFLICT DO NOTHING;

-- ──── Scotia Momentum No-Fee Visa (068) ───────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000068','30000000-0000-0000-0000-000000000001', 1.0,'cashback_pct','1% groceries'),
  ('20000000-0000-0000-0000-000000000068','30000000-0000-0000-0000-000000000004', 1.0,'cashback_pct','1% gas'),
  ('20000000-0000-0000-0000-000000000068','30000000-0000-0000-0000-000000000008', 0.5,'cashback_pct','0.5% everything else')
ON CONFLICT DO NOTHING;

-- ──── Scotiabank Platinum Amex (069) ──────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000069','30000000-0000-0000-0000-000000000002', 5.0,'points','5x dining'),
  ('20000000-0000-0000-0000-000000000069','30000000-0000-0000-0000-000000000006', 5.0,'points','5x entertainment'),
  ('20000000-0000-0000-0000-000000000069','30000000-0000-0000-0000-000000000003', 3.0,'points','3x travel'),
  ('20000000-0000-0000-0000-000000000069','30000000-0000-0000-0000-000000000008', 1.0,'points','1x everything else')
ON CONFLICT DO NOTHING;

-- ──── BMO Cash Back MC (070) ──────────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000070','30000000-0000-0000-0000-000000000001', 3.0,'cashback_pct','3% groceries'),
  ('20000000-0000-0000-0000-000000000070','30000000-0000-0000-0000-000000000004', 1.0,'cashback_pct','1% gas'),
  ('20000000-0000-0000-0000-000000000070','30000000-0000-0000-0000-000000000008', 0.5,'cashback_pct','0.5% everything else')
ON CONFLICT DO NOTHING;

-- ──── BMO Rewards MC (071) ────────────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000071','30000000-0000-0000-0000-000000000008', 1.0,'points','1x everything')
ON CONFLICT DO NOTHING;

-- ──── BMO eclipse Visa Infinite (072) ─────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000072','30000000-0000-0000-0000-000000000001', 5.0,'cashback_pct','5% groceries'),
  ('20000000-0000-0000-0000-000000000072','30000000-0000-0000-0000-000000000004', 3.0,'cashback_pct','3% gas & transit'),
  ('20000000-0000-0000-0000-000000000072','30000000-0000-0000-0000-000000000008', 1.0,'cashback_pct','1% everything else')
ON CONFLICT DO NOTHING;

-- ──── BMO eclipse Visa Infinite Privilege (073) ───────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000073','30000000-0000-0000-0000-000000000001', 5.0,'cashback_pct','5% groceries'),
  ('20000000-0000-0000-0000-000000000073','30000000-0000-0000-0000-000000000004', 4.0,'cashback_pct','4% transit, 3% gas'),
  ('20000000-0000-0000-0000-000000000073','30000000-0000-0000-0000-000000000002', 3.0,'cashback_pct','3% dining'),
  ('20000000-0000-0000-0000-000000000073','30000000-0000-0000-0000-000000000008', 1.0,'cashback_pct','1% everything else')
ON CONFLICT DO NOTHING;

-- ──── CIBC Select Visa (074) ──────────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000074','30000000-0000-0000-0000-000000000008', 0.5,'cashback_pct','0.5% everything')
ON CONFLICT DO NOTHING;

-- ──── CIBC Dividend Visa (075) ────────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000075','30000000-0000-0000-0000-000000000001', 1.0,'cashback_pct','1% groceries'),
  ('20000000-0000-0000-0000-000000000075','30000000-0000-0000-0000-000000000008', 0.5,'cashback_pct','0.5% everything else')
ON CONFLICT DO NOTHING;

-- ──── CIBC Dividend Platinum Visa (076) ───────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000076','30000000-0000-0000-0000-000000000001', 2.0,'cashback_pct','2% groceries'),
  ('20000000-0000-0000-0000-000000000076','30000000-0000-0000-0000-000000000004', 2.0,'cashback_pct','2% gas'),
  ('20000000-0000-0000-0000-000000000076','30000000-0000-0000-0000-000000000002', 1.0,'cashback_pct','1% dining'),
  ('20000000-0000-0000-0000-000000000076','30000000-0000-0000-0000-000000000008', 0.5,'cashback_pct','0.5% everything else')
ON CONFLICT DO NOTHING;

-- ──── CIBC Aeroplan Visa Infinite (077) ───────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000077','30000000-0000-0000-0000-000000000003', 1.5,'points','1.5x travel'),
  ('20000000-0000-0000-0000-000000000077','30000000-0000-0000-0000-000000000001', 1.5,'points','1.5x groceries'),
  ('20000000-0000-0000-0000-000000000077','30000000-0000-0000-0000-000000000004', 1.5,'points','1.5x gas'),
  ('20000000-0000-0000-0000-000000000077','30000000-0000-0000-0000-000000000008', 1.0,'points','1x everything else')
ON CONFLICT DO NOTHING;

-- ──── Marriott Bonvoy Amex (078) ──────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000078','30000000-0000-0000-0000-000000000003', 5.0,'points','5x at Marriott hotels'),
  ('20000000-0000-0000-0000-000000000078','30000000-0000-0000-0000-000000000002', 2.0,'points','2x dining'),
  ('20000000-0000-0000-0000-000000000078','30000000-0000-0000-0000-000000000008', 1.0,'points','1x everything else')
ON CONFLICT DO NOTHING;

-- ──── Amex Green (079) ────────────────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000079','30000000-0000-0000-0000-000000000008', 1.0,'points','1x everything')
ON CONFLICT DO NOTHING;

-- ──── Amex Business Edge (080) ────────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000080','30000000-0000-0000-0000-000000000004', 3.0,'points','3x gas + office'),
  ('20000000-0000-0000-0000-000000000080','30000000-0000-0000-0000-000000000002', 2.0,'points','2x dining'),
  ('20000000-0000-0000-0000-000000000080','30000000-0000-0000-0000-000000000008', 1.0,'points','1x everything else')
ON CONFLICT DO NOTHING;

-- ──── Amex Platinum Business (081) ────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000081','30000000-0000-0000-0000-000000000003', 2.0,'points','2x travel'),
  ('20000000-0000-0000-0000-000000000081','30000000-0000-0000-0000-000000000008', 1.5,'points','1.5x everything else')
ON CONFLICT DO NOTHING;

-- ──── Amex Aeroplan Business Reserve (082) ────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000082','30000000-0000-0000-0000-000000000002', 3.0,'points','3x dining'),
  ('20000000-0000-0000-0000-000000000082','30000000-0000-0000-0000-000000000003', 2.0,'points','2x travel'),
  ('20000000-0000-0000-0000-000000000082','30000000-0000-0000-0000-000000000008', 1.25,'points','1.25x everything else')
ON CONFLICT DO NOTHING;

-- ──── Brim MC (083) ───────────────────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000083','30000000-0000-0000-0000-000000000008', 1.0,'points','1x everything, no FX fees')
ON CONFLICT DO NOTHING;

-- ──── Rogers WE MC (084) ──────────────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000084','30000000-0000-0000-0000-000000000008', 1.75,'cashback_pct','1.75% CAD, 4% USD')
ON CONFLICT DO NOTHING;

-- ──── Rogers Platinum MC (085) ────────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000085','30000000-0000-0000-0000-000000000008', 1.0,'cashback_pct','1% CAD, 3% USD')
ON CONFLICT DO NOTHING;

-- ──── Tangerine World MC (086) ────────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000086','30000000-0000-0000-0000-000000000001', 2.0,'cashback_pct','2% in chosen categories'),
  ('20000000-0000-0000-0000-000000000086','30000000-0000-0000-0000-000000000002', 2.0,'cashback_pct','2% in chosen categories'),
  ('20000000-0000-0000-0000-000000000086','30000000-0000-0000-0000-000000000004', 2.0,'cashback_pct','2% in chosen categories'),
  ('20000000-0000-0000-0000-000000000086','30000000-0000-0000-0000-000000000008', 0.5,'cashback_pct','0.5% everything else')
ON CONFLICT DO NOTHING;

-- ──── Simplii Visa (087) ──────────────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000087','30000000-0000-0000-0000-000000000008', 0.5,'cashback_pct','0.5% everything')
ON CONFLICT DO NOTHING;

-- ──── Neo Secured MC (088) ────────────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000088','30000000-0000-0000-0000-000000000008', 0.5,'cashback_pct','0.5% base, up to 5% at partners')
ON CONFLICT DO NOTHING;

-- ──── PC Money Account (089) ──────────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000089','30000000-0000-0000-0000-000000000001', 1.0,'cashback_pct','1% at Loblaw stores'),
  ('20000000-0000-0000-0000-000000000089','30000000-0000-0000-0000-000000000005', 2.5,'cashback_pct','2.5% at Shoppers Drug Mart'),
  ('20000000-0000-0000-0000-000000000089','30000000-0000-0000-0000-000000000008', 0.5,'cashback_pct','0.5% everything else')
ON CONFLICT DO NOTHING;

-- ──── TD First Class Visa Infinite Privilege (090) ────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000090','30000000-0000-0000-0000-000000000003', 9.0,'points','9x on Expedia for TD'),
  ('20000000-0000-0000-0000-000000000090','30000000-0000-0000-0000-000000000001', 6.0,'points','6x groceries'),
  ('20000000-0000-0000-0000-000000000090','30000000-0000-0000-0000-000000000002', 6.0,'points','6x dining'),
  ('20000000-0000-0000-0000-000000000090','30000000-0000-0000-0000-000000000008', 3.0,'points','3x everything else')
ON CONFLICT DO NOTHING;

-- ──── Scotiabank No-Fee Visa (091) ────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000091','30000000-0000-0000-0000-000000000008', 1.0,'cashback_pct','1% everything')
ON CONFLICT DO NOTHING;

-- ──── BMO Air Miles MC (092) ──────────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000092','30000000-0000-0000-0000-000000000008', 1.0,'points','1 Air Mile per $20 spend')
ON CONFLICT DO NOTHING;

-- ──── CIBC Aventura Gold Visa (093) ───────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000093','30000000-0000-0000-0000-000000000002', 2.0,'points','2x dining'),
  ('20000000-0000-0000-0000-000000000093','30000000-0000-0000-0000-000000000003', 2.0,'points','2x travel'),
  ('20000000-0000-0000-0000-000000000093','30000000-0000-0000-0000-000000000008', 1.0,'points','1x everything else')
ON CONFLICT DO NOTHING;

-- ──── MBNA Alaska Airlines WE MC (094) ────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000094','30000000-0000-0000-0000-000000000003', 3.0,'points','3x Alaska Airlines'),
  ('20000000-0000-0000-0000-000000000094','30000000-0000-0000-0000-000000000001', 3.0,'points','3x groceries'),
  ('20000000-0000-0000-0000-000000000094','30000000-0000-0000-0000-000000000004', 3.0,'points','3x gas'),
  ('20000000-0000-0000-0000-000000000094','30000000-0000-0000-0000-000000000008', 1.0,'points','1x everything else')
ON CONFLICT DO NOTHING;

-- ──── Amex Aeroplan No Fee (095) ──────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000095','30000000-0000-0000-0000-000000000008', 1.0,'points','1x Aeroplan everywhere')
ON CONFLICT DO NOTHING;

-- ──── RBC BA Visa Infinite (096) ──────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000096','30000000-0000-0000-0000-000000000008', 2.0,'points','2x Avios on everything')
ON CONFLICT DO NOTHING;

-- ──── BMO Preferred Rate MC (097) ─────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000097','30000000-0000-0000-0000-000000000008', 0.5,'cashback_pct','0.5% cashback — low rate card')
ON CONFLICT DO NOTHING;

-- ──── Scotia Momentum MC No Fee (098) ─────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000098','30000000-0000-0000-0000-000000000001', 1.0,'cashback_pct','1% groceries'),
  ('20000000-0000-0000-0000-000000000098','30000000-0000-0000-0000-000000000004', 1.0,'cashback_pct','1% gas'),
  ('20000000-0000-0000-0000-000000000098','30000000-0000-0000-0000-000000000008', 0.5,'cashback_pct','0.5% everything else')
ON CONFLICT DO NOTHING;

-- ──── HSBC Cashback MC (099) ──────────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000099','30000000-0000-0000-0000-000000000008', 0.5,'cashback_pct','0.5% everything')
ON CONFLICT DO NOTHING;

-- ──── Desjardins Remises Visa (100) ───────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000100','30000000-0000-0000-0000-000000000008', 0.5,'cashback_pct','0.5% everything')
ON CONFLICT DO NOTHING;

-- ──── National Bank Platinum MC (101) ─────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000101','30000000-0000-0000-0000-000000000002', 2.0,'points','2x dining'),
  ('20000000-0000-0000-0000-000000000101','30000000-0000-0000-0000-000000000006', 2.0,'points','2x entertainment'),
  ('20000000-0000-0000-0000-000000000101','30000000-0000-0000-0000-000000000008', 1.5,'points','1.5x everything else')
ON CONFLICT DO NOTHING;

-- ──── CIBC Tim Hortons Visa (102) ─────────────────────────────
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, notes) VALUES
  ('20000000-0000-0000-0000-000000000102','30000000-0000-0000-0000-000000000002', 3.0,'cashback_pct','3% at Tim Hortons'),
  ('20000000-0000-0000-0000-000000000102','30000000-0000-0000-0000-000000000008', 0.5,'cashback_pct','0.5% everything else')
ON CONFLICT DO NOTHING;


-- ══════════════════════════════════════════════════════════════
-- ADDITIONAL TRANSFER PARTNERS
-- ══════════════════════════════════════════════════════════════

-- Amex MR CA → Marriott Bonvoy (1:1.2 ratio)
INSERT INTO transfer_partners (from_program_id, to_program_id, transfer_ratio, minimum_transfer, transfer_increment, processing_days, is_active, effective_from, notes)
VALUES ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000013', 1.2, 1000, 1000, 2, true, '2026-03-09', 'Amex MR → Marriott Bonvoy 1:1.2')
ON CONFLICT DO NOTHING;

-- Amex MR CA → Hilton Honors (1:2 ratio)
INSERT INTO transfer_partners (from_program_id, to_program_id, transfer_ratio, minimum_transfer, transfer_increment, processing_days, is_active, effective_from, notes)
VALUES ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000014', 2.0, 1000, 1000, 2, true, '2026-03-09', 'Amex MR → Hilton 1:2')
ON CONFLICT DO NOTHING;

-- Scene+ → Aeroplan (1:1 ratio, Scotiabank partnership)
INSERT INTO transfer_partners (from_program_id, to_program_id, transfer_ratio, minimum_transfer, transfer_increment, processing_days, is_active, effective_from, notes)
VALUES ('10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 1.0, 1000, 1000, 5, true, '2026-03-09', 'Scene+ → Aeroplan 1:1')
ON CONFLICT DO NOTHING;


-- ══════════════════════════════════════════════════════════════
-- POINT VALUATIONS for new programs
-- ══════════════════════════════════════════════════════════════

INSERT INTO point_valuations (loyalty_program_id, segment, cpp, source, effective_date) VALUES
  ('10000000-0000-0000-0000-000000000020', 'base',     0.80, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000021', 'base',     0.50, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000022', 'base',     0.70, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000023', 'base',     1.00, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000024', 'base',     1.00, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000025', 'base',     0.50, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000026', 'base',     1.00, 'manual', '2026-03-09'),
  ('10000000-0000-0000-0000-000000000027', 'base',     1.00, 'manual', '2026-03-09')
ON CONFLICT DO NOTHING;
