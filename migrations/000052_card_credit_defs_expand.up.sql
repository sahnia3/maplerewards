-- ─────────────────────────────────────────────────────────────────────────────
-- 000052_card_credit_defs_expand — P2.6 "Both"
-- ─────────────────────────────────────────────────────────────────────────────
-- LAUNCH-ISSUES.md P2.6: the Credits & Renewals calendar is empty for ~99% of
-- users because card_credit_defs only covered 5/104 cards (same sparse-seed
-- class as P0.4). Founder chose BOTH fixes:
--   (1) curate real published 2026 annual credits for the major Canadian
--       cards that have them (researched, source-cited per row);
--   (2) let users self-log their own credit on a held card.
--
-- For (2) the global UNIQUE(card_id,name) blocks two users logging the same
-- credit on the same card. Add a nullable user_id (NULL = curated/global,
-- non-NULL = that user's private credit) and split uniqueness into two
-- partial indexes. ListCredits filters to NULL-or-mine so users never see
-- another user's private defs. No inline BEGIN/COMMIT (golang-migrate wraps).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE card_credit_defs DROP CONSTRAINT IF EXISTS card_credit_defs_card_id_name_key;
ALTER TABLE card_credit_defs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_card_credit_defs_global
  ON card_credit_defs (card_id, name) WHERE user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_card_credit_defs_user
  ON card_credit_defs (user_id, card_id, name) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_card_credit_defs_userid
  ON card_credit_defs (user_id) WHERE user_id IS NOT NULL;

-- ── (1) Curated seed — real 2026 Canadian card credits ──────────────────────
-- INSERT…SELECT by exact catalog card name (idempotent, mirrors 000010).
-- VALUES columns: card_name, credit_name, description, value_cad, recurrence,
-- sort_order. user_id stays NULL (curated/global). ON CONFLICT targets the
-- new global partial unique index.
INSERT INTO card_credit_defs (card_id, name, description, value_cad, recurrence, sort_order)
SELECT c.id, v.credit_name, v.description, v.value_cad, v.recurrence, v.sort_order
FROM cards c
JOIN (VALUES
  ('American Express Platinum Business','Travel Credit','$200 annual travel credit on a single eligible $200+ booking via American Express Travel.',200.00,'annual',10),
  ('American Express Platinum Business','NEXUS Credit','Up to $100 statement credit for a NEXUS application/renewal fee, once per 4 years.',100.00,'quadrennial',20),
  ('American Express Platinum Business','Wireless Credit','Up to $10/month ($120/yr) in statement credits on wireless/phone charges.',120.00,'annual',30),
  ('American Express Platinum Business','Dell Credit','Up to $100 per 6-month period ($200/yr) in statement credits at Dell.ca.',200.00,'annual',40),
  ('American Express Aeroplan Reserve','NEXUS Credit','Up to $100 statement credit for a NEXUS application/renewal fee, every 4 years.',100.00,'quadrennial',10),
  ('Amex Aeroplan Business Reserve Card','NEXUS Credit','Up to $100 statement credit for a NEXUS application/renewal fee, every 4 years.',100.00,'quadrennial',10),
  ('American Express Business Edge','Wireless Credit','Up to $10/month ($120/yr) in statement credits on eligible wireless/internet charges.',120.00,'annual',10),
  ('Marriott Bonvoy American Express Card','Annual Free Night','Annual Free Night Award (year 2+), up to a 35,000-point property; conservative CAD value.',250.00,'annual',10),
  ('TD Aeroplan Visa Infinite Privilege','NEXUS Credit','Up to $100 rebate on a NEXUS application/renewal fee, once every 48 months.',100.00,'quadrennial',10),
  ('TD First Class Travel Visa Infinite Privilege','Travel Credit','$100 annual Expedia For TD credit on an eligible $500+ booking.',100.00,'annual',10),
  ('CIBC Aeroplan Visa Infinite Privilege','NEXUS Credit','NEXUS application-fee rebate every 4 years ($160 CAD value per CIBC).',160.00,'quadrennial',10),
  ('CIBC Aventura Visa Infinite Privilege','Travel Credit','$200 annual CIBC Travel (Expedia) credit on eligible travel via CIBC Rewards.',200.00,'annual',10),
  ('CIBC Aventura Visa Infinite Privilege','NEXUS Credit','Up to $200 statement credit for NEXUS application/renewal, once every 4 years.',200.00,'quadrennial',20),
  ('BMO eclipse Visa Infinite','Lifestyle Credit','$50 annual statement credit after a single $50+ purchase; usable on any spend, resets yearly.',50.00,'annual',10),
  ('BMO eclipse Visa Infinite Privilege','Lifestyle Credit','$200 annual statement credit after eligible spend; usable on any purchase, resets yearly.',200.00,'annual',10),
  ('National Bank World Elite Mastercard','Travel Credit','Up to $150/yr reimbursed for eligible travel expenses (parking, baggage, seat, lounge) charged to the card.',150.00,'annual',10)
) AS v(card_name, credit_name, description, value_cad, recurrence, sort_order)
  ON c.name = v.card_name
WHERE c.country = 'CA'
ON CONFLICT (card_id, name) WHERE user_id IS NULL DO NOTHING;
