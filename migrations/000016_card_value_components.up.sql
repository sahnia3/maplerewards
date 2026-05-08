-- ── Annual-card-value comparison (insurance + lounge + multipliers + credits) ─

CREATE TABLE IF NOT EXISTS card_value_components (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id         UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    component_type  TEXT NOT NULL,                         -- 'insurance'|'lounge'|'concierge'|'fx_savings'|'multiplier'|'credit_bundle'
    annual_ev_cad   NUMERIC(10,2) NOT NULL,                -- modeled expected value/yr
    description     TEXT,
    sort_order      INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(card_id, component_type)
);

CREATE INDEX IF NOT EXISTS idx_card_value_components_card ON card_value_components(card_id);

-- ── Seed values (research §14.3-14.4: insurance EVs + lounge value model) ───
-- Lounge: assume frequent traveler, 6 visits @ C$30/visit revealed value = $180/yr.
-- Insurance EVs from §14.3 head-to-head matrix.

-- Amex Platinum (Scotia)
INSERT INTO card_value_components (card_id, component_type, annual_ev_cad, description, sort_order)
SELECT id, 'insurance',     450.00, 'Mobile $1500 + trip cancel $2500/pp + medical 15d $5M + rental CDW',           10 FROM cards WHERE name = 'Amex Platinum' AND country='CA' ON CONFLICT DO NOTHING;
INSERT INTO card_value_components (card_id, component_type, annual_ev_cad, description, sort_order)
SELECT id, 'lounge',        360.00, '12 Priority Pass + Centurion visits @ ~C$30 marginal',                          20 FROM cards WHERE name = 'Amex Platinum' AND country='CA' ON CONFLICT DO NOTHING;
INSERT INTO card_value_components (card_id, component_type, annual_ev_cad, description, sort_order)
SELECT id, 'concierge',      50.00, '24/7 Platinum concierge',                                                       30 FROM cards WHERE name = 'Amex Platinum' AND country='CA' ON CONFLICT DO NOTHING;
INSERT INTO card_value_components (card_id, component_type, annual_ev_cad, description, sort_order)
SELECT id, 'credit_bundle', 540.00, 'Travel $200 + Digital Entertainment $240 + NEXUS amortized $25',                40 FROM cards WHERE name = 'Amex Platinum' AND country='CA' ON CONFLICT DO NOTHING;

-- Amex Gold Rewards
INSERT INTO card_value_components (card_id, component_type, annual_ev_cad, description, sort_order)
SELECT id, 'insurance',     220.00, 'Trip cancel $1500/pp + interrupt $1500 + medical 15d $5M + rental CDW',         10 FROM cards WHERE name = 'Amex Gold Rewards' AND country='CA' ON CONFLICT DO NOTHING;
INSERT INTO card_value_components (card_id, component_type, annual_ev_cad, description, sort_order)
SELECT id, 'credit_bundle', 100.00, '$100 annual travel credit',                                                     30 FROM cards WHERE name = 'Amex Gold Rewards' AND country='CA' ON CONFLICT DO NOTHING;

-- Amex Cobalt
INSERT INTO card_value_components (card_id, component_type, annual_ev_cad, description, sort_order)
SELECT id, 'insurance',     150.00, 'Mobile device $1000 + travel medical 15d',                                       10 FROM cards WHERE name = 'Amex Cobalt' AND country='CA' ON CONFLICT DO NOTHING;

-- TD Aeroplan VIP / CIBC Aeroplan VIP / RBC Avion VIP / Scotia Passport
INSERT INTO card_value_components (card_id, component_type, annual_ev_cad, description, sort_order)
SELECT id, 'insurance',     320.00, 'Trip cancel $1500-2500 + medical 21d $2M + rental CDW + WE-MC mobile $1000',   10 FROM cards WHERE name = 'TD Aeroplan Visa Infinite Privilege' ON CONFLICT DO NOTHING;
INSERT INTO card_value_components (card_id, component_type, annual_ev_cad, description, sort_order)
SELECT id, 'lounge',        180.00, '6 DragonPass visits @ ~C$30 marginal',                                          20 FROM cards WHERE name = 'TD Aeroplan Visa Infinite Privilege' ON CONFLICT DO NOTHING;

INSERT INTO card_value_components (card_id, component_type, annual_ev_cad, description, sort_order)
SELECT id, 'insurance',     320.00, 'VIP insurance bundle',                                                          10 FROM cards WHERE name = 'CIBC Aeroplan Visa Infinite Privilege' ON CONFLICT DO NOTHING;
INSERT INTO card_value_components (card_id, component_type, annual_ev_cad, description, sort_order)
SELECT id, 'lounge',        180.00, '6 DragonPass visits @ C$30',                                                    20 FROM cards WHERE name = 'CIBC Aeroplan Visa Infinite Privilege' ON CONFLICT DO NOTHING;

INSERT INTO card_value_components (card_id, component_type, annual_ev_cad, description, sort_order)
SELECT id, 'insurance',     280.00, 'Visa Infinite insurance bundle (mobile $1000 + trip cancel $1500/pp + medical 15d $1M + CDW)', 10 FROM cards WHERE name = 'Scotiabank Passport Visa Infinite' ON CONFLICT DO NOTHING;
INSERT INTO card_value_components (card_id, component_type, annual_ev_cad, description, sort_order)
SELECT id, 'lounge',        180.00, '6 Priority Pass visits @ C$30',                                                 20 FROM cards WHERE name = 'Scotiabank Passport Visa Infinite' ON CONFLICT DO NOTHING;
INSERT INTO card_value_components (card_id, component_type, annual_ev_cad, description, sort_order)
SELECT id, 'fx_savings',    100.00, 'Zero foreign-transaction fee (vs 2.5% standard, on est. $4K USD spend)',        25 FROM cards WHERE name = 'Scotiabank Passport Visa Infinite' ON CONFLICT DO NOTHING;
