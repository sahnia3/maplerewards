-- Value-model fix (2026-05-27 sweep). RBC Rewards+ Visa earns base RBC Rewards
-- points (~0.5¢/pt via the RBC Rewards catalog), NOT the premium Avion currency
-- (1.1¢) it was mapped to — so the optimizer over-valued it ~2x (same class as
-- the BMO eclipse cashback bug fixed in 000068). RBC Rewards and RBC Avion are
-- distinct currencies; the Avion-family cards (Avion VI/VIP/Platinum, ION+)
-- correctly remain on rbc-avion. Create an rbc-rewards program (0.5¢) and remap
-- only RBC Rewards+ to it. The optimizer/wallet read the program's base_cpp, so
-- no separate valuation row is needed.
--   src: rbcroyalbank.com — RBC Rewards redemptions ~0.5¢/pt (verified 2026-05-27)

INSERT INTO loyalty_programs (id, name, slug, currency_name, program_type, base_cpp, country, is_active, updated_at)
SELECT '10000000-0000-0000-0000-000000000029', 'RBC Rewards', 'rbc-rewards', 'RBC Rewards Points', 'bank', 0.50, 'CA', true, now()
WHERE NOT EXISTS (SELECT 1 FROM loyalty_programs WHERE slug = 'rbc-rewards');

UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = 'rbc-rewards')
WHERE name = 'RBC Rewards+ Visa'
  AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = 'rbc-avion');
