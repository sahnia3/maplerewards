-- MapleRewards Schema
-- Run: make migrate-up

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Loyalty Programs ──────────────────────────────────────────────────────────

CREATE TABLE loyalty_programs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    slug          TEXT UNIQUE NOT NULL,
    currency_name TEXT NOT NULL,
    program_type  TEXT NOT NULL CHECK (program_type IN ('airline','bank','hotel','cashback')),
    base_cpp      NUMERIC(6,4) NOT NULL,    -- cents per point; Redis holds live values
    is_active     BOOLEAN DEFAULT TRUE,
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Cards ─────────────────────────────────────────────────────────────────────

CREATE TABLE cards (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                    TEXT NOT NULL,
    issuer                  TEXT NOT NULL,
    network                 TEXT CHECK (network IN ('visa','mastercard','amex')),
    loyalty_program_id      UUID NOT NULL REFERENCES loyalty_programs(id),
    annual_fee              NUMERIC(8,2) DEFAULT 0,
    welcome_bonus_points    INTEGER DEFAULT 0,
    welcome_bonus_min_spend NUMERIC(8,2) DEFAULT 0,
    welcome_bonus_months    SMALLINT DEFAULT 3,
    is_active               BOOLEAN DEFAULT TRUE,
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ── Categories (with MCC arrays for POS lookup) ───────────────────────────────

CREATE TABLE categories (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name      TEXT NOT NULL,
    slug      TEXT UNIQUE NOT NULL,
    parent_id UUID REFERENCES categories(id),
    mcc_codes INTEGER[]   -- GIN-indexed for O(1) MCC lookup
);

CREATE INDEX idx_categories_mcc ON categories USING GIN(mcc_codes);

-- ── Card Multipliers (time-bounded for program changes) ───────────────────────

CREATE TABLE card_multipliers (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id           UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    category_id       UUID NOT NULL REFERENCES categories(id),
    earn_rate         NUMERIC(5,2) NOT NULL,
    earn_type         TEXT DEFAULT 'points' CHECK (earn_type IN ('points','cashback_pct','miles','dollars')),
    cap_amount        NUMERIC(10,2),          -- NULL = no cap
    cap_period        TEXT CHECK (cap_period IN ('monthly','annual')),
    fallback_earn_rate NUMERIC(5,2) DEFAULT 1.0,  -- rate once cap is hit
    effective_from    DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to      DATE,                   -- NULL = still active
    notes             TEXT,
    UNIQUE (card_id, category_id, effective_from)
);

-- ── Users (anonymous session-based for MVP) ───────────────────────────────────

CREATE TABLE users (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email      TEXT UNIQUE,                   -- optional; NULL for anonymous
    session_id TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_session ON users(session_id);

-- ── User Wallet ───────────────────────────────────────────────────────────────

CREATE TABLE user_cards (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id       UUID NOT NULL REFERENCES cards(id),
    point_balance BIGINT DEFAULT 0,
    added_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, card_id)
);

-- ── Transfer Partners ─────────────────────────────────────────────────────────

CREATE TABLE transfer_partners (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_program_id    UUID NOT NULL REFERENCES loyalty_programs(id),
    to_program_id      UUID NOT NULL REFERENCES loyalty_programs(id),
    transfer_ratio     NUMERIC(6,4) NOT NULL,   -- 1.0 = 1:1, 0.75 = 3:4
    minimum_transfer   INTEGER DEFAULT 1000,
    transfer_increment INTEGER DEFAULT 1000,
    processing_days    SMALLINT DEFAULT 2,
    is_active          BOOLEAN DEFAULT TRUE,
    effective_from     DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to       DATE,
    notes              TEXT,
    UNIQUE (from_program_id, to_program_id, effective_from)
);

-- ── Point Valuations (source of truth; Redis is warm cache) ──────────────────

CREATE TABLE point_valuations (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loyalty_program_id UUID NOT NULL REFERENCES loyalty_programs(id),
    segment            TEXT NOT NULL DEFAULT 'base',  -- base | economy | business
    cpp                NUMERIC(6,4) NOT NULL,
    source             TEXT DEFAULT 'manual',
    effective_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    UNIQUE (loyalty_program_id, segment, effective_date)
);

-- ── Aeroplan 2026 SQC thresholds (data hook for future status tracker) ────────

CREATE TABLE aeroplan_status_thresholds (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status_level    TEXT NOT NULL,           -- '25K','35K','50K','75K','Super Elite'
    sqc_required    INTEGER NOT NULL,        -- Status Qualifying Criteria points (2026: revenue-based)
    min_revenue_cad NUMERIC(10,2),           -- 2026 minimum CAD spend floor
    effective_year  SMALLINT NOT NULL DEFAULT 2026
);
