-- Reverse 000060: remove the dining multiplier added for the consumer
-- American Express Aeroplan Card.
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'American Express Aeroplan Card')
  AND category_id = (SELECT id FROM categories WHERE slug = 'dining')
  AND earn_rate = 1.50;
