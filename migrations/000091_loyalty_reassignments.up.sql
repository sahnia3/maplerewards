-- Structural-data corrections, step 3 of 4: loyalty-program reassignments (2026-06-01).
-- Repoints cards.loyalty_program_id from the wrong points program to the correct cash-back /
-- proprietary program created in 089 (or to an existing one where it already exists). All 27
-- in-scope cards already carry earn_type='cashback_pct' on every multiplier row (verified), so
-- NO multiplier earn_type change is needed for the cash-back cards -- the defect is purely the
-- program pointer. The ONE exception is Scotiabank No-Fee Visa (...091), which truly earns Scene+
-- POINTS: it is reassigned to the existing scene-plus program AND its everything-else base row is
-- flipped cashback_pct -> points (so the new accelerated rows added in 090 are consistent).
--
-- Every UPDATE pins the prior loyalty_program_id in its WHERE clause (resolved by slug), so a
-- statement is a safe no-op if the card has since been re-pointed. The "true no rewards" cards
-- (BMO Preferred Rate, CIBC Select, National Bank Syncro, Scotiabank Value) point at the generic
-- 'cashback' program because cards.loyalty_program_id is NOT NULL with no 'none' sentinel; their
-- everything-else earn_rate is/should be 0 (handled by the earn-rate group / migration 088), so
-- projected rewards remain $0 regardless of program. Depends on 089 (programs must exist).
-- Dry-run inside BEGIN ... ROLLBACK before being written.

-- ============================== American Express (SimplyCash -> amex-simplycash) ==============================
-- SimplyCash Card from American Express (...026): amex-mr-ca -> amex-simplycash (earns statement cash) [milesopedia.com]
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$amex-simplycash$$)
WHERE id = $$20000000-0000-0000-0000-000000000026$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$amex-mr-ca$$);
-- SimplyCash Preferred Card from American Express (...027): amex-mr-ca -> amex-simplycash [nerdwallet.com]
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$amex-simplycash$$)
WHERE id = $$20000000-0000-0000-0000-000000000027$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$amex-mr-ca$$);

-- ============================== BMO ==============================
-- BMO Cash Back Mastercard (...070): bmo-rewards -> bmo-cashback [milesopedia.com]
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$bmo-cashback$$)
WHERE id = $$20000000-0000-0000-0000-000000000070$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$bmo-rewards$$);
-- BMO Preferred Rate Mastercard (...097): bmo-rewards -> cashback (no rewards program; low-interest card) [moneysense.ca]
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$cashback$$)
WHERE id = $$20000000-0000-0000-0000-000000000097$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$bmo-rewards$$);

-- ============================== CIBC ==============================
-- CIBC Costco Mastercard (...025): cibc-aventura -> cibc-costco-cashback (Costco Cash Back certificate) [cibc.com]
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$cibc-costco-cashback$$)
WHERE id = $$20000000-0000-0000-0000-000000000025$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$cibc-aventura$$);
-- CIBC Dividend Visa Infinite (...024): cibc-aventura -> cibc-dividend (existing standalone cash-back program) [cibc.com]
UPDATE cards SET loyalty_program_id = $$10000000-0000-0000-0000-000000000027$$
WHERE id = $$20000000-0000-0000-0000-000000000024$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$cibc-aventura$$);
-- CIBC Select Visa Card (...074): cibc-dividend -> cashback (no rewards program; low-interest) [cibc.com]
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$cashback$$)
WHERE id = $$20000000-0000-0000-0000-000000000074$$ AND loyalty_program_id = $$10000000-0000-0000-0000-000000000027$$;
-- CIBC Tim Hortons Visa (...102): cibc-dividend -> tim-cash (Tim Cash currency) [ratehub.ca]
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$tim-cash$$)
WHERE id = $$20000000-0000-0000-0000-000000000102$$ AND loyalty_program_id = $$10000000-0000-0000-0000-000000000027$$;

-- ============================== National Bank ==============================
-- National Bank Syncro Mastercard (...057): nbc-rewards -> cashback (no rewards program; low-interest) [finlywealth.com]
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$cashback$$)
WHERE id = $$20000000-0000-0000-0000-000000000057$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$nbc-rewards$$);

