-- Reverse: re-activate the Desjardins Remises Visa duplicate row.
UPDATE cards SET is_active = true
WHERE is_active = false
  AND name = 'Desjardins Remises Visa';
