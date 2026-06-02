-- TD Cash Back Visa Card (...062) loyalty reassignment: td-rewards -> td-cash-back.
--
-- Sibling fix to 000091: the TD Cash Back Visa Infinite (...011) was reassigned to the
-- new td-cash-back cashback program in 091, but the no-fee TD Cash Back Visa Card
-- (...062) carried the same td-rewards mislabel and was outside 091's finding scope
-- (flagged in 000089_STRUCTURAL_REPORT.md, "Out-of-scope items"). It earns TD Cash Back
-- Dollars (direct cash back), not transferable TD Rewards points.
-- Prior value pinned in WHERE, so this is a safe no-op if the data has drifted.
--
-- NOTE — Neo Secured Mastercard (...088) annual_fee was DELIBERATELY LEFT at $96 (not
-- reverted to $0 as a separate audit suggested): Neo Secured has no stated "annual fee"
-- but a $7.99/month Build-membership fee = $95.88/yr real holding cost, waived only with
-- ~$5,000 in Neo savings. Modelling it as $96 keeps the optimizer's net-value honest;
-- $0 would hide a real recurring cost. Sources: loanscanada.ca, nerdwallet.com/ca,
-- milesopedia.com. No change emitted for it here.

UPDATE cards
   SET loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$td-cash-back$$)
 WHERE id = $$20000000-0000-0000-0000-000000000062$$
   AND loyalty_program_id = (SELECT id FROM loyalty_programs WHERE slug = $$td-rewards$$);