-- ============================== Neo (all td-rewards -> neo-cashback) ==============================
-- Neo Mastercard (...035) [nerdwallet.com]
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$neo-cashback$$)
WHERE id = $$20000000-0000-0000-0000-000000000035$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$td-rewards$$);
-- Neo Secured Mastercard (...088) [nerdwallet.com]
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$neo-cashback$$)
WHERE id = $$20000000-0000-0000-0000-000000000088$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$td-rewards$$);
-- Neo World Elite Mastercard (...041) [milesopedia.com]
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$neo-cashback$$)
WHERE id = $$20000000-0000-0000-0000-000000000041$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$td-rewards$$);

-- ============================== Rogers (all td-rewards -> rogers-cashback) ==============================
-- Rogers Platinum Mastercard (...085) [rogersbank.com]
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$rogers-cashback$$)
WHERE id = $$20000000-0000-0000-0000-000000000085$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$td-rewards$$);
-- Rogers Red World Elite Mastercard (...032) [rogersbank.com]
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$rogers-cashback$$)
WHERE id = $$20000000-0000-0000-0000-000000000032$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$td-rewards$$);
-- Rogers World Elite Mastercard (...084) [rogersbank.com]
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$rogers-cashback$$)
WHERE id = $$20000000-0000-0000-0000-000000000084$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$td-rewards$$);

-- ============================== RBC (all rbc-avion -> rbc-cash-back) ==============================
-- RBC Cash Back Mastercard (...015) [rbcroyalbank.com]
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$rbc-cash-back$$)
WHERE id = $$20000000-0000-0000-0000-000000000015$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$rbc-avion$$);
-- RBC Cash Back Preferred World Elite Mastercard (...065) [rbcroyalbank.com]
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$rbc-cash-back$$)
WHERE id = $$20000000-0000-0000-0000-000000000065$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$rbc-avion$$);

-- ============================== Scotiabank ==============================
-- Scotia Momentum Mastercard No Fee (...098): scene-plus -> scotia-cashback [ratehub.ca]
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$scotia-cashback$$)
WHERE id = $$20000000-0000-0000-0000-000000000098$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$scene-plus$$);
-- Scotia Momentum Visa Infinite (...019): scene-plus -> scotia-cashback [scotiabank.com]
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$scotia-cashback$$)
WHERE id = $$20000000-0000-0000-0000-000000000019$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$scene-plus$$);
-- Scotiabank Momentum No-Fee Visa (...068): scene-plus -> scotia-cashback [scotiabank.com]
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$scotia-cashback$$)
WHERE id = $$20000000-0000-0000-0000-000000000068$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$scene-plus$$);
-- Scotiabank No-Fee Visa Card (...091): scotia-rewards -> scene-plus (this card EARNS Scene+ POINTS).
-- Also flip its everything-else base row earn_type cashback_pct -> points so it (and the 090 rows) read as points.
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$scene-plus$$)
WHERE id = $$20000000-0000-0000-0000-000000000091$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$scotia-rewards$$);
UPDATE card_multipliers SET earn_type = $$points$$
WHERE id = $$16330cef-849b-4cef-a6cf-224eaa1b71b3$$ AND earn_type = $$cashback_pct$$;
-- Scotiabank Value Visa Card (...067): scotia-rewards -> cashback (no rewards program; low-interest) [scotiabank.com]
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$cashback$$)
WHERE id = $$20000000-0000-0000-0000-000000000067$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$scotia-rewards$$);

-- ============================== Simplii (all td-rewards -> simplii-cashback) ==============================
-- Simplii Cash Back Visa (...034) [simplii.com]
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$simplii-cashback$$)
WHERE id = $$20000000-0000-0000-0000-000000000034$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$td-rewards$$);
-- Simplii Financial Visa Card (...087) [simplii.com]
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$simplii-cashback$$)
WHERE id = $$20000000-0000-0000-0000-000000000087$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$td-rewards$$);

-- ============================== Tangerine (all td-rewards -> tangerine-money-back) ==============================
-- Tangerine Money-Back Credit Card (...033) [tangerine.ca]
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$tangerine-money-back$$)
WHERE id = $$20000000-0000-0000-0000-000000000033$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$td-rewards$$);
-- Tangerine World Mastercard (...086) [tangerine.ca]
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$tangerine-money-back$$)
WHERE id = $$20000000-0000-0000-0000-000000000086$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$td-rewards$$);

-- ============================== TD ==============================
-- TD Cash Back Visa Infinite (...011): td-rewards -> td-cash-back (TD Cash Back Dollars, direct cash) [td.com]
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$td-cash-back$$)
WHERE id = $$20000000-0000-0000-0000-000000000011$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$td-rewards$$);
