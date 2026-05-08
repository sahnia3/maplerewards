-- ── Buy-points break-even calculator ────────────────────────────────────────
-- Tracks current "buy points" promotions per loyalty program with cents/point.

CREATE TABLE IF NOT EXISTS buy_promo_pricing (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_slug          TEXT NOT NULL,                  -- 'aeroplan'|'marriott'|'hilton'|'hyatt'|'ihg'
    promo_label           TEXT NOT NULL,                  -- e.g. "30% off"
    base_cents_per_point  NUMERIC(6,3) NOT NULL,          -- 3.750 = 3.75¢
    promo_cents_per_point NUMERIC(6,3) NOT NULL,          -- 2.625 = 2.625¢
    valid_from            DATE NOT NULL,
    valid_to              DATE,
    source_url            TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_buy_promo_program ON buy_promo_pricing(program_slug, valid_from DESC);

-- Seed current 2025-26 promos (research findings).
INSERT INTO buy_promo_pricing (program_slug, promo_label, base_cents_per_point, promo_cents_per_point, valid_from, valid_to, source_url) VALUES
('aeroplan', '30% off (May 2026)', 3.750, 2.625, '2026-05-01', '2026-05-31', 'https://upgradedpoints.com/news/buy-aeroplan-points-with-bonus/'),
('marriott', '40% bonus (extended)', 1.250, 0.890, '2025-12-01', '2026-12-31', 'https://loyaltylobby.com/2025/12/09/extended-marriott-buy-points-40-or-higher-bonus-increased-limit-through-december-10-2025/'),
('hilton', '100% bonus', 1.000, 0.500, '2026-01-01', '2026-12-31', 'https://onemileatatime.com/deals/buy-hilton-honors-points/'),
('hyatt', '20% off', 2.600, 2.080, '2026-01-01', '2026-12-31', 'https://awardwallet.com/hotels/world-of-hyatt/buy-hyatt-points/'),
('ihg', '100% bonus typical', 1.150, 0.500, '2026-01-01', '2026-12-31', null);
