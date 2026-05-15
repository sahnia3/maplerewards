-- ── Issuer-page diff-watch ──────────────────────────────────────────────────
-- The biggest editorial moat in Canadian rewards is being first with news.
-- Today the AI chat reads from Tavily on demand; this system flips it to
-- proactive: a worker fetches a curated list of issuer pages on a daily
-- cadence, hashes the rendered text, diffs against the prior snapshot, and
-- when the page changes meaningfully it stores a row + an AI-summarized
-- one-liner. The /pro-tools tile surfaces these so a Canadian rewards
-- collector hears about (e.g.) a Cobalt-perks-removed announcement before
-- the US blogs even quote it.

CREATE TABLE IF NOT EXISTS issuer_pages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label           TEXT NOT NULL,                          -- 'Amex Cobalt CA'
    url             TEXT NOT NULL UNIQUE,
    program_slug    TEXT,                                   -- optional link
    card_id         UUID REFERENCES cards(id) ON DELETE SET NULL,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    last_checked_at TIMESTAMPTZ,
    last_hash       TEXT,
    last_text       TEXT,                                   -- snapshot for diff
    check_failures  INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_issuer_pages_active
    ON issuer_pages(is_active, last_checked_at NULLS FIRST)
    WHERE is_active = true;

CREATE TABLE IF NOT EXISTS issuer_page_changes (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id       UUID NOT NULL REFERENCES issuer_pages(id) ON DELETE CASCADE,
    detected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    diff_summary  TEXT NOT NULL,                            -- one-line headline
    diff_snippet  TEXT NOT NULL,                            -- ~500-char before/after
    ai_confidence NUMERIC(3,2),                             -- 0-1, when summarized by AI
    is_promoted   BOOLEAN NOT NULL DEFAULT false            -- promoted to devaluation_events?
);

CREATE INDEX IF NOT EXISTS idx_issuer_page_changes_recent
    ON issuer_page_changes(detected_at DESC);

-- Seed the highest-value issuer pages from the April 2026 Reddit intel.
INSERT INTO issuer_pages (label, url, program_slug) VALUES
    ('Amex Cobalt CA',                       'https://www.americanexpress.com/en-ca/credit-cards/cobalt-card/',                                'amex-mr-ca'),
    ('Amex Platinum CA',                     'https://www.americanexpress.com/en-ca/credit-cards/platinum-card/',                              'amex-mr-ca'),
    ('Amex Aeroplan Reserve',                'https://www.americanexpress.com/en-ca/credit-cards/aeroplan-reserve/',                           'aeroplan'),
    ('TD Aeroplan Visa Infinite',            'https://www.td.com/ca/en/personal-banking/products/credit-cards/aeroplan/aeroplan-visa-infinite-card', 'aeroplan'),
    ('TD Aeroplan Visa Infinite Privilege',  'https://www.td.com/ca/en/personal-banking/products/credit-cards/aeroplan/aeroplan-visa-infinite-privilege-card', 'aeroplan'),
    ('RBC ION+ Visa',                        'https://www.rbcroyalbank.com/credit-cards/rewards/rbc-ion-plus-visa.html',                       'rbc-avion'),
    ('Scotiabank Passport Visa Infinite',    'https://www.scotiabank.com/ca/en/personal/credit-cards/visa/passport-infinite-card.html',        'scene-plus'),
    ('BMO Eclipse Visa Infinite',            'https://www.bmo.com/main/personal/credit-cards/bmo-eclipse-visa-infinite-card/',                  'bmo-rewards'),
    ('Aeroplan Status Qualifying Credits',   'https://www.aircanada.com/ca/en/aco/home/aeroplan/elite-status.html',                            'aeroplan'),
    ('Air Miles Cash & Dream',               'https://www.airmiles.ca/en/cash.html',                                                            'air-miles'),
    ('PC Mastercard',                        'https://www.pcfinancial.ca/en/credit-cards/pc-mastercard/',                                       'pc-optimum')
ON CONFLICT (url) DO NOTHING;
