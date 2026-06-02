-- Reverts 000092_rate_scope_network_fixes.up.sql. Restores every prior value/category captured from
-- the live DB at generation time. Statements in reverse order; new rows are deleted by their unique
-- key (card_id, category_id, effective_from = 2026-06-01); repoints/updates pin the corrected value so
-- a revert is a safe no-op on drift. Runs before 089's down, so the new categories still exist to be
-- referenced here.

-- ============================== BMO Air Miles Mastercard (...092) AIR MILES Partners (revert) ==============================
DELETE FROM card_multipliers
WHERE card_id = $$20000000-0000-0000-0000-000000000092$$ AND category_id = $$30000000-0000-0000-0000-000000000016$$ AND effective_from = DATE $$2026-06-01$$;

-- ============================== Triangle (revert) ==============================
UPDATE card_multipliers SET category_id = $$30000000-0000-0000-0000-000000000004$$, earn_rate = 3.50, notes = $$~3.5% effective at CT gas$$
  WHERE id = $$6f1f0949-b0a6-4918-be04-15d6c09d61b7$$ AND category_id = $$30000000-0000-0000-0000-000000000012$$ AND earn_rate = 3.3;
UPDATE card_multipliers SET category_id = $$30000000-0000-0000-0000-000000000004$$, notes = $$~2% effective at CT gas$$
  WHERE id = $$e0225cea-602a-404d-a439-aae3abdedf30$$ AND category_id = $$30000000-0000-0000-0000-000000000012$$;

-- ============================== BMO CashBack World Elite (...021) split (revert) ==============================
DELETE FROM card_multipliers
WHERE card_id = $$20000000-0000-0000-0000-000000000021$$ AND category_id = $$30000000-0000-0000-0000-000000000012$$ AND effective_from = DATE $$2026-06-01$$;
UPDATE card_multipliers SET category_id = $$30000000-0000-0000-0000-000000000004$$, cap_amount = 300.00, cap_period = $$monthly$$
  WHERE id = $$0f1dd19a-0f5f-4fdb-ab6a-3bca08f38f65$$ AND category_id = $$30000000-0000-0000-0000-000000000014$$;

-- ============================== CIBC Dividend Visa Infinite (...024) split (revert) ==============================
DELETE FROM card_multipliers
WHERE card_id = $$20000000-0000-0000-0000-000000000024$$ AND category_id = $$30000000-0000-0000-0000-000000000014$$ AND effective_from = DATE $$2026-06-01$$;
UPDATE card_multipliers SET category_id = $$30000000-0000-0000-0000-000000000004$$
  WHERE id = $$dfe2ead8-0f03-4c0f-85cf-65bdef541f7b$$ AND category_id = $$30000000-0000-0000-0000-000000000012$$;

-- ============================== Gas/Transit same-bonus splits (revert) ==============================
-- Amex Gold Rewards (...002) gas -> gas-transit
UPDATE card_multipliers SET category_id = $$30000000-0000-0000-0000-000000000004$$ WHERE id = $$64d7417f-a3a6-4993-80b8-11dceb2ff8e8$$ AND category_id = $$30000000-0000-0000-0000-000000000012$$;
-- Desjardins Odyssey WE (...037) transit -> gas-transit
UPDATE card_multipliers SET category_id = $$30000000-0000-0000-0000-000000000004$$ WHERE id = $$43c38c90-fe53-404f-906b-876eb28b1884$$ AND category_id = $$30000000-0000-0000-0000-000000000014$$;
-- Desjardins Cash Back Visa (...053) transit -> gas-transit
UPDATE card_multipliers SET category_id = $$30000000-0000-0000-0000-000000000004$$ WHERE id = $$9a4a0cc0-efe2-43ec-9863-2168b16961c8$$ AND category_id = $$30000000-0000-0000-0000-000000000014$$;
-- MBNA Smart Cash (...050): revert cap group member then the multiplier (gas -> gas-transit)
UPDATE cap_group_categories SET category_id = $$30000000-0000-0000-0000-000000000004$$
  WHERE cap_group_id = $$40000000-0000-0000-0000-000000048006$$ AND category_id = $$30000000-0000-0000-0000-000000000012$$;
UPDATE card_multipliers SET category_id = $$30000000-0000-0000-0000-000000000004$$ WHERE id = $$98dedd7a-3847-49a0-af42-860f4a7cdd4b$$ AND category_id = $$30000000-0000-0000-0000-000000000012$$;
-- Scotiabank Passport VI (...008): revert cap group member then the multiplier (transit -> gas-transit)
UPDATE cap_group_categories SET category_id = $$30000000-0000-0000-0000-000000000004$$
  WHERE cap_group_id = $$40000000-0000-0000-0000-000000048002$$ AND category_id = $$30000000-0000-0000-0000-000000000014$$;
