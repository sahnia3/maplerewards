-- Remove the fabricated Scene+ → Aeroplan transfer partner (QA 2026-06-12, P1-5).
-- Scene+ is a FIXED-value program (1.0¢/pt; see 000093) with no airline transfer
-- partners — Scotiabank/Scene+ has never offered an Aeroplan conversion. The row
-- was seeded by 000007 ("Scotiabank partnership") and let the optimizer price
-- Scene+ points at Aeroplan's 1.5¢ sweet-spot, inflating every Scotiabank/Scene+
-- card's valuation by ~50% ("Best via Aeroplan (1:1 transfer, 1.50¢/pt)").
-- Guarded by program ids (fixed seed literals), so a re-run is a safe no-op.

DELETE FROM transfer_partners
 WHERE from_program_id = '10000000-0000-0000-0000-000000000004' -- scene-plus
   AND to_program_id = '10000000-0000-0000-0000-000000000001';  -- aeroplan
