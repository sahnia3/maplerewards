-- Reverse batch 7.

-- BMO CashBack WE: remove recurring-bills; re-add the streaming 2% row.
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'BMO CashBack World Elite Mastercard')
  AND category_id = (SELECT id FROM categories WHERE slug = 'recurring-bills') AND earn_rate = 2.00;
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, cap_amount, cap_period, fallback_earn_rate, effective_from, notes)
SELECT (SELECT id FROM cards WHERE name = 'BMO CashBack World Elite Mastercard'), (SELECT id FROM categories WHERE slug = 'streaming-digital'),
       2.00, 'cashback_pct', 500.00, 'monthly', 1.00, '2026-04-05', '2% recurring bills up to $500/mo'
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers WHERE card_id = (SELECT id FROM cards WHERE name = 'BMO CashBack World Elite Mastercard') AND category_id = (SELECT id FROM categories WHERE slug = 'streaming-digital'));

-- CIBC Aventura Gold: re-add 2x dining; remove the added gas/pharmacy/groceries.
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT (SELECT id FROM cards WHERE name = 'CIBC Aventura Gold Visa'), (SELECT id FROM categories WHERE slug = 'dining'),
       2.00, 'points', 1.00, '2026-04-05', '2x dining'
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Aventura Gold Visa') AND category_id = (SELECT id FROM categories WHERE slug = 'dining'));
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Aventura Gold Visa')
  AND category_id IN (SELECT id FROM categories WHERE slug IN ('gas-transit', 'pharmacy', 'groceries')) AND earn_rate = 1.50;

-- CIBC Dividend Platinum: gas/grocery 3% -> 2%.
UPDATE card_multipliers SET earn_rate = 2.00, notes = '2% groceries'
WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Dividend Platinum Visa')
  AND category_id = (SELECT id FROM categories WHERE slug = 'groceries') AND earn_rate = 3.00;
UPDATE card_multipliers SET earn_rate = 2.00, notes = '2% gas'
WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Dividend Platinum Visa')
  AND category_id = (SELECT id FROM categories WHERE slug = 'gas-transit') AND earn_rate = 3.00;

-- RBC Avion VIP: re-add 1.5x travel and 1.5x dining.
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT (SELECT id FROM cards WHERE name = 'RBC Avion Visa Infinite Privilege'), c.id, 1.50, 'points', 1.25, '2026-04-05', v.note
FROM (VALUES ('travel', '1.5x travel purchases'), ('dining', '1.5x dining')) AS v(slug, note)
JOIN categories c ON c.slug = v.slug
WHERE NOT EXISTS (SELECT 1 FROM card_multipliers m WHERE m.card_id = (SELECT id FROM cards WHERE name = 'RBC Avion Visa Infinite Privilege') AND m.category_id = c.id);
