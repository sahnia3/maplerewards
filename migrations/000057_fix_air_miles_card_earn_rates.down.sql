-- Revert the BMO AIR MILES card earn-rate corrections to their prior values.
UPDATE card_multipliers SET earn_rate = 1.00
 WHERE earn_rate = 0.08
   AND card_id = (SELECT id FROM cards WHERE name = 'BMO Air Miles World Elite Mastercard')
   AND category_id = (SELECT id FROM categories WHERE name = 'Everything Else');
UPDATE card_multipliers SET earn_rate = 2.00
 WHERE earn_rate = 0.17
   AND card_id = (SELECT id FROM cards WHERE name = 'BMO Air Miles World Elite Mastercard')
   AND category_id = (SELECT id FROM categories WHERE name = 'Groceries');
UPDATE card_multipliers SET earn_rate = 3.00
 WHERE earn_rate = 0.25
   AND card_id = (SELECT id FROM cards WHERE name = 'BMO Air Miles World Elite Mastercard')
   AND category_id = (SELECT id FROM categories WHERE name = 'Dining');
UPDATE card_multipliers SET earn_rate = 3.00
 WHERE earn_rate = 0.25
   AND card_id = (SELECT id FROM cards WHERE name = 'BMO Air Miles World Elite Mastercard')
   AND category_id = (SELECT id FROM categories WHERE name = 'Entertainment');
UPDATE card_multipliers SET earn_rate = 1.00
 WHERE earn_rate = 0.04
   AND card_id = (SELECT id FROM cards WHERE name = 'BMO Air Miles Mastercard')
   AND category_id = (SELECT id FROM categories WHERE name = 'Everything Else');
