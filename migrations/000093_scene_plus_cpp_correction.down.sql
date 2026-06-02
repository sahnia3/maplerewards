-- Revert the Scene+ valuation correction (1.00¢ → 0.80¢). Guarded so it only
-- reverts the exact values this migration set, in reverse order of the up.

UPDATE point_valuations
   SET cpp = 0.8000
 WHERE loyalty_program_id = '10000000-0000-0000-0000-000000000004'
   AND segment = 'base'
   AND cpp = 1.0000;

UPDATE loyalty_programs
   SET base_cpp = 0.80
 WHERE slug = 'scene-plus' AND base_cpp = 1.00;
