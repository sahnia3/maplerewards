-- ── India-outbound hotel arbitrage (diaspora wedge) ─────────────────────────
-- Surfaces points-vs-cash arbitrage at Indian hotel properties for users with
-- Marriott/Hilton/Hyatt/IHG balances.

CREATE TABLE IF NOT EXISTS india_hotel_arbitrage (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_slug        TEXT NOT NULL,                     -- 'marriott'|'hilton'|'hyatt'|'ihg'
    property_name       TEXT NOT NULL,
    city                TEXT NOT NULL,
    points_per_night    INT NOT NULL,
    cash_rate_inr       INT,                               -- typical cash rate
    cash_rate_cad       NUMERIC(10,2) NOT NULL,            -- converted (1 CAD ≈ 60 INR)
    value_cad_per_point NUMERIC(7,4) NOT NULL,             -- cash_rate_cad / points_per_night
    notes               TEXT,
    source_url          TEXT,
    sampled_at          DATE NOT NULL DEFAULT CURRENT_DATE,
    UNIQUE(program_slug, property_name)
);

CREATE INDEX IF NOT EXISTS idx_india_arb_program ON india_hotel_arbitrage(program_slug, value_cad_per_point DESC);

-- ── Seed sample properties (research §12.7 thesis) ──────────────────────────
INSERT INTO india_hotel_arbitrage (program_slug, property_name, city, points_per_night, cash_rate_inr, cash_rate_cad, value_cad_per_point, notes, source_url) VALUES
('marriott', 'JW Marriott Mumbai Sahar',     'Mumbai',     30000,  18000,   300.00, 0.0100, 'Standard room, weekday', 'https://www.marriott.com/'),
('marriott', 'The Westin Mumbai Garden City','Mumbai',     25000,  15000,   250.00, 0.0100, 'Standard room',          null),
('marriott', 'JW Marriott Bengaluru',         'Bengaluru',  35000,  22000,   367.00, 0.0105, 'Premier room',           null),
('marriott', 'Sheraton Grand Bangalore',      'Bengaluru',  20000,  14000,   233.00, 0.0117, 'Standard',               null),
('marriott', 'Le Méridien New Delhi',         'New Delhi',  35000,  21000,   350.00, 0.0100, null,                     null),
('hilton',   'Hilton Mumbai International',   'Mumbai',     50000,  16500,   275.00, 0.0055, 'Note: Hilton 0.5¢/pt floor',null),
('hilton',   'Hilton Goa Resort',             'Goa',        50000,  20000,   333.00, 0.0067, 'Beach property',         null),
('hyatt',    'Grand Hyatt Mumbai',            'Mumbai',     20000,  17000,   283.00, 0.0142, 'Cat 4',                  null),
('hyatt',    'Park Hyatt Goa Resort',         'Goa',        25000,  22000,   367.00, 0.0147, 'Cat 5',                  null),
('ihg',      'InterContinental Marine Drive', 'Mumbai',     45000,  20000,   333.00, 0.0074, null,                     null);
