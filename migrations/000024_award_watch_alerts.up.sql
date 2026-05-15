-- ── Award-watch alert columns ───────────────────────────────────────────────
-- The cron worker (cmd/worker) polls every active watch on a fixed interval,
-- updating last_checked_at + last_min_points. When the new min_points beats
-- the user's max_points threshold (or improves materially over the prior
-- check), it stamps last_alert_at + last_alert_message so the UI can surface
-- the alert. A real push/email notification path can layer on later — this is
-- the minimum needed to make the watcher feature feel alive.

ALTER TABLE award_watch
    ADD COLUMN IF NOT EXISTS last_alert_at      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_alert_message TEXT,
    ADD COLUMN IF NOT EXISTS check_failures     INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_award_watch_active
    ON award_watch(is_active, last_checked_at NULLS FIRST)
    WHERE is_active = true;
