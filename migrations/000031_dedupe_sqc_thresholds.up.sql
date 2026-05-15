-- ── Dedupe aeroplan_status_thresholds + add missing uniqueness ──────────────
-- Migration 000030's defensive `INSERT … ON CONFLICT DO NOTHING` did nothing
-- because no unique constraint existed on (status_level, effective_year) —
-- ON CONFLICT only catches the PK on `id`, which is gen_random_uuid() and
-- never collides. Result: every apply of 30 inserts a duplicate Super Elite
-- row. This migration removes the duplicates and installs the constraint
-- that should have shipped in 000001, so future inserts are properly
-- idempotent.

DELETE FROM aeroplan_status_thresholds a
 USING aeroplan_status_thresholds b
 WHERE a.ctid < b.ctid
   AND a.status_level = b.status_level
   AND a.effective_year = b.effective_year;

CREATE UNIQUE INDEX IF NOT EXISTS idx_aeroplan_status_thresholds_unique
    ON aeroplan_status_thresholds(status_level, effective_year);