UPDATE card_multipliers SET category_id = $$30000000-0000-0000-0000-000000000004$$ WHERE id = $$127b5dc3-a6cb-44c5-8823-6d44287176d6$$ AND category_id = $$30000000-0000-0000-0000-000000000014$$;
-- TD Rewards Visa Card (...061) transit -> gas-transit
UPDATE card_multipliers SET category_id = $$30000000-0000-0000-0000-000000000004$$ WHERE id = $$523cd372-bb83-4113-a4d8-442621639b1a$$ AND category_id = $$30000000-0000-0000-0000-000000000014$$;
-- TD Platinum Travel Visa (...013) transit -> gas-transit
UPDATE card_multipliers SET category_id = $$30000000-0000-0000-0000-000000000004$$ WHERE id = $$0c86c8fc-9011-4fe1-bfec-06cea5e5fa6d$$ AND category_id = $$30000000-0000-0000-0000-000000000014$$;
-- TD First Class Travel VI (...005) transit -> gas-transit
UPDATE card_multipliers SET category_id = $$30000000-0000-0000-0000-000000000004$$ WHERE id = $$d5110f18-33a2-48e9-a729-323e6bf05ae8$$ AND category_id = $$30000000-0000-0000-0000-000000000014$$;

-- ============================== Travel portal demotions (revert) ==============================
UPDATE card_multipliers SET earn_rate = 4 WHERE id = $$aede16c2-8607-4029-898e-e9e506cbb491$$ AND earn_rate = 1;     -- TD Rewards Visa travel 1 -> 4
UPDATE card_multipliers SET earn_rate = 6 WHERE id = $$5482eaf2-a44b-4365-b8b3-4187a9a73735$$ AND earn_rate = 1.5;   -- TD Platinum Travel travel 1.5 -> 6
UPDATE card_multipliers SET earn_rate = 8 WHERE id = $$87aa710f-0c85-4bfa-b1ac-a8f573757419$$ AND earn_rate = 2;     -- TD First Class travel 2 -> 8
UPDATE card_multipliers SET earn_rate = 2 WHERE id = $$bf3e7151-6379-4cdd-8da2-15073dfe2de5$$ AND earn_rate = 1;     -- CIBC Aventura VI travel 1 -> 2

-- ============================== Aeroplan Air Canada splits (revert) ==============================
-- CIBC Aeroplan VI Privilege (...023)
DELETE FROM card_multipliers WHERE card_id = $$20000000-0000-0000-0000-000000000023$$ AND category_id = $$30000000-0000-0000-0000-000000000011$$ AND effective_from = DATE $$2026-06-01$$;
UPDATE card_multipliers SET earn_rate = 2.00 WHERE id = $$a0e244a5-4420-41a2-a9ea-82efaf3d5b50$$ AND earn_rate = 1.5;
-- CIBC Aeroplan VI (...077): gas -> gas-transit, delete air-canada row, restore travel 1 -> 1.5
UPDATE card_multipliers SET category_id = $$30000000-0000-0000-0000-000000000004$$ WHERE id = $$0b5b61d8-bbd4-47b8-9e48-f73dbb0dd0f2$$ AND category_id = $$30000000-0000-0000-0000-000000000012$$;
DELETE FROM card_multipliers WHERE card_id = $$20000000-0000-0000-0000-000000000077$$ AND category_id = $$30000000-0000-0000-0000-000000000011$$ AND effective_from = DATE $$2026-06-01$$;
UPDATE card_multipliers SET earn_rate = 1.50 WHERE id = $$02a00da2-1af0-4e0c-946b-5ada697700b8$$ AND earn_rate = 1;
-- TD Aeroplan VI Platinum (...063): air-canada -> travel, restore fb 1.0
UPDATE card_multipliers SET category_id = $$30000000-0000-0000-0000-000000000003$$, fallback_earn_rate = 1.0
  WHERE id = $$99f788f7-7857-4eff-a87c-421501850c16$$ AND category_id = $$30000000-0000-0000-0000-000000000011$$;
