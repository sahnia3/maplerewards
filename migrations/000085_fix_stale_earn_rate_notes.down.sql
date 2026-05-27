-- Reverse: restore the prior stale note strings.
UPDATE card_multipliers SET notes = '1.5x dining'
WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Aventura Visa Infinite Privilege')
  AND category_id = (SELECT id FROM categories WHERE slug = 'dining')
  AND earn_rate = 2.00 AND notes = '2x dining (verified princeoftravel.com 2026-02)';

UPDATE card_multipliers SET notes = '1.5x gas & transit'
WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Aventura Visa Infinite Privilege')
  AND category_id = (SELECT id FROM categories WHERE slug = 'gas-transit')
  AND earn_rate = 2.00 AND notes = '2x gas & transit (verified princeoftravel.com 2026-02)';

UPDATE card_multipliers SET notes = '1.5x groceries'
WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Aventura Visa Infinite Privilege')
  AND category_id = (SELECT id FROM categories WHERE slug = 'groceries')
  AND earn_rate = 2.00 AND notes = '2x groceries (verified princeoftravel.com 2026-02)';

UPDATE card_multipliers SET notes = '0.5% everything else'
WHERE card_id = (SELECT id FROM cards WHERE name = 'PC Money Account')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND earn_rate = 1.00 AND notes = '1% (10 PC Optimum pts/$1) everywhere (pcfinancial.ca 2026-05-27)';
