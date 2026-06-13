-- Restore the RBC Avion row exactly as seeded by 000006 (AAdvantage ratio/notes
-- under the Aeroplan program id; effective_from defaults to CURRENT_DATE as in
-- the original seed). This only reverts the database to its pre-000096 state.

INSERT INTO transfer_partners (from_program_id, to_program_id, transfer_ratio, minimum_transfer, processing_days, notes)
SELECT '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 0.7000, 5000, 5, 'RBC Avion -> AAdvantage 10:7 (use for oneworld awards)'
WHERE NOT EXISTS (
  SELECT 1 FROM transfer_partners
   WHERE from_program_id = '10000000-0000-0000-0000-000000000003'
     AND to_program_id = '10000000-0000-0000-0000-000000000001'
     AND transfer_ratio = 0.7000
);
