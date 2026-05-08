-- ── Affiliate revenue tracking on card-application clicks ───────────────────
-- Plan §16 second income stream. Adds two columns to cards + a click ledger.

ALTER TABLE cards ADD COLUMN IF NOT EXISTS affiliate_url        TEXT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS affiliate_payout_cad NUMERIC(10,2);

CREATE TABLE IF NOT EXISTS affiliate_clicks (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
    card_id       UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    referrer      TEXT,
    user_agent    TEXT,
    clicked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_card ON affiliate_clicks(card_id, clicked_at DESC);
