DROP INDEX IF EXISTS idx_award_watch_active;
ALTER TABLE award_watch
    DROP COLUMN IF EXISTS check_failures,
    DROP COLUMN IF EXISTS last_alert_message,
    DROP COLUMN IF EXISTS last_alert_at;
