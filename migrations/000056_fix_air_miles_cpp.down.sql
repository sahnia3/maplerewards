-- Revert the Air Miles base_cpp correction (restore the prior stored value).
UPDATE loyalty_programs
SET base_cpp = 0.1500
WHERE slug = 'air-miles' AND base_cpp = 10.5000;
