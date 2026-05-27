-- Card-data polish (2026-05-27): migration 000083 corrected the Desjardins Odyssey Gold
-- everything-else rate (1.5% -> 0.65%) but left the row's descriptive `notes` text as
-- "1.5x everything else", which now contradicts the displayed 0.65x badge on the card
-- detail page. Replace it with an accurate, cited note, and bring the terse dining note
-- into the same cited style. src: desjardins.com/en/credit-cards/odyssey-gold-visa.html.

UPDATE card_multipliers SET notes = '0.65% all other purchases (desjardins.com 2026-05-27)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'Desjardins Odyssey Visa Gold')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND notes = '1.5x everything else';

UPDATE card_multipliers SET notes = '2% restaurants; $6k/yr pool shared with pre-authorized, then 0.65% (desjardins.com 2026-05-27)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'Desjardins Odyssey Visa Gold')
  AND category_id = (SELECT id FROM categories WHERE slug = 'dining')
  AND notes = '2x dining';
