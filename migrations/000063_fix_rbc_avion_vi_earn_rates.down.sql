-- Reverse batch 4: remove the travel 1.25x row; restore the four 2026-05-15
-- category rows (the pre-correction reseed state).
DELETE FROM card_multipliers
WHERE card_id = (SELECT id FROM cards WHERE name = 'RBC Avion Visa Infinite')
  AND category_id = (SELECT id FROM categories WHERE slug = 'travel') AND earn_rate = 1.25;

INSERT INTO card_multipliers (card_id, category_id, earn_rate, earn_type, fallback_earn_rate, effective_from, notes)
SELECT (SELECT id FROM cards WHERE name = 'RBC Avion Visa Infinite'), c.id, 1.25, 'points', 1.00, '2026-05-15', v.note
FROM (VALUES
    ('dining', '1.25x Avion points on dining'),
    ('gas-transit', '1.25x Avion points on gas & transit'),
    ('streaming-digital', '1.25x Avion points on streaming'),
    ('groceries', '1.25x Avion points on groceries')
) AS v(slug, note)
JOIN categories c ON c.slug = v.slug
WHERE NOT EXISTS (
    SELECT 1 FROM card_multipliers m
    WHERE m.card_id = (SELECT id FROM cards WHERE name = 'RBC Avion Visa Infinite')
      AND m.category_id = c.id);
