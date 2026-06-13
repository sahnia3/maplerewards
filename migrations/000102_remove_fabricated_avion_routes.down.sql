-- Restore the two RBC Avion rows exactly as seeded by 000002 (transfer_ratio
-- 1.0, minimum_transfer 5000, processing_days 3, notes as seeded). The rows are
-- factually wrong — RBC Avion is a fixed-value program with no BA Avios / Asia
-- Miles transfer partners — this only reverts the database to its pre-000102
-- state. Guarded so a re-run does not duplicate.

INSERT INTO transfer_partners (from_program_id, to_program_id, transfer_ratio, minimum_transfer, processing_days, notes)
SELECT '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000009', 1.0000, 5000, 3, 'RBC Avion → BA Avios 1:1'
WHERE NOT EXISTS (
  SELECT 1 FROM transfer_partners
   WHERE from_program_id = '10000000-0000-0000-0000-000000000003'
     AND to_program_id = '10000000-0000-0000-0000-000000000009'
);

INSERT INTO transfer_partners (from_program_id, to_program_id, transfer_ratio, minimum_transfer, processing_days, notes)
SELECT '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000011', 1.0000, 5000, 3, 'RBC Avion → Asia Miles 1:1'
WHERE NOT EXISTS (
  SELECT 1 FROM transfer_partners
   WHERE from_program_id = '10000000-0000-0000-0000-000000000003'
     AND to_program_id = '10000000-0000-0000-0000-000000000011'
);
