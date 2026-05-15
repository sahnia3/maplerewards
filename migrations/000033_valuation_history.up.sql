-- ============================================================
-- Migration 000033 — Point valuation history (append-only)
-- ============================================================
-- Phase A pricing-trust layer:
--   * point_valuation_history captures every CPP observation so we can
--     show trend lines and detect program devaluations over time.
--   * point_valuations.recorded_at tracks when the active value was last
--     refreshed (frontend uses it to show staleness chips).
-- ============================================================

CREATE TABLE IF NOT EXISTS point_valuation_history (
    id           BIGSERIAL PRIMARY KEY,
    program_slug TEXT        NOT NULL,
    segment      TEXT        NOT NULL,
    cpp_cents    NUMERIC(6,2) NOT NULL,
    source       TEXT        NOT NULL DEFAULT 'manual',
    recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_point_valuation_history_lookup
    ON point_valuation_history (program_slug, segment, recorded_at DESC);

-- Add recorded_at to the active table if it doesn't exist.
-- Existing rows are anchored to now() on first apply so the staleness UI
-- doesn't immediately flag every program as 2+ months old.
ALTER TABLE point_valuations
    ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ NOT NULL DEFAULT now();
