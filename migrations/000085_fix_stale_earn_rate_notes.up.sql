-- Card-data polish (2026-05-27): fix descriptive `notes` strings that were left stale
-- when an earlier migration corrected the numeric earn_rate but not the embedded-rate
-- text, producing a visible contradiction on the card detail page (e.g. a "2x" badge
-- beside "1.5x dining" note text). The earn_rate values are the verified-correct ones;
-- only the note text lagged. Found via a catalog-wide audit comparing each note's
-- embedded rate against its earn_rate.
--
--   * CIBC Aventura Visa Infinite Privilege — migration 000065 corrected
--     dining/gas-transit/groceries 1.5x -> 2x (verified princeoftravel.com) but left
--     the "1.5x ..." notes.
--   * PC Money Account — migration 000082 corrected everything-else 0.5% -> 1.0% but
--     left the "0.5% everything else" note.

UPDATE card_multipliers SET notes = '2x dining (verified princeoftravel.com 2026-02)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Aventura Visa Infinite Privilege')
  AND category_id = (SELECT id FROM categories WHERE slug = 'dining')
  AND earn_rate = 2.00 AND notes = '1.5x dining';

UPDATE card_multipliers SET notes = '2x gas & transit (verified princeoftravel.com 2026-02)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Aventura Visa Infinite Privilege')
  AND category_id = (SELECT id FROM categories WHERE slug = 'gas-transit')
  AND earn_rate = 2.00 AND notes = '1.5x gas & transit';

UPDATE card_multipliers SET notes = '2x groceries (verified princeoftravel.com 2026-02)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'CIBC Aventura Visa Infinite Privilege')
  AND category_id = (SELECT id FROM categories WHERE slug = 'groceries')
  AND earn_rate = 2.00 AND notes = '1.5x groceries';

UPDATE card_multipliers SET notes = '1% (10 PC Optimum pts/$1) everywhere (pcfinancial.ca 2026-05-27)'
WHERE card_id = (SELECT id FROM cards WHERE name = 'PC Money Account')
  AND category_id = (SELECT id FROM categories WHERE slug = 'everything-else')
  AND earn_rate = 1.00 AND notes = '0.5% everything else';
