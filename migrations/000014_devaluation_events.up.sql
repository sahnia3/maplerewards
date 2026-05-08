-- ── Devaluation alarm + forced-redemption recommender ───────────────────────
-- Tracks announced program devaluations so users with relevant balances get pinged.

CREATE TABLE IF NOT EXISTS devaluation_events (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_slug   TEXT NOT NULL,
    title          TEXT NOT NULL,
    description    TEXT,
    severity       TEXT NOT NULL DEFAULT 'minor',     -- 'minor'|'major'
    effective_date DATE NOT NULL,
    posted_at      DATE NOT NULL DEFAULT CURRENT_DATE,
    source_url     TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devaluation_program ON devaluation_events(program_slug, effective_date DESC);

-- Seed known 2025-26 devaluations (from research).
INSERT INTO devaluation_events (program_slug, title, description, severity, effective_date, posted_at, source_url) VALUES
('aeroplan',        'Long-haul business chart hike (+15K-20K)',
                    'Aeroplan award chart increases for long-haul biz: NA→Pacific 87.5K → 102.5K (+17.1%). Redeem before this date.',
                    'major', '2026-06-01', '2026-03-15', 'https://onemileatatime.com/news/aeroplan-updating-award-chart-devaluation/'),
('aeroplan',        'United/Etihad/regional moved to dynamic pricing',
                    'Star Alliance partner awards now priced dynamically. Redemptions can spike unpredictably.',
                    'minor', '2025-03-15', '2025-02-01', 'https://onemileatatime.com/news/aeroplan-updating-award-chart-devaluation/'),
('hdfc-rewards',    'HDFC SmartBuy earn cap halved (10x → 5x)',
                    'Infinia/DCB SmartBuy earn cut from 10x to 5x with monthly cap of 15K/7.5K points.',
                    'major', '2025-08-01', '2025-07-01', 'https://magnify.club/guides/hdfc-infinia-smartbuy-devaluation/'),
('axis-edge-miles', 'Marriott/Accor/Qatar removed from EDGE Miles transfers',
                    'Axis EDGE Miles loses Marriott Bonvoy, Accor Live Limitless, Qatar Privilege Club partners. Replaced with BA, Finnair, Lotusmiles at worse ratios (5:2 to 1:2).',
                    'major', '2026-04-02', '2026-02-15', 'https://www.paisabazaar.com/credit-card/axis-bank-credit-card-changes/'),
('hilton-honors',   'Top-tier property soft devaluation',
                    'Standard awards at top-tier Hilton properties now require more points.',
                    'minor', '2025-09-01', '2025-08-15', null),
('marriott-bonvoy', '5K airline transfer bonus removed for AA/Avianca/Delta',
                    'Marriott no longer awards the 5K bonus per 60K transferred to American, Avianca, or Delta.',
                    'minor', '2024-10-01', '2024-09-01', null);
