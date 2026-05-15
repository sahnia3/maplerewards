-- ── Aeroplan 2026 SQC tier correction ───────────────────────────────────────
-- Migration 000002 seeded `aeroplan_status_thresholds` with Super Elite at
-- 100,000 SQC and $12,000 minimum revenue. Air Canada published the final
-- 2026 numbers after that seed shipped: Super Elite is now 125,000 SQC with
-- a $20,000 CAD minimum revenue requirement, and the 50K/75K minimums were
-- restated. The canonical user-facing copy in frontend/components/term.tsx
-- ("25K/35K/50K/75K/125K") and the SQC tile both expect the new numbers, so
-- this migration aligns the data layer with the published program rules.
--
-- The `sqc_required` column already exists (added in migration 000001), so we
-- only update existing rows; nothing schema-level changes here.

UPDATE aeroplan_status_thresholds
   SET sqc_required = 125000, min_revenue_cad = 20000.00
 WHERE status_level = 'Super Elite' AND effective_year = 2026;

UPDATE aeroplan_status_thresholds
   SET min_revenue_cad = 4000.00
 WHERE status_level = '50K' AND effective_year = 2026;

UPDATE aeroplan_status_thresholds
   SET min_revenue_cad = 6000.00
 WHERE status_level = '75K' AND effective_year = 2026;

-- Backfill in case Super Elite row never seeded (defensive — INSERT … ON
-- CONFLICT covers a fresh DB where someone deleted the seed row).
INSERT INTO aeroplan_status_thresholds (status_level, sqc_required, min_revenue_cad, effective_year)
VALUES ('Super Elite', 125000, 20000.00, 2026)
ON CONFLICT DO NOTHING;
