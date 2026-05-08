-- ── Tangerine MCC → 2% rotating-category resolver ───────────────────────────
-- Tangerine WEMC users pick 2-3 categories that earn 2% (rotating quarterly).
-- This table catalogues the available choices + their MCC ranges so the
-- optimizer can confirm "this merchant maps to one of your 2% categories."

CREATE TABLE IF NOT EXISTS tangerine_categories (
    slug         TEXT PRIMARY KEY,                        -- 'tang_groceries'|'tang_dining'|...
    display_name TEXT NOT NULL,
    mcc_codes    INT[] NOT NULL,
    description  TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO tangerine_categories (slug, display_name, mcc_codes, description) VALUES
('tang_groceries',          'Groceries',                 ARRAY[5411,5422,5441,5451,5462,5499], 'Standard grocery MCCs'),
('tang_dining',             'Restaurants',               ARRAY[5812,5813,5814],                'Restaurants and bars'),
('tang_gas',                'Gas',                       ARRAY[5541,5542],                     'Service stations'),
('tang_recurring_bills',    'Recurring bill payments',   ARRAY[4814,4899,4900],                'Telecom + utilities recurring'),
('tang_drug_store',         'Drug Store',                ARRAY[5912,5122],                     'Pharmacies'),
('tang_home_improvement',   'Home Improvement',          ARRAY[5200,5211,5251],                'Hardware/home centers'),
('tang_furniture',          'Furniture',                 ARRAY[5712],                          'Furniture stores'),
('tang_hotel_motel',        'Hotel/Motel',               ARRAY[7011],                          'Lodging'),
('tang_parking',            'Parking',                   ARRAY[7523],                          'Parking lots and garages'),
('tang_public_transport',   'Public Transportation',     ARRAY[4111,4131,4112],                'Transit'),
('tang_entertainment',      'Entertainment',             ARRAY[7832,7922,7929,7941,7993,7996], 'Movies, theaters, recreation')
ON CONFLICT (slug) DO NOTHING;
