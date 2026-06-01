-- Reverts 000091_loyalty_reassignments.up.sql. Restores each card's original loyalty_program_id,
-- pinning the corrected (new) program in the WHERE so a revert is a safe no-op if data drifted.
-- Runs before 089's down, so the new programs still exist to be resolved by slug here. Statements
-- in reverse order.

-- ============================== TD (revert) ==============================
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$td-rewards$$)
WHERE id = $$20000000-0000-0000-0000-000000000011$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$td-cash-back$$);

-- ============================== Tangerine (revert) ==============================
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$td-rewards$$)
WHERE id = $$20000000-0000-0000-0000-000000000086$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$tangerine-money-back$$);
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$td-rewards$$)
WHERE id = $$20000000-0000-0000-0000-000000000033$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$tangerine-money-back$$);

-- ============================== Simplii (revert) ==============================
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$td-rewards$$)
WHERE id = $$20000000-0000-0000-0000-000000000087$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$simplii-cashback$$);
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$td-rewards$$)
WHERE id = $$20000000-0000-0000-0000-000000000034$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$simplii-cashback$$);

-- ============================== Scotiabank (revert) ==============================
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$scotia-rewards$$)
WHERE id = $$20000000-0000-0000-0000-000000000067$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$cashback$$);
-- revert Scotia No-Fee earn_type points -> cashback_pct, then program scene-plus -> scotia-rewards
UPDATE card_multipliers SET earn_type = $$cashback_pct$$
WHERE id = $$16330cef-849b-4cef-a6cf-224eaa1b71b3$$ AND earn_type = $$points$$;
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$scotia-rewards$$)
WHERE id = $$20000000-0000-0000-0000-000000000091$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$scene-plus$$);
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$scene-plus$$)
WHERE id = $$20000000-0000-0000-0000-000000000068$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$scotia-cashback$$);
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$scene-plus$$)
WHERE id = $$20000000-0000-0000-0000-000000000019$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$scotia-cashback$$);
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$scene-plus$$)
WHERE id = $$20000000-0000-0000-0000-000000000098$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$scotia-cashback$$);

-- ============================== RBC (revert) ==============================
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$rbc-avion$$)
WHERE id = $$20000000-0000-0000-0000-000000000065$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$rbc-cash-back$$);
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$rbc-avion$$)
WHERE id = $$20000000-0000-0000-0000-000000000015$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$rbc-cash-back$$);

-- ============================== Rogers (revert) ==============================
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$td-rewards$$)
WHERE id = $$20000000-0000-0000-0000-000000000084$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$rogers-cashback$$);
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$td-rewards$$)
WHERE id = $$20000000-0000-0000-0000-000000000032$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$rogers-cashback$$);
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$td-rewards$$)
WHERE id = $$20000000-0000-0000-0000-000000000085$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$rogers-cashback$$);

-- ============================== Neo (revert) ==============================
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$td-rewards$$)
WHERE id = $$20000000-0000-0000-0000-000000000041$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$neo-cashback$$);
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$td-rewards$$)
WHERE id = $$20000000-0000-0000-0000-000000000088$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$neo-cashback$$);
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$td-rewards$$)
WHERE id = $$20000000-0000-0000-0000-000000000035$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$neo-cashback$$);

-- ============================== National Bank (revert) ==============================
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$nbc-rewards$$)
WHERE id = $$20000000-0000-0000-0000-000000000057$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$cashback$$);

-- ============================== CIBC (revert) ==============================
UPDATE cards SET loyalty_program_id = $$10000000-0000-0000-0000-000000000027$$
WHERE id = $$20000000-0000-0000-0000-000000000102$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$tim-cash$$);
UPDATE cards SET loyalty_program_id = $$10000000-0000-0000-0000-000000000027$$
WHERE id = $$20000000-0000-0000-0000-000000000074$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$cashback$$);
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$cibc-aventura$$)
WHERE id = $$20000000-0000-0000-0000-000000000024$$ AND loyalty_program_id = $$10000000-0000-0000-0000-000000000027$$;
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$cibc-aventura$$)
WHERE id = $$20000000-0000-0000-0000-000000000025$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$cibc-costco-cashback$$);

-- ============================== BMO (revert) ==============================
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$bmo-rewards$$)
WHERE id = $$20000000-0000-0000-0000-000000000097$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$cashback$$);
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$bmo-rewards$$)
WHERE id = $$20000000-0000-0000-0000-000000000070$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$bmo-cashback$$);

-- ============================== American Express (revert) ==============================
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$amex-mr-ca$$)
WHERE id = $$20000000-0000-0000-0000-000000000027$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$amex-simplycash$$);
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$amex-mr-ca$$)
WHERE id = $$20000000-0000-0000-0000-000000000026$$ AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$amex-simplycash$$);
