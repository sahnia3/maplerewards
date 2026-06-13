-- Pre-launch waitlist with referral tracking.
-- email is stored lowercased (normalized in the service layer); referral_code
-- is an 8-char random hex handle shared via https://maplerewards.app/?ref=CODE.
-- referred_by holds the referral_code of the signup that referred this one —
-- intentionally NOT a foreign key so deleting a signup never breaks the chain.
CREATE TABLE IF NOT EXISTS waitlist_signups (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    referral_code TEXT NOT NULL UNIQUE,
    referred_by   TEXT,
    source        TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Referral counts are read on every signup response.
CREATE INDEX IF NOT EXISTS idx_waitlist_signups_referred_by
    ON waitlist_signups (referred_by) WHERE referred_by IS NOT NULL;
