-- Per-user cents-per-point (CPP) overrides (revamp 2026-06-12, AU-5).
--
-- The optimizer, sweet-spot, simulator, and portfolio engines value every CAD
-- figure on a single program-level base CPP. An advanced churner routinely
-- disagrees with that number (they know their own redemption habits) and, until
-- now, had no way to correct it. This table lets a signed-in user supply THEIR
-- OWN cents-per-point for a given program + redemption segment; the engines then
-- prefer the user's value and fall back to the seeded base when no override
-- exists.
--
-- We invent nothing here — every cpp_cad value is supplied by the user. The
-- column is empty until the user fills it in.
--
-- Keyed on (user_id, program_slug, segment): program_slug (not program_id) so an
-- override survives a program-id churn, and segment so a user can value e.g.
-- "base" (statement credit) differently from "business" (premium-cabin award).
CREATE TABLE IF NOT EXISTS user_cpp (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    program_slug TEXT NOT NULL,
    segment      TEXT NOT NULL DEFAULT 'base',
    cpp_cad      DOUBLE PRECISION NOT NULL CHECK (cpp_cad >= 0),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, program_slug, segment)
);

-- The engines read every override a user holds in one pass per request.
CREATE INDEX IF NOT EXISTS idx_user_cpp_user ON user_cpp (user_id);
