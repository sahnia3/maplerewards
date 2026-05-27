-- Reverse: re-activate the Capital One Guaranteed Mastercard.
UPDATE cards SET is_active = true
WHERE is_active = false
  AND name = 'Capital One Guaranteed Mastercard';
