-- Remove the fabricated RBC Avion -> BA Avios and RBC Avion -> Asia Miles
-- transfer_partners rows (revamp 2026-06-12, AU-1). Migration 000002 seeded
-- both as 1:1 (notes "RBC Avion -> BA Avios 1:1" / "RBC Avion -> Asia Miles
-- 1:1"), but RBC Avion is a FIXED-value program (it carries a base_cpp and is
-- redeemed against RBC's own travel schedule); it has no points->airline
-- transfer partners. The only real Avion outbound route is WestJet (100:1),
-- which is KEPT. These two rows let the optimizer/sweet-spot price Avion at
-- BA Avios / Asia Miles award value, inflating every Avion card — a churner
-- disproves it instantly and engine trust collapses.
--
-- Scoped by the exact seed from/to program ids; a re-run is a safe no-op and
-- the legitimate WestJet row (to_program_id …008) is untouched.

DELETE FROM transfer_partners
 WHERE from_program_id = '10000000-0000-0000-0000-000000000003'  -- rbc-avion
   AND to_program_id   = '10000000-0000-0000-0000-000000000009'; -- ba-avios

DELETE FROM transfer_partners
 WHERE from_program_id = '10000000-0000-0000-0000-000000000003'  -- rbc-avion
   AND to_program_id   = '10000000-0000-0000-0000-000000000011'; -- asia-miles
