-- Reverts 000090_missing_category_multipliers.up.sql. Deletes exactly the four rows inserted,
-- keyed by (card_id, category_id, effective_from = 2026-06-01) so no pre-existing row can be hit.

-- BMO Air Miles Mastercard (...092) groceries
DELETE FROM card_multipliers
WHERE card_id = $$20000000-0000-0000-0000-000000000092$$ AND category_id = $$30000000-0000-0000-0000-000000000001$$
  AND effective_from = DATE $$2026-06-01$$;
-- Scotiabank Platinum American Express (...069) travel
DELETE FROM card_multipliers
WHERE card_id = $$20000000-0000-0000-0000-000000000069$$ AND category_id = $$30000000-0000-0000-0000-000000000003$$
  AND effective_from = DATE $$2026-06-01$$;
-- Scotiabank No-Fee Visa Card (...091) entertainment
DELETE FROM card_multipliers
WHERE card_id = $$20000000-0000-0000-0000-000000000091$$ AND category_id = $$30000000-0000-0000-0000-000000000006$$
  AND effective_from = DATE $$2026-06-01$$;
-- Scotiabank No-Fee Visa Card (...091) groceries
DELETE FROM card_multipliers
WHERE card_id = $$20000000-0000-0000-0000-000000000091$$ AND category_id = $$30000000-0000-0000-0000-000000000001$$
  AND effective_from = DATE $$2026-06-01$$;
-- BMO Ascend World Elite Mastercard (...022) recurring-bills
DELETE FROM card_multipliers
WHERE card_id = $$20000000-0000-0000-0000-000000000022$$ AND category_id = $$30000000-0000-0000-0000-000000000010$$
  AND effective_from = DATE $$2026-06-01$$;
