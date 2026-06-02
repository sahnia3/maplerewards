-- ── Scene+ valuation correction (0.80¢ → 1.00¢) ─────────────────────────────
-- Scene+ is a FIXED-value program: points redeem at 1.0¢ (1,000 pts = $10 in
-- travel/Scene credit). The original seed (000002) understated it at 0.80¢ in
-- BOTH loyalty_programs.base_cpp (used by the recommender) and
-- point_valuations(base) (used by the optimizer/valuation paths), so every
-- Scotiabank/Scene+ card was silently undervalued by ~20%.
--
-- Source: Scene+ program terms (fixed 1¢/pt redemption value); milesopedia and
-- Prince of Travel both value Scene+ at ~1.0¢. Surfaced by the 2026-06-01
-- multi-agent data-integrity audit (docs/DEEP-AUDIT-2026-06-01.md).
--
-- Both UPDATEs are guarded on the current value so a re-run, or a future
-- correction that already moved the cpp, is a safe no-op.

UPDATE loyalty_programs
   SET base_cpp = 1.00
 WHERE slug = 'scene-plus' AND base_cpp = 0.80;

UPDATE point_valuations
   SET cpp = 1.0000
 WHERE loyalty_program_id = '10000000-0000-0000-0000-000000000004'
   AND segment = 'base'
   AND cpp = 0.8000;
