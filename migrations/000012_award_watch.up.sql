-- ── Aeroplan availability watcher ───────────────────────────────────────────
-- User registers a saved itinerary; future cron checks Apify/Seats.aero and
-- fires an event when sweet-spot pricing appears. v1: schema + CRUD only.

CREATE TABLE IF NOT EXISTS award_watch (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    origin          TEXT NOT NULL,                         -- IATA, e.g. 'YYZ'
    destination     TEXT NOT NULL,                         -- 'NRT'
    depart_date     DATE NOT NULL,
    flex_days       INT NOT NULL DEFAULT 3,
    cabin           TEXT NOT NULL DEFAULT 'economy',       -- economy|business|first
    max_points      INT,                                   -- threshold to fire alert
    program_slug    TEXT NOT NULL DEFAULT 'aeroplan',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    last_checked_at TIMESTAMPTZ,
    last_min_points INT,                                   -- snapshot of cheapest seen
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_award_watch_user ON award_watch(user_id);
CREATE INDEX IF NOT EXISTS idx_award_watch_active ON award_watch(is_active, last_checked_at);

CREATE TABLE IF NOT EXISTS award_watch_events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    watch_id     UUID NOT NULL REFERENCES award_watch(id) ON DELETE CASCADE,
    event_type   TEXT NOT NULL,                            -- 'price_drop'|'no_availability'|'check_complete'
    points_seen  INT,
    cash_price_cad NUMERIC(10,2),
    snapshot     JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_award_watch_events_watch ON award_watch_events(watch_id, created_at DESC);
