-- ── Web Push subscriptions ──────────────────────────────────────────────────
-- Each row represents one (user, browser-instance) pair that has opted in to
-- push notifications. A user can have multiple subscriptions (laptop +
-- phone) which all receive the same fan-out from the worker. We key by
-- endpoint (Mozilla/Google/Apple URL the browser hands us) because the same
-- user re-subscribing in the same browser produces the same endpoint —
-- INSERT ... ON CONFLICT lets the upsert path stay idempotent.

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint     TEXT NOT NULL,                     -- browser-provided push URL
    p256dh       TEXT NOT NULL,                     -- public key (base64url)
    auth         TEXT NOT NULL,                     -- shared secret (base64url)
    user_agent   TEXT,                              -- optional, helps debugging
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,                       -- stamped on successful send
    UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
    ON push_subscriptions(user_id);
