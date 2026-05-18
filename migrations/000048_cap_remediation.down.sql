-- Revert 000048_cap_remediation. No inline BEGIN/COMMIT — golang-migrate
-- wraps the migration in its own transaction (repo convention).

-- Drop the 8 cap groups created by this migration (by fixed id OR name;
-- cap_group_categories cascades via FK ON DELETE CASCADE). The pre-existing
-- Amex Cobalt group ('food_drink_streaming', …-0001) is not matched.
DELETE FROM cap_groups WHERE id IN (
  '40000000-0000-0000-0000-000000048001','40000000-0000-0000-0000-000000048002',
  '40000000-0000-0000-0000-000000048003','40000000-0000-0000-0000-000000048004',
  '40000000-0000-0000-0000-000000048005','40000000-0000-0000-0000-000000048006',
  '40000000-0000-0000-0000-000000048007','40000000-0000-0000-0000-000000048008'
) OR name IN (
  'Scotia Gold Amex $50K Annual Accelerated Cap',
  'Scotia Passport VI $50K Annual Accelerated Cap',
  'Scotia Momentum VI $25K Annual Accelerated Cap',
  'Amex Business Edge $25K Annual 3x Cap',
  'BMO eclipse VIP $25K Annual Dining/Gas Cap',
  'MBNA Smart Cash $500/mo Gas+Grocery Cap',
  'National Bank Syncro $25K Annual Gas+Grocery Cap',
  'National Bank Platinum $1000/mo Bonus Cap'
);

-- Revert per-multiplier caps (Part B) to pre-migration state
-- (cap_amount/cap_period NULL, fallback_earn_rate back to schema default 1.0).
UPDATE card_multipliers SET cap_amount = NULL, cap_period = NULL, fallback_earn_rate = 1.0
 WHERE effective_to IS NULL AND (
   (card_id = (SELECT id FROM cards WHERE name = 'SimplyCash Preferred Card from American Express')
      AND category_id = (SELECT id FROM categories WHERE slug = 'groceries'))
   OR (card_id = (SELECT id FROM cards WHERE name = 'TD First Class Travel Visa Infinite')
      AND category_id IN (SELECT id FROM categories WHERE slug IN ('dining','groceries')))
   OR (card_id = (SELECT id FROM cards WHERE name = 'RBC Cash Back Preferred World Elite Mastercard')
      AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else'))
   OR (card_id = (SELECT id FROM cards WHERE name = 'BMO Cash Back Mastercard')
      AND category_id = (SELECT id FROM categories WHERE slug = 'groceries'))
   OR (card_id = (SELECT id FROM cards WHERE name = 'BMO CashBack World Elite Mastercard')
      AND category_id = (SELECT id FROM categories WHERE slug = 'groceries'))
   OR (card_id = (SELECT id FROM cards WHERE name = 'BMO eclipse Visa Infinite Privilege')
      AND category_id = (SELECT id FROM categories WHERE slug = 'groceries'))
   OR (card_id = (SELECT id FROM cards WHERE name = 'BMO eclipse Visa Infinite')
      AND category_id IN (SELECT id FROM categories WHERE slug IN ('groceries','gas-transit')))
   OR (card_id = (SELECT id FROM cards WHERE name = 'Desjardins Cash Back World Elite Visa')
      AND category_id = (SELECT id FROM categories WHERE slug = 'groceries'))
   OR (card_id = (SELECT id FROM cards WHERE name = 'Desjardins Odyssey Visa Gold')
      AND category_id = (SELECT id FROM categories WHERE slug = 'dining'))
   OR (card_id = (SELECT id FROM cards WHERE name = 'MBNA Rewards World Elite Mastercard')
      AND category_id = (SELECT id FROM categories WHERE slug = 'dining'))
   OR (card_id = (SELECT id FROM cards WHERE name = 'Neo World Elite Mastercard')
      AND category_id IN (SELECT id FROM categories WHERE slug IN ('groceries','streaming-digital','gas-transit')))
 );

-- Revert SHARED-cap member fallback overrides (Part A) to default 1.0.
UPDATE card_multipliers SET fallback_earn_rate = 1.0
 WHERE effective_to IS NULL AND (
   (card_id = (SELECT id FROM cards WHERE name = 'MBNA Smart Cash Platinum Plus Mastercard')
      AND category_id IN (SELECT id FROM categories WHERE slug IN ('gas-transit','groceries')))
   OR (card_id = (SELECT id FROM cards WHERE name = 'National Bank Platinum Mastercard')
      AND category_id = (SELECT id FROM categories WHERE slug = 'dining'))
 );
