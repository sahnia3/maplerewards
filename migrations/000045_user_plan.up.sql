-- ── User plan tier ─────────────────────────────────────────────────────────
-- The paid system was a single is_pro boolean: Pro, Pro Plus, and Lifetime
-- all collapsed to is_pro=true and the purchased tier was discarded at the
-- Stripe webhook (handleCheckoutCompleted never read the price). This adds
-- the missing tier so the app can (a) render a correct per-tier badge and
-- (b) drive billing-management UX — Lifetime has no subscription to cancel.
--
-- is_pro stays the access-gating flag (RequirePro middleware, JWT claim) and
-- is kept in sync by the webhook: plan != 'free'  ⟺  is_pro = true.

ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';

-- Backfill existing paid users. Pro vs Pro Plus vs Lifetime can't be
-- reconstructed retroactively (it was never persisted), so every current
-- paid user maps to 'pro' — the safe floor. Future purchases record the
-- real tier from the checkout session metadata.
UPDATE users SET plan = 'pro' WHERE is_pro = true AND plan = 'free';
