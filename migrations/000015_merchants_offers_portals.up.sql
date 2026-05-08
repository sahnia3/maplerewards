-- ── Merchants × portal rates × network offers (powers triple-stack calc) ────

CREATE TABLE IF NOT EXISTS merchants (
    slug          TEXT PRIMARY KEY,                       -- e.g. 'sephora_ca'
    name          TEXT NOT NULL,                          -- 'Sephora Canada'
    category_slug TEXT,                                   -- maps to categories.slug
    primary_url   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portal_rates (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    portal        TEXT NOT NULL,                          -- 'rakuten_ca'|'gcr'|'topcashback'
    merchant_slug TEXT NOT NULL REFERENCES merchants(slug) ON DELETE CASCADE,
    rate_pct      NUMERIC(6,3) NOT NULL,                  -- 4.000 = 4%
    valid_from    DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_to      DATE,
    scraped_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_url    TEXT,
    UNIQUE(portal, merchant_slug, valid_from)
);

CREATE INDEX IF NOT EXISTS idx_portal_rates_merchant ON portal_rates(merchant_slug, rate_pct DESC);

CREATE TABLE IF NOT EXISTS network_offers (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    network        TEXT NOT NULL,                          -- 'amex'|'visa'|'mastercard'
    merchant_slug  TEXT NOT NULL REFERENCES merchants(slug) ON DELETE CASCADE,
    title          TEXT NOT NULL,                          -- "Spend $50 get $10 back"
    reward_type    TEXT NOT NULL,                          -- 'statement_credit'|'bonus_points'|'merchant_discount'
    reward_value   NUMERIC(10,2) NOT NULL,                 -- $10 or 5x or 15%
    min_spend      NUMERIC(10,2) NOT NULL DEFAULT 0,
    card_filter    TEXT,                                   -- optional card name pattern (e.g. 'Cobalt'); NULL = all
    valid_from     DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_to       DATE,
    source         TEXT NOT NULL DEFAULT 'community',      -- 'visa.ca'|'mtr.mastercardservices.com'|'community'
    source_url     TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_network_offers_merchant ON network_offers(merchant_slug, network);
CREATE INDEX IF NOT EXISTS idx_network_offers_active ON network_offers(valid_to);

-- ── Seed sample Canadian merchants + portal rates + network offers ──────────
INSERT INTO merchants (slug, name, category_slug, primary_url) VALUES
('loblaws_ca',       'Loblaws',              'groceries',          'https://www.loblaws.ca/'),
('sobeys_ca',        'Sobeys',               'groceries',          'https://www.sobeys.com/'),
('shoppers_ca',      'Shoppers Drug Mart',   'pharmacy',           'https://www1.shoppersdrugmart.ca/'),
('sephora_ca',       'Sephora Canada',       'everything-else',    'https://www.sephora.ca/'),
('indigo_ca',        'Indigo',               'everything-else',    'https://www.indigo.ca/'),
('hudsonsbay_ca',    'Hudson''s Bay',        'everything-else',    'https://www.thebay.com/'),
('apple_ca',         'Apple Canada',         'everything-else',    'https://www.apple.com/ca/'),
('bestbuy_ca',       'Best Buy Canada',      'everything-else',    'https://www.bestbuy.ca/'),
('telus_ca',         'TELUS',                'streaming-digital',  'https://www.telus.com/'),
('expedia_ca',       'Expedia Canada',       'travel',             'https://www.expedia.ca/')
ON CONFLICT (slug) DO NOTHING;

-- Rakuten.ca (illustrative current rates).
INSERT INTO portal_rates (portal, merchant_slug, rate_pct, source_url) VALUES
('rakuten_ca', 'sephora_ca',     4.000, 'https://www.rakuten.ca/sephora-coupons.html'),
('rakuten_ca', 'indigo_ca',      3.000, 'https://www.rakuten.ca/'),
('rakuten_ca', 'hudsonsbay_ca',  3.000, 'https://www.rakuten.ca/'),
('rakuten_ca', 'apple_ca',       1.000, 'https://www.rakuten.ca/'),
('rakuten_ca', 'bestbuy_ca',     1.000, 'https://www.rakuten.ca/'),
('rakuten_ca', 'expedia_ca',     6.000, 'https://www.rakuten.ca/');

-- Great Canadian Rebates (often beats Rakuten by 0.5-2pp).
INSERT INTO portal_rates (portal, merchant_slug, rate_pct, source_url) VALUES
('gcr', 'sephora_ca',     5.000, 'https://www.greatcanadianrebates.ca/'),
('gcr', 'indigo_ca',      4.000, 'https://www.greatcanadianrebates.ca/'),
('gcr', 'apple_ca',       2.000, 'https://www.greatcanadianrebates.ca/'),
('gcr', 'expedia_ca',     7.000, 'https://www.greatcanadianrebates.ca/');

-- Amex Offers (community-aggregated illustrative current).
INSERT INTO network_offers (network, merchant_slug, title, reward_type, reward_value, min_spend, card_filter, valid_to, source) VALUES
('amex', 'loblaws_ca',  'Spend $50, get $10 back',   'statement_credit', 10.00, 50.00, 'Cobalt',     '2026-06-30', 'community'),
('amex', 'indigo_ca',   'Spend $75, get $20 back',   'statement_credit', 20.00, 75.00, NULL,         '2026-07-31', 'community'),
('amex', 'sephora_ca',  'Spend $150, get $30 back',  'statement_credit', 30.00, 150.00, NULL,        '2026-06-30', 'community'),
('amex', 'apple_ca',    '5x Membership Rewards',     'bonus_points',     5.00,  0.00,  'Platinum',   '2026-12-31', 'community');

-- Visa Offers + Perks (public landing).
INSERT INTO network_offers (network, merchant_slug, title, reward_type, reward_value, source, source_url) VALUES
('visa', 'expedia_ca',  '5% off select hotel bookings', 'merchant_discount', 5.00, 'visa.ca', 'https://www.visa.ca/en_CA/visa-offers-and-perks.html'),
('visa', 'apple_ca',    'Free shipping on $35+',        'merchant_discount', 0.00, 'visa.ca', 'https://www.visa.ca/en_CA/visa-offers-and-perks.html');

-- Mastercard Travel Rewards (sample).
INSERT INTO network_offers (network, merchant_slug, title, reward_type, reward_value, source) VALUES
('mastercard', 'expedia_ca',  '4% cashback on hotels',  'statement_credit', 4.00, 'mtr.mastercardservices.com');
