-- Card-data accuracy corrections (2026-06-01), generated from the 124-agent data-accuracy
-- audit (113 HIGH-severity findings). This migration applies ONLY concrete, self-validated,
-- reversible single-column writes; structural/prose findings (missing categories, proprietary
-- loyalty currencies, category restructuring, values the schema cannot store) are intentionally
-- NOT included here -- see migrations/000088_CORRECTIONS_REPORT.md.
--
-- Self-validation: each correction was gated against the live DB -- the row's CURRENT value had
-- to equal the audit's stated "our_value" before an UPDATE was emitted. Every WHERE clause pins
-- the prior value, so a statement is a safe no-op if the data has since drifted. All statements
-- were dry-run inside BEGIN ... ROLLBACK (each reported UPDATE 1) before this file was written.
--
-- Fields corrected: cards.annual_fee, cards.loyalty_program_id, card_multipliers.earn_rate,
-- card_multipliers.earn_type. Multiplier rows are keyed by immutable id (resolved from card name
-- + category slug); card rows by name. Source attribution is in each per-statement comment.
-- (golang-migrate wraps each migration in its own transaction, matching prior migrations 80-87.)

-- ============================== American Express ==============================
-- American Express Business Edge dining earn_rate 2 -> 3  [source: americanexpress.com]
UPDATE card_multipliers SET earn_rate = 3.00 WHERE id = $$7fb91b5c-830f-4f17-9bf7-8e73c11f2b9e$$ AND earn_rate = 2.00;
-- American Express Business Edge earn_type cashback_pct -> points  [source: americanexpress.com]
UPDATE card_multipliers SET earn_type = $$points$$ WHERE id = $$248ea0dc-f8e3-4cf5-9879-ed9f84152567$$ AND earn_type = $$cashback_pct$$;
-- American Express Platinum Business annual_fee $499 -> $799  [source: frugalflyer.ca]
UPDATE cards SET annual_fee = 799.00 WHERE name = $$American Express Platinum Business$$ AND annual_fee = 499.00;
-- American Express Platinum Business everything-else earn_rate 2 -> 1.25, earn_type cashback_pct -> points  [source: frugalflyer.ca]
UPDATE card_multipliers SET earn_rate = 1.25, earn_type = $$points$$ WHERE id = $$be3e6511-2bcb-430c-88cc-a0afe8342d07$$ AND earn_rate = 2.00 AND earn_type = $$cashback_pct$$;
-- American Express Platinum Business travel earn_rate 2 -> 1.25  [source: frugalflyer.ca]
UPDATE card_multipliers SET earn_rate = 1.25 WHERE id = $$8c3a6cc1-0f3d-4ebc-a91d-cde7c5c36e8a$$ AND earn_rate = 2.00;
-- Amex Cobalt annual_fee $155.88 -> $191.88  [source: ratehub.ca]
UPDATE cards SET annual_fee = 191.88 WHERE name = $$Amex Cobalt$$ AND annual_fee = 155.88;
-- Amex Cobalt travel earn_rate 2 -> 1  [source: milesopedia.com]
UPDATE card_multipliers SET earn_rate = 1.00 WHERE id = $$706eab3a-484e-4c84-b698-d65f402452bb$$ AND earn_rate = 2.00;

-- ============================== BMO ==============================
-- BMO World Elite Mastercard everything-else earn_rate 2 -> 1  [source: finlywealth.com]
UPDATE card_multipliers SET earn_rate = 1.00 WHERE id = $$683315c5-b0c0-4f44-99fe-1038b5f15183$$ AND earn_rate = 2.00;
-- BMO eclipse Visa Infinite Privilege annual_fee $180 -> $599  [source: bmo.com]
UPDATE cards SET annual_fee = 599.00 WHERE name = $$BMO eclipse Visa Infinite Privilege$$ AND annual_fee = 180.00;

-- ============================== Brim ==============================
-- Brim World Elite Mastercard annual_fee $199 -> $89  [source: brimfinancial.com]
UPDATE cards SET annual_fee = 89.00 WHERE name = $$Brim World Elite Mastercard$$ AND annual_fee = 199.00;

-- ============================== CIBC ==============================
-- CIBC Aventura Gold Visa annual_fee $79 -> $139  [source: cibc.com]
UPDATE cards SET annual_fee = 139.00 WHERE name = $$CIBC Aventura Gold Visa$$ AND annual_fee = 79.00;
-- CIBC Dividend Platinum Visa dining earn_rate 1 -> 2  [source: princeoftravel.com]
UPDATE card_multipliers SET earn_rate = 2.00 WHERE id = $$ccf3018a-80f4-4b08-aaeb-872b4ee76284$$ AND earn_rate = 1.00;
-- CIBC Dividend Platinum Visa annual_fee $30 -> $99  [source: cibc.com]
UPDATE cards SET annual_fee = 99.00 WHERE name = $$CIBC Dividend Platinum Visa$$ AND annual_fee = 30.00;

