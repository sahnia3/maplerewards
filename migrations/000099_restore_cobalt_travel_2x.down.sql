-- Revert Amex Cobalt travel earn_rate to the post-000088 value (2.00 → 1.00).
-- Guarded so it only reverts the exact value this migration set.

UPDATE card_multipliers
   SET earn_rate = 1.00
 WHERE card_id = (SELECT id FROM cards WHERE name = 'Amex Cobalt')
   AND category_id = (SELECT id FROM categories WHERE slug = 'travel')
   AND earn_rate = 2.00;
