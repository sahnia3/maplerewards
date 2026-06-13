-- Fix self-contradictory Costco Canada acceptance flags (QA 2026-06-12, P1-8).
-- The merchant row carried accepts_visa = true alongside its own note
-- "Mastercard-only checkout in Canada". In-warehouse Costco Canada accepts
-- Mastercard only (Visa-only is the US arrangement), so accepts_visa must be
-- false like accepts_amex. Guarded on the current value; a re-run is a no-op.

UPDATE merchants
   SET accepts_visa = false
 WHERE slug = 'costco_ca' AND accepts_visa = true;
