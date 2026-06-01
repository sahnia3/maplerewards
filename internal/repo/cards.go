package repo

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"maplerewards/internal/model"
)

type CardRepo struct {
	db *pgxpool.Pool
}

func NewCardRepo(db *pgxpool.Pool) *CardRepo {
	return &CardRepo{db: db}
}

func (r *CardRepo) ListCards(ctx context.Context) ([]model.Card, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			c.id, c.name, c.issuer, c.network, c.loyalty_program_id,
			c.annual_fee, c.welcome_bonus_points, c.welcome_bonus_min_spend,
			c.welcome_bonus_months,
			c.welcome_bonus_offer_expires_at, c.welcome_bonus_offer_source,
			c.affiliate_url,
			c.is_active, c.created_at,
			lp.id, lp.name, lp.slug, lp.currency_name, lp.program_type,
			lp.base_cpp, lp.is_active, lp.updated_at
		FROM cards c
		JOIN loyalty_programs lp ON lp.id = c.loyalty_program_id
		WHERE c.is_active = true
		ORDER BY c.issuer, c.name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cards []model.Card
	for rows.Next() {
		var c model.Card
		var offerExpiresAt *time.Time
		c.LoyaltyProgram = &model.LoyaltyProgram{}
		if err := rows.Scan(
			&c.ID, &c.Name, &c.Issuer, &c.Network, &c.LoyaltyProgramID,
			&c.AnnualFee, &c.WelcomeBonusPoints, &c.WelcomeBonusMinSpend,
			&c.WelcomeBonusMonths,
			&offerExpiresAt, &c.WelcomeBonusOfferSource,
			&c.AffiliateURL,
			&c.IsActive, &c.CreatedAt,
			&c.LoyaltyProgram.ID, &c.LoyaltyProgram.Name, &c.LoyaltyProgram.Slug,
			&c.LoyaltyProgram.CurrencyName, &c.LoyaltyProgram.ProgramType,
			&c.LoyaltyProgram.BaseCPP, &c.LoyaltyProgram.IsActive, &c.LoyaltyProgram.UpdatedAt,
		); err != nil {
			return nil, err
		}
		if offerExpiresAt != nil {
			s := offerExpiresAt.Format("2006-01-02")
			c.WelcomeBonusOfferExpiresAt = &s
		}
		cards = append(cards, c)
	}
	return cards, rows.Err()
}

