-- ── Loyalty-account aggregation + expiry tracker ────────────────────────────
-- Card-tied balances live on user_cards already. This table covers the OTHER
-- programs Canadians hold without a co-branded card (Marriott Bonvoy, Hilton
-- Honors, Hyatt, AwardWallet-style). Each row is one program one user; the
-- service surfaces upcoming expiries via the cron worker so users don't lose
-- balances to inactivity sweeps (Aeroplan = 18 months, Hilton = 12, etc.).

CREATE TABLE IF NOT EXISTS loyalty_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    program_slug    TEXT NOT NULL,
    account_label   TEXT,                          -- "main", "wife's", etc.
    balance         BIGINT NOT NULL DEFAULT 0,
    expires_at      DATE,                          -- user override OR computed
    last_activity   DATE,                          -- for inactivity-based expiry
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per (user, program, label). account_label is nullable, so the
-- uniqueness key must coalesce it — and a UNIQUE constraint cannot carry an
-- expression, so this is a UNIQUE INDEX (the form already deployed). The prior
-- inline `UNIQUE (..., COALESCE(account_label,''))` was invalid SQL and broke a
-- from-scratch migration of a fresh database.
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_accounts_unique
    ON loyalty_accounts (user_id, program_slug, COALESCE(account_label, ''));

CREATE INDEX IF NOT EXISTS idx_loyalty_accounts_user
    ON loyalty_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_accounts_expiring
    ON loyalty_accounts(expires_at)
    WHERE expires_at IS NOT NULL;

-- Per-program expiry rules — "this program expires N months after the last
-- earn or redemption activity". Used by the service to derive expires_at
-- when the user supplies last_activity but not an explicit date.
CREATE TABLE IF NOT EXISTS loyalty_expiry_rules (
    program_slug          TEXT PRIMARY KEY,
    inactivity_months     INT,             -- NULL means "never expires from inactivity"
    fixed_months_from_earn INT,            -- some programs expire N months after earning
    notes                 TEXT
);

INSERT INTO loyalty_expiry_rules (program_slug, inactivity_months, notes) VALUES
    ('aeroplan',         18, 'Air Canada Aeroplan: points expire after 18 months of no qualifying activity. Holding any Aeroplan-branded card pauses inactivity.'),
    ('amex-mr-ca',       NULL, 'Amex MR Canada points do not expire while account is open and in good standing.'),
    ('hilton-honors',    12, 'Hilton Honors expires after 12 months of inactivity.'),
    ('marriott-bonvoy',  24, 'Marriott Bonvoy expires after 24 months of inactivity.'),
    ('world-of-hyatt',   24, 'World of Hyatt expires after 24 months of inactivity.'),
    ('rbc-avion',        NULL, 'RBC Avion points do not expire while card is active.'),
    ('cibc-aventura',    NULL, 'CIBC Aventura points do not expire while card is open.'),
    ('scene-plus',       12, 'Scene+ points expire after 12 months of inactivity.'),
    ('air-miles',        NULL, 'Air Miles do not expire if card is active or any earn/redeem activity within 36 months.'),
    ('westjet-rewards',  NULL, 'WestJet Rewards do not expire while you are an active member.'),
    ('flying-blue',      24, 'Air France/KLM Flying Blue: 24 months of inactivity expires Miles.'),
    ('ba-avios',         36, 'British Airways Avios expire 36 months after last collection or redemption activity.'),
    ('asia-miles',       NULL, 'Cathay Asia Miles: changed to no-expiry (Cathay revamp 2024).'),
    ('pc-optimum',       18, 'PC Optimum points expire after 18 months of inactivity.')
ON CONFLICT (program_slug) DO NOTHING;
