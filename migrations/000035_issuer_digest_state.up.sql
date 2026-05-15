-- ── Per-user issuer-digest state ────────────────────────────────────────────
-- Tracks when each Pro user last received the weekly issuer-change digest so
-- the worker doesn't re-send the same diffs every tick. Null = never sent;
-- worker will pick up new Pro users on the next sweep and send them the
-- backfill (capped at 14 days of changes inside the service to avoid a flood
-- on first send).
--
-- One column instead of a join table because send-state is 1:1 with user and
-- we never need history beyond the most recent timestamp.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_issuer_digest_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_pro_digest_due
    ON users(last_issuer_digest_at NULLS FIRST)
    WHERE is_pro = true AND deleted_at IS NULL;
