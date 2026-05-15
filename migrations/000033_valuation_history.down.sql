-- Reverse migration 000033.

DROP INDEX IF EXISTS idx_point_valuation_history_lookup;
DROP TABLE IF EXISTS point_valuation_history;

ALTER TABLE point_valuations DROP COLUMN IF EXISTS recorded_at;
