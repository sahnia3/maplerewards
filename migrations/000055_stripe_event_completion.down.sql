DROP INDEX IF EXISTS idx_stripe_events_completed_at;
ALTER TABLE stripe_events DROP COLUMN IF EXISTS completed_at;
