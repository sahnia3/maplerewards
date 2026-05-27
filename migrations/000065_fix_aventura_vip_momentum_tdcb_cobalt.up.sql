-- Card-data correction batch 6 (2026-05-27; follows 000059-000064).
-- Includes a SELF-CORRECTION: migration 000061 wrongly removed Amex Cobalt's 2x
-- travel. Cobalt's "Travel & Transit" 2x category includes flights/hotels (Amex
-- terms; Prince of Travel's earn-table lists "Transit, Rideshare, Gas & Travel").
-- The earlier prose I relied on described only the transit half. Restore it.

-- Amex Cobalt: restore 2x travel (part of the 2x Travel & Transit category).
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT (SELECT id FROM cards WHERE name = 'Amex Cobalt'), (SELECT id FROM categories WHERE slug = 'travel'),
       2.00, 'points', 1.00, CURRENT_DATE, '2x travel & transit (Amex Cobalt 2x category includes travel; verified princeoftravel.com 2026-02)'
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers WHERE card_id = (SELECT id FROM cards WHERE name = 'Amex Cobalt') AND category_id = (SELECT id FROM categories WHERE slug = 'travel'));

-- CIBC Aventura VIP: 3x travel, 2x gas/transit/dining/entertainment/groceries, 1.25x else.
--   src: princeoftravel.com/credit-cards/cibc-aventura-visa-infinite-privilege-card
UPDATE card_multipliers SET earn_rate = 3.00, notes = '3x travel via CIBC Rewards Centre (verified princeoftravel.com 2026-02)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Aventura Visa Infinite Privilege')
  AND category_id = (SELECT id FROM categories WHERE slug = 'travel') AND earn_rate = 2.00;

UPDATE card_multipliers SET earn_rate = 2.00
WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Aventura Visa Infinite Privilege')
  AND category_id IN (SELECT id FROM categories WHERE slug IN ('groceries', 'dining', 'gas-transit')) AND earn_rate = 1.50;

INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT (SELECT id FROM cards WHERE name = 'CIBC Aventura Visa Infinite Privilege'), (SELECT id FROM categories WHERE slug = 'entertainment'),
       2.00, 'points', 1.25, CURRENT_DATE, '2x entertainment (verified princeoftravel.com 2026-02)'
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Aventura Visa Infinite Privilege') AND category_id = (SELECT id FROM categories WHERE slug = 'entertainment'));

-- TD Cash Back VI: add the missing 3% recurring-bills tier ($15k/yr shared cap).
--   src: princeoftravel.com/credit-cards/td-cash-back-visa-infinite-card
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, cap_amount, cap_period, fallback_earn_rate, effective_from, notes)
SELECT (SELECT id FROM cards WHERE name = 'TD Cash Back Visa Infinite'), (SELECT id FROM categories WHERE slug = 'recurring-bills'),
       3.00, 'cashback_pct', 15000.00, 'annual', 1.00, CURRENT_DATE, '3% recurring bills up to $15k/yr (verified princeoftravel.com 2026-02)'
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers WHERE card_id = (SELECT id FROM cards WHERE name = 'TD Cash Back Visa Infinite') AND category_id = (SELECT id FROM categories WHERE slug = 'recurring-bills'));

-- Scotia Momentum VI: 4% recurring+grocery, 2% gas+transit, 1% else. NO dining
-- bonus (remove it); add the 4% recurring-bills tier (streaming row already 4%).
--   src: princeoftravel.com/credit-cards/scotiabank-momentum-visa-infinite-card
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'Scotia Momentum Visa Infinite')
  AND category_id = (SELECT id FROM categories WHERE slug = 'dining') AND earn_rate = 2.00;

INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, cap_amount, cap_period, fallback_earn_rate, effective_from, notes)
SELECT (SELECT id FROM cards WHERE name = 'Scotia Momentum Visa Infinite'), (SELECT id FROM categories WHERE slug = 'recurring-bills'),
       4.00, 'cashback_pct', 25000.00, 'annual', 1.00, CURRENT_DATE, '4% recurring payments up to $25k/yr (verified princeoftravel.com 2026-02)'
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers WHERE card_id = (SELECT id FROM cards WHERE name = 'Scotia Momentum Visa Infinite') AND category_id = (SELECT id FROM categories WHERE slug = 'recurring-bills'));
