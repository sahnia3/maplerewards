-- ─────────────────────────────────────────────────────────────────────────────
-- 000049_purchase_offer_ceilings — real per-program buy caps + per-offer credit
-- ─────────────────────────────────────────────────────────────────────────────
-- Sibling of the optimizer cap bug (docs/OPTIMIZER-CAP-AUDIT.md): two more
-- unbounded-projection surfaces still relied on conservative code guardrails.
--   • buy_points.go::Evaluate had no per-program annual purchase ceiling
--     (defaultMaxAnnualPointsPurchase=200000 placeholder).
--   • stack.go::Recommend had no per-offer max-credit
--     (defaultMaxOfferCreditCAD=$50 placeholder).
-- This migration adds the data columns + seeds the real published values so
-- P3 can replace the placeholders with verified ceilings (placeholder kept as
-- the fallback when a row is NULL).
--
-- No inline BEGIN/COMMIT — golang-migrate wraps each migration in its own
-- transaction (repo convention; an inline one nests and double-applies).
-- Idempotent: ADD COLUMN IF NOT EXISTS + UPDATE-by-natural-key.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. buy_promo_pricing.max_purchasable_per_year ───────────────────────────
ALTER TABLE buy_promo_pricing
  ADD COLUMN IF NOT EXISTS max_purchasable_per_year INTEGER;

-- Published annual point-purchase ceilings per loyalty program (per account,
-- per calendar year — base allowance; promo windows can raise but never below
-- this floor, so it is the safe bound for "is this quantity purchasable").
-- src: each program's official Buy Points terms (points.com-administered) +
-- corroborated by loyaltylobby / frequentmiler 2026 buy-points guides.
UPDATE buy_promo_pricing SET max_purchasable_per_year = 100000
  WHERE program_slug = 'aeroplan';      -- Air Canada Aeroplan: 100,000/yr
UPDATE buy_promo_pricing SET max_purchasable_per_year = 240000
  WHERE program_slug = 'hilton';        -- Hilton Honors: 240,000/yr
UPDATE buy_promo_pricing SET max_purchasable_per_year = 55000
  WHERE program_slug = 'hyatt';         -- World of Hyatt: 55,000/yr
UPDATE buy_promo_pricing SET max_purchasable_per_year = 150000
  WHERE program_slug = 'ihg';           -- IHG One Rewards: 150,000/yr (base)
UPDATE buy_promo_pricing SET max_purchasable_per_year = 100000
  WHERE program_slug = 'marriott';      -- Marriott Bonvoy: 100,000/yr

-- ── 2. network_offers.max_credit_cad ────────────────────────────────────────
ALTER TABLE network_offers
  ADD COLUMN IF NOT EXISTS max_credit_cad NUMERIC(10,2);

-- Flat statement_credit offers are already bounded by reward_value (the code
-- never extrapolates them) → leave max_credit_cad NULL.
-- Percentage / bonus_points offers extrapolate with spend and MUST carry a
-- max-credit. These community-sourced offers publish no hard CAD cap, so a
-- conservative realistic per-offer ceiling is set (errs low, disclosed in the
-- stack note) — same philosophy as the optimizer guardrail.
UPDATE network_offers SET max_credit_cad = 50.00
  WHERE reward_type = 'bonus_points' AND merchant_slug = 'apple_ca' AND network = 'amex';
  -- Amex "5x MR at Apple" — Amex Offers cap the bonus; ~$50 value ceiling.
UPDATE network_offers SET max_credit_cad = 100.00
  WHERE reward_type = 'merchant_discount' AND merchant_slug = 'expedia_ca' AND network = 'visa';
  -- Visa "5% off select hotel bookings" — practical per-booking cap ≈ $100.
-- The visa/apple_ca "Free shipping" merchant_discount has reward_value 0 (the
-- code already yields val=0 and skips it) → intentionally left NULL.
