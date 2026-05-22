-- Air Miles base_cpp was stored as 0.1500 (¢/Mile) — a ~70× undervaluation that
-- directly contradicts the knowledge base: internal/knowledge/rewards.yaml
-- air_miles defines cpp_range {low: 10.0, high: 15.0} with in_store_cash.cpp
-- 10.53 (the guaranteed 95-Miles = $10 in-store floor). The bad value made the
-- Loyalty directory show Air Miles at 0.15¢, undervalued any held Air Miles
-- balance ~70×, and mis-ranked every Air Miles-earning card in the optimizer.
--
-- Correct it to the conservative, always-achievable in-store cash floor of
-- 10.5¢/Mile. Guarded on the known-bad value so this is idempotent and a no-op
-- once applied.
UPDATE loyalty_programs
SET base_cpp = 10.5000
WHERE slug = 'air-miles' AND base_cpp = 0.1500;