-- ============================== Desjardins ==============================
-- Desjardins Cash Back World Elite Visa annual_fee $85 -> $100  [source: desjardins.com]
UPDATE cards SET annual_fee = 100.00 WHERE name = $$Desjardins Cash Back World Elite Visa$$ AND annual_fee = 85.00;
-- Desjardins Odyssey World Elite Mastercard dining earn_rate 2 -> 3  [source: desjardins.com]
UPDATE card_multipliers SET earn_rate = 3.00 WHERE id = $$518f0631-db7f-402a-ab26-e8b2b818e4b8$$ AND earn_rate = 2.00;

-- ============================== MBNA ==============================
-- MBNA Rewards World Elite Mastercard annual_fee $89 -> $120  [source: mbna.ca]
UPDATE cards SET annual_fee = 120.00 WHERE name = $$MBNA Rewards World Elite Mastercard$$ AND annual_fee = 89.00;
-- MBNA Rewards World Elite Mastercard travel earn_rate 2 -> 1  [source: mbna.ca]
UPDATE card_multipliers SET earn_rate = 1.00 WHERE id = $$a8940562-7e2b-4e8f-bab3-9969b5303c0d$$ AND earn_rate = 2.00;

-- ============================== National Bank ==============================
-- National Bank Allure Mastercard annual_fee $79 -> $0  [source: nbc.ca]
UPDATE cards SET annual_fee = 0.00 WHERE name = $$National Bank Allure Mastercard$$ AND annual_fee = 79.00;
-- National Bank Platinum Mastercard annual_fee $65 -> $70  [source: milesopedia.com]
UPDATE cards SET annual_fee = 70.00 WHERE name = $$National Bank Platinum Mastercard$$ AND annual_fee = 65.00;

-- ============================== Neo ==============================
-- Neo Secured Mastercard annual_fee $0 -> $96  [source: milesopedia.com]
UPDATE cards SET annual_fee = 96.00 WHERE name = $$Neo Secured Mastercard$$ AND annual_fee = 0.00;

-- ============================== RBC ==============================
-- RBC Avion Visa Platinum annual_fee $50 -> $120  [source: rbcroyalbank.com]
UPDATE cards SET annual_fee = 120.00 WHERE name = $$RBC Avion Visa Platinum$$ AND annual_fee = 50.00;
-- RBC WestJet Mastercard annual_fee $0 -> $39  [source: rbcroyalbank.com]
UPDATE cards SET annual_fee = 39.00 WHERE name = $$RBC WestJet Mastercard$$ AND annual_fee = 0.00;
-- RBC WestJet World Elite Mastercard dining earn_rate 2 -> 1.5  [source: rbcroyalbank.com]
UPDATE card_multipliers SET earn_rate = 1.50 WHERE id = $$16ae9701-332c-4831-b22c-f005b5fac375$$ AND earn_rate = 2.00;
-- RBC WestJet World Elite Mastercard streaming-digital earn_rate 2 -> 1.5  [source: rbcroyalbank.com]
UPDATE card_multipliers SET earn_rate = 1.50 WHERE id = $$5fa8c036-5193-453c-b185-c002fcea9335$$ AND earn_rate = 2.00;

-- ============================== Scotiabank ==============================
-- Scotiabank No-Fee Visa Card earn_type cashback_pct -> points  [source: milesopedia.com]
UPDATE card_multipliers SET earn_type = $$points$$ WHERE id = $$16330cef-849b-4cef-a6cf-224eaa1b71b3$$ AND earn_type = $$cashback_pct$$;
-- Scotiabank No-Fee Visa Card loyalty_program scotia-rewards -> scene-plus  [source: ratehub.ca]
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$scene-plus$$) WHERE name = $$Scotiabank No-Fee Visa Card$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$scotia-rewards$$);
-- Scotiabank Value Visa Card everything-else earn_rate 0.5 -> 0 (card earns no rewards)  [source: nerdwallet.com]
UPDATE card_multipliers SET earn_rate = 0.00 WHERE id = $$6e384372-1a61-4111-9dc9-9c3a71a6ac59$$ AND earn_rate = 0.50;

-- ============================== TD ==============================
-- TD Cash Back Visa Card gas-transit earn_rate 0.75 -> 1  [source: td.com]
UPDATE card_multipliers SET earn_rate = 1.00 WHERE id = $$5c07a166-08a2-4a52-a134-f9bb648a1c3f$$ AND earn_rate = 0.75;
-- TD Cash Back Visa Card recurring-bills earn_rate 0.75 -> 1  [source: td.com]
UPDATE card_multipliers SET earn_rate = 1.00 WHERE id = $$8252300f-b26c-4829-94c5-6a5649be093b$$ AND earn_rate = 0.75;
-- TD First Class Travel Visa Infinite annual_fee $120 -> $139  [source: ratehub.ca]
UPDATE cards SET annual_fee = 139.00 WHERE name = $$TD First Class Travel Visa Infinite$$ AND annual_fee = 120.00;

-- ============================== Wealthsimple ==============================
-- Wealthsimple Visa Infinite annual_fee $0 -> $240  [source: wealthsimple.com]
UPDATE cards SET annual_fee = 240.00 WHERE name = $$Wealthsimple Visa Infinite$$ AND annual_fee = 0.00;
