-- Revert TD Cash Back Visa Card (...062) loyalty reassignment back to td-rewards.
-- Prior value pinned so it only reverts the exact change 000094 made.

UPDATE cards
   SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$td-rewards$$)
 WHERE id = $$20000000-0000-0000-0000-000000000062$$
   AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$td-cash-back$$);
