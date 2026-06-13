-- Restore the Scene+ → Aeroplan transfer row exactly as seeded by 000007.
-- (The row is factually wrong — Scene+ has no airline transfer partners — this
-- only reverts the database to its pre-000095 state.)

INSERT INTO transfer_partners (from_program_id, to_program_id, transfer_ratio, minimum_transfer, transfer_increment, processing_days, is_active, effective_from, notes)
SELECT '10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 1.0, 1000, 1000, 5, true, '2026-03-09', 'Scene+ → Aeroplan 1:1'
WHERE NOT EXISTS (
  SELECT 1 FROM transfer_partners
   WHERE from_program_id = '10000000-0000-0000-0000-000000000004'
     AND to_program_id = '10000000-0000-0000-0000-000000000001'
);
