-- ── Merchant network acceptance ────────────────────────────────────────────
-- The single highest-upvoted Canadian-rewards complaint is "Costco/Loblaws
-- doesn't take Amex." We capture which networks each merchant actually
-- accepts so the optimizer + AI chat can warn users before they swipe a card
-- the merchant will reject. Defaults match the most common reality: Visa and
-- Mastercard accepted everywhere, Amex acceptance is the variable.

ALTER TABLE merchants
    ADD COLUMN IF NOT EXISTS accepts_amex       BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS accepts_visa       BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS accepts_mastercard BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS notes              TEXT;

-- Seed the well-known Canadian Amex blackouts. Updates can be applied via
-- regular SQL; the column is operational data, not application data.
UPDATE merchants SET accepts_amex = false, notes = 'Costco Canada is Mastercard-exclusive.'
    WHERE slug ILIKE 'costco%';
UPDATE merchants SET accepts_amex = false, notes = 'Loblaws Companies (Loblaws, No Frills, Superstore, Shoppers, Wholesale Club, T&T) doesn''t take Amex.'
    WHERE slug ILIKE ANY (ARRAY[
        'loblaws%', 'no_frills%', 'superstore%', 'shoppers%',
        'wholesale_club%', 't_and_t%', 'real_canadian_superstore%'
    ]);

-- Seed common Canadian merchants if they don't already exist (idempotent).
-- Anyone who runs the optimizer for groceries should hit at least one row.
INSERT INTO merchants (slug, name, category_slug, primary_url, accepts_amex, notes) VALUES
    ('costco_ca',     'Costco Canada',           'groceries', 'https://www.costco.ca',        false, 'Mastercard-only checkout in Canada'),
    ('loblaws_ca',    'Loblaws',                 'groceries', 'https://www.loblaws.ca',       false, 'Loblaws Companies stores reject Amex'),
    ('no_frills_ca', 'No Frills',               'groceries', 'https://www.nofrills.ca',      false, 'Loblaws Companies — no Amex'),
    ('superstore_ca','Real Canadian Superstore','groceries', 'https://www.realcanadiansuperstore.ca', false, 'Loblaws Companies — no Amex'),
    ('shoppers_ca',  'Shoppers Drug Mart',      'pharmacy',  'https://www.shoppersdrugmart.ca', false, 'Loblaws Companies — no Amex'),
    ('metro_ca',     'Metro',                   'groceries', 'https://www.metro.ca',         true,  null),
    ('sobeys_ca',    'Sobeys',                  'groceries', 'https://www.sobeys.com',       true,  null),
    ('iga_ca',       'IGA',                     'groceries', 'https://www.iga.net',          true,  null),
    ('whole_foods_ca','Whole Foods Canada',     'groceries', 'https://www.wholefoodsmarket.com', true, null)
ON CONFLICT (slug) DO UPDATE SET
    accepts_amex = EXCLUDED.accepts_amex,
    notes        = EXCLUDED.notes;
