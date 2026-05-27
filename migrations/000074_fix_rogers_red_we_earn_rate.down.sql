-- Reverse batch 15: restore the (incorrect) 3% USD-as-travel row on Rogers Red WE.
INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT c.id, cat.id, 3.00, 'cashback_pct', 1.50, '2026-04-05', '3% on USD purchases (travel/foreign)'
FROM cards c, categories cat
WHERE c.name = 'Rogers Red World Elite Mastercard' AND cat.slug = 'travel'
  AND NOT EXISTS (SELECT 1 FROM card_multipliers m WHERE m.card_id=c.id AND m.category_id=cat.id AND m.effective_to IS NULL);