// DowngradeCandidates returns active cards from the same issuer and loyalty
// program with a lower annual fee than belowFee, excluding excludeCardID. Used by
// the renewal optimizer to suggest product-change / downgrade targets.
func (r *CardRepo) DowngradeCandidates(ctx context.Context, issuer, loyaltyProgramID string, belowFee float64, excludeCardID string) ([]model.Card, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, name, issuer, annual_fee
		FROM cards
		WHERE is_active = true
		  AND issuer = $1
		  AND loyalty_program_id = $2
		  AND annual_fee < $3
		  AND id <> $4
		ORDER BY annual_fee ASC, name
		LIMIT 3
	`, issuer, loyaltyProgramID, belowFee, excludeCardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []model.Card
	for rows.Next() {
		var c model.Card
		if err := rows.Scan(&c.ID, &c.Name, &c.Issuer, &c.AnnualFee); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *CardRepo) GetCard(ctx context.Context, id string) (*model.Card, error) {
	c := &model.Card{LoyaltyProgram: &model.LoyaltyProgram{}}
	var offerExpiresAt *time.Time
	// Accept either a UUID OR a name-derived slug (lower-case, spaces→dashes).
	// The cards table doesn't have a dedicated slug column, so we derive one
	// inline. This unlocks readable URLs like /compare/amex-cobalt/scotia-gold
	// without a migration.
	err := r.db.QueryRow(ctx, `
		SELECT
			c.id, c.name, c.issuer, c.network, c.loyalty_program_id,
			c.annual_fee, c.welcome_bonus_points, c.welcome_bonus_min_spend,
			c.welcome_bonus_months,
			c.welcome_bonus_offer_expires_at, c.welcome_bonus_offer_source,
			c.affiliate_url,
			c.is_active, c.created_at,
			lp.id, lp.name, lp.slug, lp.currency_name, lp.program_type,
			lp.base_cpp, lp.is_active, lp.updated_at
		FROM cards c
		JOIN loyalty_programs lp ON lp.id = c.loyalty_program_id
		WHERE c.id::text = $1
		   OR lower(regexp_replace(c.name, '[^a-zA-Z0-9]+', '-', 'g')) = lower($1)
		LIMIT 1
	`, id).Scan(
		&c.ID, &c.Name, &c.Issuer, &c.Network, &c.LoyaltyProgramID,
		&c.AnnualFee, &c.WelcomeBonusPoints, &c.WelcomeBonusMinSpend,
		&c.WelcomeBonusMonths,
		&offerExpiresAt, &c.WelcomeBonusOfferSource,
		&c.AffiliateURL,
		&c.IsActive, &c.CreatedAt,
		&c.LoyaltyProgram.ID, &c.LoyaltyProgram.Name, &c.LoyaltyProgram.Slug,
		&c.LoyaltyProgram.CurrencyName, &c.LoyaltyProgram.ProgramType,
		&c.LoyaltyProgram.BaseCPP, &c.LoyaltyProgram.IsActive, &c.LoyaltyProgram.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if offerExpiresAt != nil {
		s := offerExpiresAt.Format("2006-01-02")
		c.WelcomeBonusOfferExpiresAt = &s
	}
	return c, nil
}

func (r *CardRepo) ListCategories(ctx context.Context) ([]model.Category, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, name, slug, parent_id, mcc_codes
		FROM categories ORDER BY name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cats []model.Category
	for rows.Next() {
		var c model.Category
		if err := rows.Scan(&c.ID, &c.Name, &c.Slug, &c.ParentID, &c.MCCCodes); err != nil {
			return nil, err
		}
		cats = append(cats, c)
	}
	return cats, rows.Err()
}

func (r *CardRepo) GetCategoryBySlug(ctx context.Context, slug string) (*model.Category, error) {
	c := &model.Category{}
	err := r.db.QueryRow(ctx, `
		SELECT id, name, slug, parent_id, mcc_codes
		FROM categories WHERE slug = $1
	`, slug).Scan(&c.ID, &c.Name, &c.Slug, &c.ParentID, &c.MCCCodes)
	if err != nil {
		return nil, fmt.Errorf("category %q: %w", slug, err)
	}
	return c, nil
}

func (r *CardRepo) GetCategoryByMCC(ctx context.Context, mcc int) (*model.Category, error) {
	c := &model.Category{}
	err := r.db.QueryRow(ctx, `
		SELECT id, name, slug, parent_id, mcc_codes
		FROM categories WHERE $1 = ANY(mcc_codes)
		LIMIT 1
	`, mcc).Scan(&c.ID, &c.Name, &c.Slug, &c.ParentID, &c.MCCCodes)
	if err != nil {
		return nil, fmt.Errorf("mcc %d: %w", mcc, err)
	}
	return c, nil
}

// GetMultiplierForCard returns the active multiplier for a card+category pair.
// Returns pgx.ErrNoRows if none is configured (caller should default to 1x).
func (r *CardRepo) GetMultiplierForCard(ctx context.Context, cardID, categoryID string) (*model.CardMultiplier, error) {
	m := &model.CardMultiplier{}
	err := r.db.QueryRow(ctx, `
		SELECT id, card_id, category_id, earn_rate, earn_type,
		       cap_amount, cap_period, fallback_earn_rate, COALESCE(notes, '')
		FROM card_multipliers
		WHERE card_id = $1
		  AND category_id = $2
		  AND effective_from <= CURRENT_DATE
		  AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
		ORDER BY effective_from DESC
		LIMIT 1
	`, cardID, categoryID).Scan(
		&m.ID, &m.CardID, &m.CategoryID, &m.EarnRate, &m.EarnType,
		&m.CapAmount, &m.CapPeriod, &m.FallbackEarnRate, &m.Notes,
	)
	if err != nil {
		return nil, err
	}
	return m, nil
}

// ListMultipliersForCard returns all active multipliers for a card with category info.
func (r *CardRepo) ListMultipliersForCard(ctx context.Context, cardID string) ([]model.MultiplierRow, error) {
	rows, err := r.db.Query(ctx, `
		SELECT c.name, c.slug, m.earn_rate, m.earn_type,
		       m.cap_amount, m.cap_period, COALESCE(m.notes, '')
		FROM card_multipliers m
		JOIN categories c ON c.id = m.category_id
		WHERE m.card_id = $1
		  AND m.effective_from <= CURRENT_DATE
		  AND (m.effective_to IS NULL OR m.effective_to >= CURRENT_DATE)
		ORDER BY m.earn_rate DESC, c.name
	`, cardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var multipliers []model.MultiplierRow
	for rows.Next() {
		var m model.MultiplierRow
		if err := rows.Scan(&m.CategoryName, &m.CategorySlug, &m.EarnRate, &m.EarnType,
			&m.CapAmount, &m.CapPeriod, &m.Notes); err != nil {
			return nil, err
		}
		multipliers = append(multipliers, m)
	}
	return multipliers, rows.Err()
}

// ListPrograms returns all active loyalty programs.
func (r *CardRepo) ListPrograms(ctx context.Context) ([]model.LoyaltyProgram, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, name, slug, currency_name, program_type, base_cpp, country, is_active, updated_at
		FROM loyalty_programs
		WHERE is_active = true
		ORDER BY program_type, name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var programs []model.LoyaltyProgram
	for rows.Next() {
		var p model.LoyaltyProgram
		if err := rows.Scan(&p.ID, &p.Name, &p.Slug, &p.CurrencyName, &p.ProgramType,
			&p.BaseCPP, &p.Country, &p.IsActive, &p.UpdatedAt); err != nil {
			return nil, err
		}
		programs = append(programs, p)
	}
	return programs, rows.Err()
}

// GetProgramBySlug returns a loyalty program by slug.
func (r *CardRepo) GetProgramBySlug(ctx context.Context, slug string) (*model.LoyaltyProgram, error) {
	p := &model.LoyaltyProgram{}
	err := r.db.QueryRow(ctx, `
		SELECT id, name, slug, currency_name, program_type, base_cpp, country, is_active, updated_at
		FROM loyalty_programs WHERE slug = $1
	`, slug).Scan(&p.ID, &p.Name, &p.Slug, &p.CurrencyName, &p.ProgramType,
		&p.BaseCPP, &p.Country, &p.IsActive, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return p, nil
}

// GetEverythingElseMultiplier returns the base catch-all multiplier for a card.
func (r *CardRepo) GetEverythingElseMultiplier(ctx context.Context, cardID string) (*model.CardMultiplier, error) {
	cat := &model.Category{}
	if err := r.db.QueryRow(ctx,
		`SELECT id FROM categories WHERE slug = 'everything-else'`,
	).Scan(&cat.ID); err != nil {
		return nil, err
	}
	m, err := r.GetMultiplierForCard(ctx, cardID, cat.ID)
	if err != nil && err != pgx.ErrNoRows {
		return nil, err
	}
	if m == nil {
		// absolute fallback: 1x points
		return &model.CardMultiplier{EarnRate: 1.0, EarnType: "points", FallbackEarnRate: 1.0}, nil
	}
	return m, nil
}
