-- Reverse: restore the prior fabricated rewards + $0 fees on Syncro and CIBC Select.

-- CIBC Select Visa: fee 29 -> 0, base 0% -> 0.5%.
UPDATE cards SET annual_fee = 0.00 WHERE name = 'CIBC Select Visa Card' AND annual_fee = 29.00;
UPDATE card_multipliers SET earn_rate = 0.50, notes = '0.5% everything'
WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Select Visa Card')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND earn_rate = 0.00 AND earn_type = 'cashback_pct';

-- National Bank Syncro: fee 35 -> 0, base 0% -> 0.5%.
UPDATE cards SET annual_fee = 0.00 WHERE name = 'National Bank Syncro Mastercard' AND annual_fee = 35.00;
UPDATE card_multipliers SET earn_rate = 0.50, notes = '0.5% everything else'
WHERE card_id = (SELECT id FROM cards WHERE name = 'National Bank Syncro Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND earn_rate = 0.00 AND earn_type = 'cashback_pct';

-- National Bank Syncro: re-insert the three fabricated bonus categories (exact prior state).
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT (SELECT id FROM cards WHERE name = 'National Bank Syncro Mastercard'), cat.id, 2.00, 'cashback_pct', 1.00, DATE '2026-04-05', v.notes
FROM (VALUES ('groceries','2% groceries'),('gas-transit','2% gas'),('recurring-bills','2% recurring bills')) AS v(slug, notes)
JOIN categories cat ON cat.slug = v.slug
ON CONFLICT (card_id, category_id, effective_from) DO NOTHING;
