-- Reverse: remap RBC Rewards+ back to rbc-avion, then remove the rbc-rewards
-- program (no card references it after the remap, so the delete is safe).
UPDATE cards SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = 'rbc-avion')
WHERE name = 'RBC Rewards+ Visa'
  AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = 'rbc-rewards');

DELETE FROM loyalty_programs WHERE slug = 'rbc-rewards';
