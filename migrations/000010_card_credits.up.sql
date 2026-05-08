-- ── Card credits + per-user redemption tracking ─────────────────────────────
-- Tracks recurring credits attached to a card (Amex Plat $200 travel, Aeroplan
-- Worldwide Companion Pass eligibility spend, etc.) and whether the user has
-- redeemed them in the current anniversary year.
--
-- "Annual fee renewal countdown" — uses existing user_cards.fee_renewal_date
-- (added in migration 000004) to surface days-until-anniversary.

CREATE TABLE IF NOT EXISTS card_credit_defs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id         UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,                  -- e.g. "Travel Credit"
    description     TEXT,                           -- "Statement credit on any travel purchase"
    value_cad       NUMERIC(10,2) NOT NULL,         -- 200.00
    recurrence      TEXT NOT NULL DEFAULT 'annual', -- annual | biennial | quadrennial | once
    sort_order      INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(card_id, name)
);

CREATE INDEX IF NOT EXISTS idx_card_credit_defs_card ON card_credit_defs(card_id);

CREATE TABLE IF NOT EXISTS user_card_credits (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_credit_def_id  UUID NOT NULL REFERENCES card_credit_defs(id) ON DELETE CASCADE,
    anniversary_year    INT NOT NULL,                       -- e.g. 2026
    redeemed_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
    redeemed_at         TIMESTAMPTZ,
    note                TEXT,
    UNIQUE (user_id, card_credit_def_id, anniversary_year)
);

CREATE INDEX IF NOT EXISTS idx_user_card_credits_user ON user_card_credits(user_id);

-- ── Seed credits for top Canadian premium cards (2026 benefits) ─────────────
-- Insert by card name to remain stable across UUID re-seeds.

INSERT INTO card_credit_defs (card_id, name, description, value_cad, recurrence, sort_order)
SELECT id, 'Travel Credit', 'Statement credit on any travel purchase booked through American Express Travel Online or by phone.', 200.00, 'annual', 10
FROM cards WHERE name = 'Amex Platinum' AND country = 'CA'
ON CONFLICT (card_id, name) DO NOTHING;

INSERT INTO card_credit_defs (card_id, name, description, value_cad, recurrence, sort_order)
SELECT id, 'Digital Entertainment Credit', 'Up to $20/month in statement credits ($240/yr) on eligible streaming/news services.', 240.00, 'annual', 20
FROM cards WHERE name = 'Amex Platinum' AND country = 'CA'
ON CONFLICT (card_id, name) DO NOTHING;

INSERT INTO card_credit_defs (card_id, name, description, value_cad, recurrence, sort_order)
SELECT id, 'NEXUS Credit', 'Statement credit for NEXUS application fee (every 4 years).', 100.00, 'quadrennial', 30
FROM cards WHERE name = 'Amex Platinum' AND country = 'CA'
ON CONFLICT (card_id, name) DO NOTHING;

INSERT INTO card_credit_defs (card_id, name, description, value_cad, recurrence, sort_order)
SELECT id, 'Travel Credit', 'Annual $100 travel credit on flights, hotels, car rentals, cruises, and tours through Amex Travel.', 100.00, 'annual', 10
FROM cards WHERE name = 'Amex Gold Rewards' AND country = 'CA'
ON CONFLICT (card_id, name) DO NOTHING;

INSERT INTO card_credit_defs (card_id, name, description, value_cad, recurrence, sort_order)
SELECT id, 'Annual Travel Credit', '$100 NEXUS application credit (every 4 years).', 100.00, 'quadrennial', 10
FROM cards WHERE name = 'TD Aeroplan Visa Infinite Privilege'
ON CONFLICT (card_id, name) DO NOTHING;

INSERT INTO card_credit_defs (card_id, name, description, value_cad, recurrence, sort_order)
SELECT id, 'Worldwide Companion Pass spend', 'Spend $25,000 in a calendar year to unlock a Worldwide Companion Pass.', 25000.00, 'annual', 20
FROM cards WHERE name = 'TD Aeroplan Visa Infinite Privilege'
ON CONFLICT (card_id, name) DO NOTHING;

INSERT INTO card_credit_defs (card_id, name, description, value_cad, recurrence, sort_order)
SELECT id, 'NEXUS Credit', 'Statement credit for NEXUS application fee (every 4 years).', 100.00, 'quadrennial', 10
FROM cards WHERE name = 'CIBC Aeroplan Visa Infinite Privilege'
ON CONFLICT (card_id, name) DO NOTHING;

INSERT INTO card_credit_defs (card_id, name, description, value_cad, recurrence, sort_order)
SELECT id, 'Worldwide Companion Pass spend', 'Spend $25,000 in a calendar year to unlock a Worldwide Companion Pass.', 25000.00, 'annual', 20
FROM cards WHERE name = 'CIBC Aeroplan Visa Infinite Privilege'
ON CONFLICT (card_id, name) DO NOTHING;

INSERT INTO card_credit_defs (card_id, name, description, value_cad, recurrence, sort_order)
SELECT id, 'NEXUS Credit', 'Statement credit for NEXUS application fee (every 4 years).', 50.00, 'quadrennial', 10
FROM cards WHERE name = 'Scotiabank Passport Visa Infinite'
ON CONFLICT (card_id, name) DO NOTHING;
