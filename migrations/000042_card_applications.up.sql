-- ── Card application tracker + issuer cooldown rules ──────────────────────
-- Power-user feature: avoid getting denied for hitting an issuer's cooldown
-- (RBC 90d, TD 365d, BMO 90d, etc.). We track every application a user
-- records and the eligibility service warns before they apply again.

CREATE TABLE IF NOT EXISTS card_applications (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id      UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    applied_at   DATE NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')),
    notes        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_card_applications_user ON card_applications(user_id, applied_at DESC);

-- Per-issuer cooldown rules. The MVP encodes the "X new credit cards per N days"
-- rule that every CA bank enforces. More complex rules (Amex pop-up jail,
-- product-family lifetime limits) can be added as additional rule_type values.
CREATE TABLE IF NOT EXISTS issuer_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issuer          TEXT NOT NULL,
    rule_type       TEXT NOT NULL CHECK (rule_type IN ('cooldown_days','max_per_year')),
    value           INTEGER NOT NULL,
    notes           TEXT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (issuer, rule_type)
);

INSERT INTO issuer_rules (issuer, rule_type, value, notes) VALUES
  ('RBC',               'cooldown_days', 90,  '1 new credit card per 90 days (community-reported, not policy)'),
  ('TD',                'cooldown_days', 365, '12-month cooldown between TD card approvals'),
  ('BMO',               'cooldown_days', 90,  '90-day cooldown is common; varies by product'),
  ('CIBC',              'cooldown_days', 90,  '90-day cooldown is typical'),
  ('Scotiabank',        'cooldown_days', 90,  'Scotia commonly enforces 90 days between approvals'),
  ('American Express',  'cooldown_days', 60,  'Amex CA: short cooldown; pop-up jail is the bigger constraint'),
  ('MBNA',              'cooldown_days', 90,  'MBNA Tier-1 cooldown is ~90 days'),
  ('National Bank',     'cooldown_days', 90,  '90-day cooldown is typical for NBC')
ON CONFLICT (issuer, rule_type) DO NOTHING;
