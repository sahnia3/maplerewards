-- ── Region/Country support ────────────────────────────────────────────────────
-- Lays the groundwork for international expansion (US cards, etc.)

ALTER TABLE cards ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'CA';
ALTER TABLE loyalty_programs ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'CA';
ALTER TABLE categories ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'CA';

CREATE INDEX IF NOT EXISTS idx_cards_country ON cards(country);
CREATE INDEX IF NOT EXISTS idx_loyalty_programs_country ON loyalty_programs(country);

-- ── Welcome bonus tracking ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_card_bonuses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id         UUID NOT NULL REFERENCES cards(id),
    activated_at    DATE NOT NULL DEFAULT CURRENT_DATE,
    deadline_at     DATE NOT NULL,  -- activated_at + welcome_bonus_months
    min_spend       NUMERIC(10,2) NOT NULL DEFAULT 0,
    current_spend   NUMERIC(10,2) NOT NULL DEFAULT 0,
    bonus_points    INTEGER NOT NULL DEFAULT 0,
    is_completed    BOOLEAN NOT NULL DEFAULT false,
    completed_at    DATE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_user_card_bonuses_deadline ON user_card_bonuses(user_id, is_completed, deadline_at);

-- ── Annual fee value tracking ─────────────────────────────────────────────────

ALTER TABLE user_cards ADD COLUMN IF NOT EXISTS annual_fee_paid_at DATE;
ALTER TABLE user_cards ADD COLUMN IF NOT EXISTS fee_renewal_date DATE;
