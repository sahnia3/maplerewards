-- Reverts migration 000088_audit_data_corrections.up.sql. Restores every prior value captured
-- from the live DB at generation time. Statements run in reverse order; each WHERE clause pins
-- the corrected value, so a revert is a safe no-op if the data has since changed. Reversibility
-- was verified by a BEGIN -> up -> down -> ROLLBACK dry-run (all statements reported UPDATE 1).

-- ============================== Wealthsimple (revert) ==============================
-- revert Wealthsimple Visa Infinite annual_fee $0 -> $240
UPDATE cards SET annual_fee = 0.00 WHERE name = $$Wealthsimple Visa Infinite$$ AND annual_fee = 240.00;

-- ============================== TD (revert) ==============================
-- revert TD First Class Travel Visa Infinite annual_fee $120 -> $139
UPDATE cards SET annual_fee = 120.00 WHERE name = $$TD First Class Travel Visa Infinite$$ AND annual_fee = 139.00;
-- revert TD Cash Back Visa Card recurring-bills earn_rate 0.75 -> 1
UPDATE card_multipliers SET earn_rate = 0.75 WHERE id = $$8252300f-b26c-4829-94c5-6a5649be093b$$ AND earn_rate = 1.00;
-- revert TD Cash Back Visa Card gas-transit earn_rate 0.75 -> 1
UPDATE card_multipliers SET earn_rate = 0.75 WHERE id = $$5c07a166-08a2-4a52-a134-f9bb648a1c3f$$ AND earn_rate = 1.00;

-- ============================== Scotiabank (revert) ==============================
-- revert Scotiabank Value Visa Card everything-else earn_rate 0.5 -> 0
UPDATE card_multipliers SET earn_rate = 0.50 WHERE id = $$6e384372-1a61-4111-9dc9-9c3a71a6ac59$$ AND earn_rate = 0.00;
-- revert Scotiabank No-Fee Visa Card loyalty_program scotia-rewards -> scene-plus
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$scotia-rewards$$) WHERE name = $$Scotiabank No-Fee Visa Card$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$scene-plus$$);
-- revert Scotiabank No-Fee Visa Card earn_type cashback_pct -> points
UPDATE card_multipliers SET earn_type = $$cashback_pct$$ WHERE id = $$16330cef-849b-4cef-a6cf-224eaa1b71b3$$ AND earn_type = $$points$$;

-- ============================== RBC (revert) ==============================
-- revert RBC WestJet World Elite Mastercard streaming-digital earn_rate 2 -> 1.5
UPDATE card_multipliers SET earn_rate = 2.00 WHERE id = $$5fa8c036-5193-453c-b185-c002fcea9335$$ AND earn_rate = 1.50;
-- revert RBC WestJet World Elite Mastercard dining earn_rate 2 -> 1.5
UPDATE card_multipliers SET earn_rate = 2.00 WHERE id = $$16ae9701-332c-4831-b22c-f005b5fac375$$ AND earn_rate = 1.50;
-- revert RBC WestJet Mastercard annual_fee $0 -> $39
UPDATE cards SET annual_fee = 0.00 WHERE name = $$RBC WestJet Mastercard$$ AND annual_fee = 39.00;
-- revert RBC Avion Visa Platinum annual_fee $50 -> $120
UPDATE cards SET annual_fee = 50.00 WHERE name = $$RBC Avion Visa Platinum$$ AND annual_fee = 120.00;

-- ============================== Neo (revert) ==============================
-- revert Neo Secured Mastercard annual_fee $0 -> $96
UPDATE cards SET annual_fee = 0.00 WHERE name = $$Neo Secured Mastercard$$ AND annual_fee = 96.00;

-- ============================== National Bank (revert) ==============================
-- revert National Bank Platinum Mastercard annual_fee $65 -> $70
UPDATE cards SET annual_fee = 65.00 WHERE name = $$National Bank Platinum Mastercard$$ AND annual_fee = 70.00;
-- revert National Bank Allure Mastercard annual_fee $79 -> $0
UPDATE cards SET annual_fee = 79.00 WHERE name = $$National Bank Allure Mastercard$$ AND annual_fee = 0.00;

