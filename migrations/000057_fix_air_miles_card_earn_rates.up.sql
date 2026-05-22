-- The two BMO AIR MILES cards modeled their earn rates as if Miles accrued at
-- point-like speed (1–3 "miles" per $1). In reality AIR MILES accrue ~12–25×
-- slower per dollar: BMO AIR MILES World Elite earns 1 Mile per $12 (~0.083/$),
-- BMO AIR MILES Mastercard (no fee) earns 1 Mile per $25 (~0.04/$).
--
-- This was masked while loyalty_programs.base_cpp for air-miles was the (wrong)
-- 0.15¢: inflated earn × tiny CPP ≈ a plausible card value. Migration 000056
-- corrected the CPP to the real 10.5¢ cash floor, which un-masked the inflated
-- earn rates — the optimizer/portfolio then valued BMO AMWE at ~$3,471/yr
-- (≈10% blended return, impossible for an AIR MILES card).
--
-- Fix: scale the earn rates to BMO's real published accrual. World Elite keeps
-- its category structure scaled ÷12 to the 1-Mile-per-$12 base (bonus tiers
-- become reasonable 2–3× rates); the no-fee card drops to its 1-Mile-per-$25
-- base. Each UPDATE is guarded on the current value so it is idempotent.

-- BMO AIR MILES World Elite Mastercard — base 1 Mile / $12
UPDATE card_multipliers SET earn_rate = 0.08
 WHERE earn_rate = 1.00
   AND card_id = (SELECT id FROM cards WHERE name = 'BMO Air Miles World Elite Mastercard')
   AND category_id = (SELECT id FROM categories WHERE name = 'Everything Else');
UPDATE card_multipliers SET earn_rate = 0.17
 WHERE earn_rate = 2.00
   AND card_id = (SELECT id FROM cards WHERE name = 'BMO Air Miles World Elite Mastercard')
   AND category_id = (SELECT id FROM categories WHERE name = 'Groceries');
UPDATE card_multipliers SET earn_rate = 0.25
 WHERE earn_rate = 3.00
   AND card_id = (SELECT id FROM cards WHERE name = 'BMO Air Miles World Elite Mastercard')
   AND category_id = (SELECT id FROM categories WHERE name = 'Dining');
UPDATE card_multipliers SET earn_rate = 0.25
 WHERE earn_rate = 3.00
   AND card_id = (SELECT id FROM cards WHERE name = 'BMO Air Miles World Elite Mastercard')
   AND category_id = (SELECT id FROM categories WHERE name = 'Entertainment');

-- BMO AIR MILES Mastercard (no fee) — base 1 Mile / $25
UPDATE card_multipliers SET earn_rate = 0.04
 WHERE earn_rate = 1.00
   AND card_id = (SELECT id FROM cards WHERE name = 'BMO Air Miles Mastercard')
   AND category_id = (SELECT id FROM categories WHERE name = 'Everything Else');
