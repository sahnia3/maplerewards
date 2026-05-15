-- ── Stripe webhook event idempotency ────────────────────────────────────────
-- Stripe will retry webhook deliveries that don't 2xx within their window, so
-- the same event.id can arrive multiple times. We persist the IDs we've
-- successfully processed and reject duplicates to prevent double-grants of Pro
-- (e.g. a checkout.session.completed processed twice would call SetUserPro
-- twice — currently idempotent at the DB layer, but not all event handlers are
-- guaranteed to stay idempotent as we add them).

CREATE TABLE IF NOT EXISTS stripe_events (
    event_id     TEXT PRIMARY KEY,
    event_type   TEXT NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cleanup index — old events can be pruned periodically by a cron job.
CREATE INDEX IF NOT EXISTS idx_stripe_events_processed_at ON stripe_events(processed_at);
