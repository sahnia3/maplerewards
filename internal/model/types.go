package model

import "time"

// ── Loyalty Programs ────────────────────────────────────────────────────────

type LoyaltyProgram struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Slug         string    `json:"slug"`
	CurrencyName string    `json:"currency_name"`
	ProgramType  string    `json:"program_type"` // airline | bank | hotel | cashback
	BaseCPP      float64   `json:"base_cpp"`     // cents per point
	IsActive     bool      `json:"is_active"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// ── Cards ────────────────────────────────────────────────────────────────────

type Card struct {
	ID                   string          `json:"id"`
	Name                 string          `json:"name"`
	Issuer               string          `json:"issuer"`
	Network              string          `json:"network"` // visa | mastercard | amex
	LoyaltyProgramID     string          `json:"loyalty_program_id"`
	LoyaltyProgram       *LoyaltyProgram `json:"loyalty_program,omitempty"`
	AnnualFee            float64         `json:"annual_fee"`
	WelcomeBonusPoints   int             `json:"welcome_bonus_points"`
	WelcomeBonusMinSpend float64         `json:"welcome_bonus_min_spend"`
	WelcomeBonusMonths   int             `json:"welcome_bonus_months"`
	IsActive             bool            `json:"is_active"`
	CreatedAt            time.Time       `json:"created_at"`
}

// ── Categories ───────────────────────────────────────────────────────────────

type Category struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Slug     string  `json:"slug"`
	ParentID *string `json:"parent_id,omitempty"`
	MCCCodes []int32 `json:"mcc_codes"`
}

// ── Multipliers ──────────────────────────────────────────────────────────────

type CardMultiplier struct {
	ID               string   `json:"id"`
	CardID           string   `json:"card_id"`
	CategoryID       string   `json:"category_id"`
	EarnRate         float64  `json:"earn_rate"`
	EarnType         string   `json:"earn_type"` // points | cashback_pct | miles | dollars
	CapAmount        *float64 `json:"cap_amount,omitempty"`
	CapPeriod        *string  `json:"cap_period,omitempty"` // monthly | annual
	FallbackEarnRate float64  `json:"fallback_earn_rate"`
	Notes            string   `json:"notes,omitempty"`
}

// ── Users & Wallet ───────────────────────────────────────────────────────────

type User struct {
	ID        string    `json:"id"`
	Email     *string   `json:"email,omitempty"`
	SessionID string    `json:"session_id"`
	CreatedAt time.Time `json:"created_at"`
}

type UserCard struct {
	ID           string    `json:"id"`
	UserID       string    `json:"user_id"`
	CardID       string    `json:"card_id"`
	Card         *Card     `json:"card,omitempty"`
	PointBalance int64     `json:"point_balance"`
	AddedAt      time.Time `json:"added_at"`
}

// ── Transfer Partners ────────────────────────────────────────────────────────

type TransferPartner struct {
	ID                string          `json:"id"`
	FromProgramID     string          `json:"from_program_id"`
	FromProgram       *LoyaltyProgram `json:"from_program,omitempty"`
	ToProgramID       string          `json:"to_program_id"`
	ToProgram         *LoyaltyProgram `json:"to_program,omitempty"`
	TransferRatio     float64         `json:"transfer_ratio"`    // 1.0 = 1:1
	MinimumTransfer   int             `json:"minimum_transfer"`
	TransferIncrement int             `json:"transfer_increment"`
	ProcessingDays    int             `json:"processing_days"`
	IsActive          bool            `json:"is_active"`
	Notes             string          `json:"notes,omitempty"`
}

// ── Optimizer ────────────────────────────────────────────────────────────────

type OptimizeRequest struct {
	SessionID    string  `json:"session_id"`
	CategorySlug string  `json:"category_slug"`
	SpendAmount  float64 `json:"spend_amount"`
	MCCCode      *int    `json:"mcc_code,omitempty"`
}

type CardRecommendation struct {
	CardID          string  `json:"card_id"`
	CardName        string  `json:"card_name"`
	ProgramName     string  `json:"program_name"`
	EarnRate        float64 `json:"earn_rate"`
	ProgramCPP      float64 `json:"program_cpp"`
	EffectiveReturn float64 `json:"effective_return"` // % cash-back equivalent
	PointsEarned    float64 `json:"points_earned"`
	DollarValue     float64 `json:"dollar_value"` // CAD
	IsCapHit        bool    `json:"is_cap_hit"`
	Note            string  `json:"note,omitempty"`
}
