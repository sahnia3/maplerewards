-- ── Card-linked offer tracker ───────────────────────────────────────────────
-- Auto-activation of Amex Offers / RBC Offers / Scene+ deals requires
-- partner APIs none of the issuers expose publicly. Until that contract
-- exists, users still want to capture the offers they manually clip and
-- get reminded before they expire. This table backs the manual tracker:
-- the user logs the offer once, Maple flags expiry, and on click-through
-- marks it complete.

CREATE TABLE IF NOT EXISTS card_offers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id       UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    source        TEXT NOT NULL,                       -- 'amex_offers'|'rbc_offers'|'scene_plus'|'other'
    merchant      TEXT NOT NULL,                       -- 'Best Buy'
    description   TEXT,                                -- 'Spend $50, get $10 back'
    earn_amount   NUMERIC(10,2),                       -- 10.00 (CAD)
    min_spend     NUMERIC(10,2),                       -- 50.00
    activated_at  DATE,
    expires_at    DATE,
    is_used       BOOLEAN NOT NULL DEFAULT false,
    used_at       DATE,
    notes         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_card_offers_user
    ON card_offers(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_card_offers_active
    ON card_offers(user_id)
    WHERE is_used = false;
