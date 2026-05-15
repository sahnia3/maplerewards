-- ── Welcome-bonus OFFER expiry (separate from user-progress deadline) ───────
-- The existing `user_card_bonuses.deadline_at` tracks the *user's* deadline to
-- meet the min-spend after activating the bonus. This new column tracks the
-- *card's public offer* deadline — e.g. "RBC ION+ 21K welcome bonus available
-- through May 6 2026, then reverts." Without it we can't warn users to apply
-- before time-limited promotional offers close.

ALTER TABLE cards
    ADD COLUMN IF NOT EXISTS welcome_bonus_offer_expires_at DATE,
    ADD COLUMN IF NOT EXISTS welcome_bonus_offer_source TEXT;

CREATE INDEX IF NOT EXISTS idx_cards_welcome_expires
    ON cards(welcome_bonus_offer_expires_at)
    WHERE welcome_bonus_offer_expires_at IS NOT NULL;

-- Seed known active promo windows from the April 2026 Reddit/issuer-page
-- intel pass. Update this list when offers refresh.
UPDATE cards SET
    welcome_bonus_offer_expires_at = DATE '2026-05-06',
    welcome_bonus_offer_source     = 'https://www.rbcroyalbank.com/credit-cards/rewards/rbc-ion-plus-visa.html'
    WHERE name ILIKE '%RBC ION+%';

UPDATE cards SET
    welcome_bonus_offer_expires_at = DATE '2026-04-30',
    welcome_bonus_offer_source     = 'https://www.scotiawealthmanagement.com/ca/en/services/private-banking/credit-cards/visa/passport-infinite-privilege-card.html'
    WHERE name ILIKE '%Scotiabank Passport%Privilege%';

UPDATE cards SET
    welcome_bonus_offer_expires_at = DATE '2026-10-31',
    welcome_bonus_offer_source     = 'https://frugalflyer.ca/blog/new-bmo-credit-card-offers/'
    WHERE name ILIKE '%BMO Eclipse%';
