-- Reverse: restore the prior 0.5% everything-else rate on the PC Money Account.
UPDATE card_multipliers SET earn_rate = 0.50
WHERE card_id = (SELECT id FROM cards WHERE name = 'PC Money Account')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND earn_type = 'cashback_pct'
  AND earn_rate = 1.00;
