-- ============================================================
-- Spend tracking: monthly spend aggregation + shared cap groups
-- ============================================================

-- Tracks actual spend per user/card/category/month for cap enforcement
CREATE TABLE user_monthly_spend (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id     UUID NOT NULL REFERENCES cards(id),
    category_id UUID NOT NULL REFERENCES categories(id),
    month       DATE NOT NULL,  -- first day of month, e.g. '2026-03-01'
    total_spend NUMERIC(10,2) NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, card_id, category_id, month)
);

CREATE INDEX idx_monthly_spend_lookup
    ON user_monthly_spend(user_id, card_id, month);

-- Groups categories that share a single cap (e.g. Cobalt: groceries+dining+streaming = $2,500/mo)
CREATE TABLE cap_groups (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id    UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    cap_amount NUMERIC(10,2) NOT NULL,
    cap_period TEXT NOT NULL CHECK (cap_period IN ('monthly','annual'))
);

CREATE TABLE cap_group_categories (
    cap_group_id UUID NOT NULL REFERENCES cap_groups(id) ON DELETE CASCADE,
    category_id  UUID NOT NULL REFERENCES categories(id),
    PRIMARY KEY (cap_group_id, category_id)
);

-- Individual spend entries for history tracking
CREATE TABLE spend_entries (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id       UUID NOT NULL REFERENCES cards(id),
    category_id   UUID NOT NULL REFERENCES categories(id),
    amount        NUMERIC(10,2) NOT NULL,
    points_earned NUMERIC(12,2) NOT NULL DEFAULT 0,
    dollar_value  NUMERIC(10,4) NOT NULL DEFAULT 0,
    spent_at      DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    note          TEXT
);

CREATE INDEX idx_spend_entries_user_date ON spend_entries(user_id, spent_at DESC);
CREATE INDEX idx_spend_entries_user_card_month
    ON spend_entries(user_id, card_id, date_trunc('month', spent_at::timestamp));

-- ── Seed cap groups for Amex Cobalt ─────────────────────────────────────────
-- Cobalt's 5x categories (groceries, dining, streaming) share a $2,500/mo cap

INSERT INTO cap_groups (id, card_id, name, cap_amount, cap_period) VALUES
    ('40000000-0000-0000-0000-000000000001',
     '20000000-0000-0000-0000-000000000001',
     'food_drink_streaming', 2500.00, 'monthly');

INSERT INTO cap_group_categories (cap_group_id, category_id) VALUES
    ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001'), -- Groceries
    ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002'), -- Dining
    ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000007'); -- Streaming
