-- Persisted per-user devaluation-alert subscriptions. When a user toggles "Set
-- devaluation alert" for a program in the Knowledge devaluation tracker, one row
-- is upserted here; clearing the toggle deletes it. UNIQUE(user_id, program_slug)
-- makes the toggle idempotent. program_slug (not program_id) so the subscription
-- survives a program-id churn, matching the user_cpp design.
CREATE TABLE IF NOT EXISTS devaluation_alerts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    program_slug TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, program_slug)
);

-- Read on every projection/list request to flag alert_enabled per program.
CREATE INDEX IF NOT EXISTS idx_devaluation_alerts_user ON devaluation_alerts (user_id);
