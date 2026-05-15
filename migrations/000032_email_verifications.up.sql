-- ── Email verification tokens ───────────────────────────────────────────────
-- One-time tokens issued at signup (and on demand) so the user proves they
-- control the email address they signed up with. Used to gate Pro upgrade
-- (verified email is a prerequisite for billing) and to enable password-
-- reset flows later. Token is the hex string we email; the row stores its
-- bcrypt hash so a DB leak doesn't expose live tokens.

CREATE TABLE IF NOT EXISTS email_verifications (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   TEXT NOT NULL,
    expires_at   TIMESTAMPTZ NOT NULL,
    consumed_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_user      ON email_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verifications_expires   ON email_verifications(expires_at);

-- Users gain an `email_verified_at` column; NULL means not yet verified.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
