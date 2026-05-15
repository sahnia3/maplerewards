-- Reverse the three data corrections from 000038.

DELETE FROM card_multipliers
 WHERE card_id IN (
   '20000000-0000-0000-0000-000000000080',
   '20000000-0000-0000-0000-000000000081'
 );

DELETE FROM cards
 WHERE id IN (
   '20000000-0000-0000-0000-000000000080',
   '20000000-0000-0000-0000-000000000081'
 );

DELETE FROM loyalty_programs
 WHERE id = '10000000-0000-0000-0000-000000000028';

-- Cobalt caps revert is a no-op — we don't know whether they were truly
-- intended at the per-row level in the original seed. Leaving as null.

UPDATE loyalty_programs
   SET base_cpp = 1.50
 WHERE slug = 'aeroplan' AND base_cpp = 2.00;
