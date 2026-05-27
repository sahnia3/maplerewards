-- Catalog integrity (2026-05-27): deactivate "Desjardins Remises Visa" — it is the
-- SAME physical card as "Desjardins Cash Back Visa". "Remises" is Desjardins' French
-- word for cash back; the official Cash Back Visa application URL and card artwork are
-- both named "...remises..." (cash-back-visa-application.customCookie.remises.html and
-- vitrine-carte-remises-visa-e.jpg). The "Remises Visa" row is a duplicate carrying
-- inferior data (a flat 0.5% rate vs. the real tiered 2% structure already seeded on
-- "Desjardins Cash Back Visa"). is_active=false removes it from the browse/add catalog;
-- any legacy holder keeps it in-wallet (GetUserCards does not filter card.is_active).
-- Reversible. src: desjardins.com/en/credit-cards/cash-back-visa.html
UPDATE cards SET is_active = false
WHERE is_active = true
  AND name = 'Desjardins Remises Visa';
