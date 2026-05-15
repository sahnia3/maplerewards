-- ── Transfer-bonus event log ────────────────────────────────────────────────
-- Records active and historical transfer-bonus promotions detected by the
-- worker's Promo Sentinel (Tavily + Claude classification of issuer/blog
-- pages). The worker upserts via UNIQUE (from_program, to_program, expires_at)
-- so re-runs of the same promo don't duplicate rows.

CREATE TABLE IF NOT EXISTS transfer_bonus_events (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_program     TEXT NOT NULL,
    to_program       TEXT NOT NULL,
    bonus_percent    NUMERIC(5,2) NOT NULL,
    starts_at        DATE,
    expires_at       DATE,
    source_url       TEXT NOT NULL,
    source_title     TEXT,
    summary          TEXT,
    ai_confidence    NUMERIC(3,2),
    detected_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (from_program, to_program, expires_at)
);

-- Postgres rejects CURRENT_DATE in a partial-index predicate (not IMMUTABLE),
-- so we index the full column and let the planner use it for both active
-- and historical reads.
CREATE INDEX IF NOT EXISTS idx_transfer_bonus_events_active
    ON transfer_bonus_events(expires_at DESC NULLS FIRST);

CREATE INDEX IF NOT EXISTS idx_transfer_bonus_events_from_program
    ON transfer_bonus_events(from_program, detected_at DESC);
