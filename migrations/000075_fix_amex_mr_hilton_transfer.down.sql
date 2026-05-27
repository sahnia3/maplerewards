-- Reverse: re-add the (incorrect) 1:2 Amex MR CA -> Hilton Honors row, exactly
-- as seeded (same id + effective_from, so it round-trips and doesn't collide
-- with the 1:1 row at effective 2026-04-05).
INSERT INTO transfer_partners (id, from_program_id, to_program_id, transfer_ratio, minimum_transfer, transfer_increment, processing_days, is_active, effective_from, notes)
SELECT '991cd914-087e-422c-bd05-f0ccf9d92b7b',
       (SELECT id FROM loyalty_programs WHERE slug = 'amex-mr-ca'),
       (SELECT id FROM loyalty_programs WHERE slug = 'hilton-honors'),
       2.0000, 1000, 1000, 2, true, '2026-03-09', 'Amex MR → Hilton 1:2'
WHERE NOT EXISTS (SELECT 1 FROM transfer_partners WHERE id = '991cd914-087e-422c-bd05-f0ccf9d92b7b');