-- ============================== MBNA (revert) ==============================
-- revert MBNA Rewards World Elite Mastercard travel earn_rate 2 -> 1
UPDATE card_multipliers SET earn_rate = 2.00 WHERE id = $$a8940562-7e2b-4e8f-bab3-9969b5303c0d$$ AND earn_rate = 1.00;
-- revert MBNA Rewards World Elite Mastercard annual_fee $89 -> $120
UPDATE cards SET annual_fee = 89.00 WHERE name = $$MBNA Rewards World Elite Mastercard$$ AND annual_fee = 120.00;

-- ============================== Desjardins (revert) ==============================
-- revert Desjardins Odyssey World Elite Mastercard dining earn_rate 2 -> 3
UPDATE card_multipliers SET earn_rate = 2.00 WHERE id = $$518f0631-db7f-402a-ab26-e8b2b818e4b8$$ AND earn_rate = 3.00;
-- revert Desjardins Cash Back World Elite Visa annual_fee $85 -> $100
UPDATE cards SET annual_fee = 85.00 WHERE name = $$Desjardins Cash Back World Elite Visa$$ AND annual_fee = 100.00;

-- ============================== CIBC (revert) ==============================
-- revert CIBC Dividend Platinum Visa annual_fee $30 -> $99
UPDATE cards SET annual_fee = 30.00 WHERE name = $$CIBC Dividend Platinum Visa$$ AND annual_fee = 99.00;
-- revert CIBC Dividend Platinum Visa dining earn_rate 1 -> 2
UPDATE card_multipliers SET earn_rate = 1.00 WHERE id = $$ccf3018a-80f4-4b08-aaeb-872b4ee76284$$ AND earn_rate = 2.00;
-- revert CIBC Aventura Gold Visa annual_fee $79 -> $139
UPDATE cards SET annual_fee = 79.00 WHERE name = $$CIBC Aventura Gold Visa$$ AND annual_fee = 139.00;

-- ============================== Brim (revert) ==============================
-- revert Brim World Elite Mastercard annual_fee $199 -> $89
UPDATE cards SET annual_fee = 199.00 WHERE name = $$Brim World Elite Mastercard$$ AND annual_fee = 89.00;

-- ============================== BMO (revert) ==============================
-- revert BMO eclipse Visa Infinite Privilege annual_fee $180 -> $599
UPDATE cards SET annual_fee = 180.00 WHERE name = $$BMO eclipse Visa Infinite Privilege$$ AND annual_fee = 599.00;
-- revert BMO World Elite Mastercard everything-else earn_rate 2 -> 1
UPDATE card_multipliers SET earn_rate = 2.00 WHERE id = $$683315c5-b0c0-4f44-99fe-1038b5f15183$$ AND earn_rate = 1.00;

-- ============================== American Express (revert) ==============================
-- revert Amex Cobalt travel earn_rate 2 -> 1
UPDATE card_multipliers SET earn_rate = 2.00 WHERE id = $$706eab3a-484e-4c84-b698-d65f402452bb$$ AND earn_rate = 1.00;
-- revert Amex Cobalt annual_fee $155.88 -> $191.88
UPDATE cards SET annual_fee = 155.88 WHERE name = $$Amex Cobalt$$ AND annual_fee = 191.88;
-- revert American Express Platinum Business travel earn_rate 2 -> 1.25
UPDATE card_multipliers SET earn_rate = 2.00 WHERE id = $$8c3a6cc1-0f3d-4ebc-a91d-cde7c5c36e8a$$ AND earn_rate = 1.25;
-- revert American Express Platinum Business everything-else earn_rate 2 -> 1.25, earn_type cashback_pct -> points
UPDATE card_multipliers SET earn_rate = 2.00, earn_type = $$cashback_pct$$ WHERE id = $$be3e6511-2bcb-430c-88cc-a0afe8342d07$$ AND earn_rate = 1.25 AND earn_type = $$points$$;
-- revert American Express Platinum Business annual_fee $499 -> $799
UPDATE cards SET annual_fee = 499.00 WHERE name = $$American Express Platinum Business$$ AND annual_fee = 799.00;
-- revert American Express Business Edge earn_type cashback_pct -> points
UPDATE card_multipliers SET earn_type = $$cashback_pct$$ WHERE id = $$248ea0dc-f8e3-4cf5-9879-ed9f84152567$$ AND earn_type = $$points$$;
-- revert American Express Business Edge dining earn_rate 2 -> 3
UPDATE card_multipliers SET earn_rate = 2.00 WHERE id = $$7fb91b5c-830f-4f17-9bf7-8e73c11f2b9e$$ AND earn_rate = 3.00;
