-- Reverse: restore the prior terse note strings on the Odyssey Gold dining and
-- everything-else multipliers.
UPDATE card_multipliers SET notes = '1.5x everything else'
WHERE card_id = (SELECT id FROM cards WHERE name = 'Desjardins Odyssey Visa Gold')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND notes = '0.65% all other purchases (desjardins.com 2026-05-27)';

UPDATE card_multipliers SET notes = '2x dining'
WHERE card_id = (SELECT id FROM cards WHERE name = 'Desjardins Odyssey Visa Gold')
  AND category_id = (SELECT id FROM categories WHERE slug = 'dining')
  AND notes = '2% restaurants; $6k/yr pool shared with pre-authorized, then 0.65% (desjardins.com 2026-05-27)';
