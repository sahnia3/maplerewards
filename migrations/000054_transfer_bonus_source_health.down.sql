DROP INDEX IF EXISTS idx_tbe_source_alive;
ALTER TABLE transfer_bonus_events DROP COLUMN IF EXISTS source_dead_at;
