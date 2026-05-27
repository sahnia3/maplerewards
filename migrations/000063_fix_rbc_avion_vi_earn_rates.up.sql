-- Card-data correction batch 4 (2026-05-27; follows 000059-000062).
-- RBC Avion Visa Infinite: a 2026-05-15 reseed wrongly added 1.25x on dining,
-- gas/transit, streaming, and groceries (a copy-paste from RBC ION+, which does
-- have those categories). RBC's own card page AND Prince of Travel both state
-- the Avion VI earns ONLY 1.25x on travel and 1x on everything else. Replace the
-- four bogus category rows with a single 1.25x travel multiplier.
--   src: rbcroyalbank.com/credit-cards/travel/rbc-avion-visa-infinite.html (verified 2026-05-27)
--   src: princeoftravel.com/credit-cards/rbc-avion-visa-infinite/

DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'RBC Avion Visa Infinite')
  AND category_id IN (SELECT id FROM categories WHERE slug IN ('dining', 'gas-transit', 'streaming-digital', 'groceries'))
  AND earn_rate = 1.25;

INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT (SELECT id FROM cards WHERE name = 'RBC Avion Visa Infinite'),
       (SELECT id FROM categories WHERE slug = 'travel'),
       1.25, 'points', 1.00, CURRENT_DATE, '1.25x on travel; 1x all else (verified rbcroyalbank.com 2026-05-27)'
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers
  WHERE card_id = (SELECT id FROM cards WHERE name = 'RBC Avion Visa Infinite')
    AND category_id = (SELECT id FROM categories WHERE slug = 'travel'));