-- TD Aeroplan VI Privilege (...012)
DELETE FROM card_multipliers WHERE card_id = $$20000000-0000-0000-0000-000000000012$$ AND category_id = $$30000000-0000-0000-0000-000000000011$$ AND effective_from = DATE $$2026-06-01$$;
UPDATE card_multipliers SET earn_rate = 2.00 WHERE id = $$442a6e96-385a-40b8-ab7d-6628c36e34b7$$ AND earn_rate = 1.5;
-- TD Aeroplan VI (...004)
DELETE FROM card_multipliers WHERE card_id = $$20000000-0000-0000-0000-000000000004$$ AND category_id = $$30000000-0000-0000-0000-000000000011$$ AND effective_from = DATE $$2026-06-01$$;
UPDATE card_multipliers SET earn_rate = 1.50 WHERE id = $$7994ee12-7e2f-4e7a-9f43-26542a542ae9$$ AND earn_rate = 1;
-- Amex Aeroplan Business Reserve (...082): delete hotels/car Travel row, repoint air-canada -> travel
DELETE FROM card_multipliers WHERE card_id = $$20000000-0000-0000-0000-000000000082$$ AND category_id = $$30000000-0000-0000-0000-000000000003$$ AND effective_from = DATE $$2026-06-01$$;
UPDATE card_multipliers SET category_id = $$30000000-0000-0000-0000-000000000003$$ WHERE id = $$a09210a4-0959-4974-9f8d-e66c8f1f089a$$ AND category_id = $$30000000-0000-0000-0000-000000000011$$;
-- Amex Aeroplan No Fee (...095): delete dining + air-canada rows
DELETE FROM card_multipliers WHERE card_id = $$20000000-0000-0000-0000-000000000095$$ AND category_id = $$30000000-0000-0000-0000-000000000002$$ AND effective_from = DATE $$2026-06-01$$;
DELETE FROM card_multipliers WHERE card_id = $$20000000-0000-0000-0000-000000000095$$ AND category_id = $$30000000-0000-0000-0000-000000000011$$ AND effective_from = DATE $$2026-06-01$$;
-- Amex Aeroplan Card (...028): delete air-canada row, restore travel 1 -> 2
DELETE FROM card_multipliers WHERE card_id = $$20000000-0000-0000-0000-000000000028$$ AND category_id = $$30000000-0000-0000-0000-000000000011$$ AND effective_from = DATE $$2026-06-01$$;
UPDATE card_multipliers SET earn_rate = 2.00 WHERE id = $$527d0ae4-9556-4986-b0bd-b20a8beca145$$ AND earn_rate = 1;

-- ============================== BMO World Elite Mastercard (...010) (revert) ==============================
UPDATE card_multipliers SET fallback_earn_rate = 2 WHERE id = $$6b7c2e9e-10fe-4de2-ae5e-b81e90e6b86d$$ AND fallback_earn_rate = 1;  -- entertainment fb
UPDATE card_multipliers SET fallback_earn_rate = 2 WHERE id = $$6fe0fc4d-064b-45fa-bb55-cb186316341a$$ AND fallback_earn_rate = 1;  -- dining fb
UPDATE card_multipliers SET earn_rate = 2.00, fallback_earn_rate = 2 WHERE id = $$683315c5-b0c0-4f44-99fe-1038b5f15183$$ AND earn_rate = 1;  -- everything-else
UPDATE card_multipliers SET earn_rate = 3.00, cap_amount = NULL, cap_period = NULL, fallback_earn_rate = 2
  WHERE id = $$e90dacfe-60b0-4206-993a-7dae47d59501$$ AND earn_rate = 5;  -- travel 5x/$15k -> 3x

-- ============================== BMO Air Miles World Elite (...020) precision (revert) ==============================
UPDATE card_multipliers SET earn_rate = 0.08 WHERE id = $$3273232a-0217-427a-a5e2-8141348fd243$$ AND earn_rate = 0.0833;  -- everything-else
UPDATE card_multipliers SET earn_rate = 0.25 WHERE id = $$e02b1f55-7cba-461c-b47e-e694338e5ca2$$ AND earn_rate = 0.0833;  -- entertainment
UPDATE card_multipliers SET earn_rate = 0.25 WHERE id = $$ed7da149-70df-464d-bb36-c9de219fa717$$ AND earn_rate = 0.0833;  -- dining

-- ============================== Network fixes (revert) ==============================
UPDATE cards SET network = $$visa$$ WHERE id = $$20000000-0000-0000-0000-000000000103$$ AND network = $$mastercard$$;
UPDATE cards SET network = $$visa$$ WHERE id = $$20000000-0000-0000-0000-000000000054$$ AND network = $$mastercard$$;
