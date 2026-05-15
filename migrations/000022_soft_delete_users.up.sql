-- ── Soft-delete users for PIPEDA + 30-day recovery window ───────────────────
-- The previous hard-delete cascade gave the user no recovery window and left
-- no audit trail of deletion requests, both required for Canadian privacy
-- compliance. Switch to a soft-delete pattern: mark `deleted_at`, scramble
-- the email to free the address for re-registration, log the request to
-- `user_deletions_log`. A cron job can hard-delete rows older than 30 days
-- once the recovery window has passed.

ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NOT NULL;

-- Lookups need to filter soft-deleted users. The simpler approach is to
-- update queries to add `WHERE deleted_at IS NULL` everywhere, which we do
-- in repo/auth.go.

CREATE TABLE IF NOT EXISTS user_deletions_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,        -- not FK so log survives hard delete
    email_at_delete TEXT,                 -- anonymized; for support audits
    requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    requested_by    TEXT NOT NULL DEFAULT 'user', -- user | admin | gdpr_request
    note            TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_deletions_log_user
    ON user_deletions_log(user_id, requested_at DESC);
