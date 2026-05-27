-- Reverse batch 8: BMO eclipse VIP gas 5%->4% (no cap), dining 5%->3% (no cap),
-- remove the added travel + drugstore rows.
UPDATE card_multipliers SET earn_rate = 4.00, cap_amount = NULL, cap_period = NULL, notes = '4% transit, 3% gas'
WHERE card_id = (SELECT id FROM cards WHERE name = 'BMO eclipse Visa Infinite Privilege')
  AND category_id = (SELECT id FROM categories WHERE slug = 'gas-transit') AND earn_rate = 5.00;

UPDATE card_multipliers SET earn_rate = 3.00, cap_amount = NULL, cap_period = NULL, notes = '3% dining'
WHERE card_id = (SELECT id FROM cards WHERE name = 'BMO eclipse Visa Infinite Privilege')
  AND category_id = (SELECT id FROM categories WHERE slug = 'dining') AND earn_rate = 5.00;

DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'BMO eclipse Visa Infinite Privilege')
  AND category_id IN (SELECT id FROM categories WHERE slug IN ('travel', 'pharmacy')) AND earn_rate = 5.00;
