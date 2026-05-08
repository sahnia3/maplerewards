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
	Country      string    `json:"country"`      // ISO 3166-1 alpha-2 (CA, US, etc.)
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
	Country              string          `json:"country"` // ISO 3166-1 alpha-2 (CA, US, etc.)
	IsActive             bool            `json:"is_active"`
	CreatedAt            time.Time       `json:"created_at"`
}

// ── Welcome Bonus Tracking ───────────────────────────────────────────────────

type WelcomeBonus struct {
	ID           string  `json:"id"`
	UserID       string  `json:"user_id"`
	CardID       string  `json:"card_id"`
	CardName     string  `json:"card_name,omitempty"`
	CardIssuer   string  `json:"card_issuer,omitempty"`
	ActivatedAt  string  `json:"activated_at"`
	DeadlineAt   string  `json:"deadline_at"`
	MinSpend     float64 `json:"min_spend"`
	CurrentSpend float64 `json:"current_spend"`
	BonusPoints  int     `json:"bonus_points"`
	IsCompleted  bool    `json:"is_completed"`
	CompletedAt  *string `json:"completed_at,omitempty"`
	Progress     float64 `json:"progress"` // 0.0 - 1.0
	DaysLeft     int     `json:"days_left"`
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
	ID               string    `json:"id"`
	Email            *string   `json:"email,omitempty"`
	SessionID        string    `json:"session_id"`
	PasswordHash     *string   `json:"-"`
	GoogleID         *string   `json:"google_id,omitempty"`
	DisplayName      *string   `json:"display_name,omitempty"`
	IsPro            bool      `json:"is_pro"`
	AuthProvider     string    `json:"auth_provider"`
	StripeCustomerID *string   `json:"stripe_customer_id,omitempty"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

// ── Billing ─────────────────────────────────────────────────────────────────

type CheckoutSession struct {
	SessionID string `json:"session_id"`
	URL       string `json:"url"`
}

type CreateCheckoutRequest struct {
	Interval string `json:"interval"` // "monthly" or "annual"
}

// ── Auth ────────────────────────────────────────────────────────────────────

type TokenPair struct {
	AccessToken  string    `json:"access_token"`
	RefreshToken string    `json:"refresh_token"`
	ExpiresAt    time.Time `json:"expires_at"`
	User         User      `json:"user"`
}

type RefreshToken struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	TokenHash string    `json:"-"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
	RevokedAt *time.Time `json:"revoked_at,omitempty"`
}

type RegisterRequest struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
	SessionID   string `json:"session_id,omitempty"` // to merge anonymous data
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type GoogleAuthRequest struct {
	GoogleToken string `json:"google_token"`
	SessionID   string `json:"session_id,omitempty"` // to merge anonymous data
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

type UpdateProfileRequest struct {
	DisplayName string `json:"display_name,omitempty"`
}

type UserCard struct {
	ID               string    `json:"id"`
	UserID           string    `json:"user_id"`
	CardID           string    `json:"card_id"`
	Card             *Card     `json:"card,omitempty"`
	PointBalance     int64     `json:"point_balance"`
	AddedAt          time.Time `json:"added_at"`
	Nickname         *string   `json:"nickname,omitempty"`
	PointsExpiryDate *string   `json:"points_expiry_date,omitempty"`
	DateOpened       *string   `json:"date_opened,omitempty"`
	HasAnnualFee     bool      `json:"has_annual_fee"`
	CustomAnnualFee  *float64  `json:"custom_annual_fee,omitempty"`
}

type UpdateCardDetailsRequest struct {
	PointBalance     *int64   `json:"point_balance,omitempty"`
	Nickname         *string  `json:"nickname,omitempty"`
	PointsExpiryDate *string  `json:"points_expiry_date,omitempty"`
	DateOpened       *string  `json:"date_opened,omitempty"`
	HasAnnualFee     *bool    `json:"has_annual_fee,omitempty"`
	CustomAnnualFee  *float64 `json:"custom_annual_fee,omitempty"`
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

// ── Spend Tracking ──────────────────────────────────────────────────────────

type SpendEntry struct {
	ID           string  `json:"id"`
	UserID       string  `json:"user_id"`
	CardID       string  `json:"card_id"`
	CardName     string  `json:"card_name,omitempty"`
	CategoryID   string  `json:"category_id"`
	CategorySlug string  `json:"category_slug,omitempty"`
	CategoryName string  `json:"category_name,omitempty"`
	Amount       float64 `json:"amount"`
	PointsEarned float64 `json:"points_earned"`
	DollarValue  float64 `json:"dollar_value"`
	SpentAt      string  `json:"spent_at"`
	CreatedAt    string  `json:"created_at,omitempty"`
	Note         string  `json:"note,omitempty"`
}

type SpendLogRequest struct {
	CardID       string  `json:"card_id"`
	CategorySlug string  `json:"category_slug"`
	Amount       float64 `json:"amount"`
	Date         string  `json:"date,omitempty"` // YYYY-MM-DD, defaults to today
	Note         string  `json:"note,omitempty"`
}

type SpendStats struct {
	TotalSpend  float64        `json:"total_spend"`
	TotalValue  float64        `json:"total_value"`
	TotalPoints float64        `json:"total_points"`
	EntryCount  int            `json:"entry_count"`
	AvgReturn   float64        `json:"avg_return"`
	ByCategory  []CategoryStat `json:"by_category"`
	ByCard      []CardStat     `json:"by_card"`
}

type CategoryStat struct {
	CategoryName string  `json:"category_name"`
	TotalSpend   float64 `json:"total_spend"`
	TotalValue   float64 `json:"total_value"`
	EntryCount   int     `json:"entry_count"`
}

type CardStat struct {
	CardName   string  `json:"card_name"`
	TotalSpend float64 `json:"total_spend"`
	TotalValue float64 `json:"total_value"`
	AvgReturn  float64 `json:"avg_return"`
}

type CapGroup struct {
	ID          string   `json:"id"`
	CardID      string   `json:"card_id"`
	Name        string   `json:"name"`
	CapAmount   float64  `json:"cap_amount"`
	CapPeriod   string   `json:"cap_period"`
	CategoryIDs []string `json:"category_ids"`
}

// ── Wallet Summary ───────────────────────────────────────────────────────────

type CardSummaryItem struct {
	CardID              string  `json:"card_id"`
	CardName            string  `json:"card_name"`
	Issuer              string  `json:"issuer"`
	Network             string  `json:"network"`
	PointBalance        int64   `json:"point_balance"`
	ProgramName         string  `json:"program_name"`
	BaseCPP             float64 `json:"base_cpp"`
	ValueLow            float64 `json:"value_low"`
	ValueHigh           float64 `json:"value_high"`
	BestTransferPartner string  `json:"best_transfer_partner,omitempty"`
	BestTransferCPP     float64 `json:"best_transfer_cpp,omitempty"`
}

type WalletSummary struct {
	TotalPoints    int64             `json:"total_points"`
	ValueRangeLow  float64           `json:"value_range_low"`
	ValueRangeHigh float64           `json:"value_range_high"`
	Cards          []CardSummaryItem `json:"cards"`
}

// ── Card Detail ───────────────────────────────────────────────────────────────

type MultiplierRow struct {
	CategoryName string   `json:"category_name"`
	CategorySlug string   `json:"category_slug"`
	EarnRate     float64  `json:"earn_rate"`
	EarnType     string   `json:"earn_type"`
	CapAmount    *float64 `json:"cap_amount,omitempty"`
	CapPeriod    *string  `json:"cap_period,omitempty"`
	Notes        string   `json:"notes,omitempty"`
}

type CardDetail struct {
	Card             Card              `json:"card"`
	Multipliers      []MultiplierRow   `json:"multipliers"`
	TransferPartners []TransferPartner `json:"transfer_partners"`
	ValueRangeLow    float64           `json:"value_range_low"`
	ValueRangeHigh   float64           `json:"value_range_high"`
}

// ── Chat / AI ────────────────────────────────────────────────────────────────

type ChatMessage struct {
	Role    string `json:"role"`    // "user" or "assistant"
	Content string `json:"content"`
}

// ── Optimizer ────────────────────────────────────────────────────────────────

type OptimizeRequest struct {
	SessionID         string  `json:"session_id"`
	CategorySlug      string  `json:"category_slug"`
	SpendAmount       float64 `json:"spend_amount"`
	MCCCode           *int    `json:"mcc_code,omitempty"`
	RedemptionSegment string  `json:"redemption_segment,omitempty"` // "base" (default) or "business"
	// Merchant is an optional merchant slug that triggers network-routing rules.
	// "costco_ca" → only Mastercard cards eligible (Costco Canada accepts MC only since 2014).
	Merchant string `json:"merchant,omitempty"`
}

type CardRecommendation struct {
	CardID            string  `json:"card_id"`
	CardName          string  `json:"card_name"`
	ProgramName       string  `json:"program_name"`
	EarnRate          float64 `json:"earn_rate"`
	ProgramCPP        float64 `json:"program_cpp"`
	EffectiveReturn   float64 `json:"effective_return"` // % cash-back equivalent
	PointsEarned      float64 `json:"points_earned"`
	DollarValue       float64 `json:"dollar_value"` // CAD
	IsCapHit          bool    `json:"is_cap_hit"`
	Note              string  `json:"note,omitempty"`
	TransferPartner   string  `json:"transfer_partner,omitempty"`
	TransferRatio     float64 `json:"transfer_ratio,omitempty"`
	TransferCPP       float64 `json:"transfer_cpp,omitempty"`
	RedemptionSegment string  `json:"redemption_segment,omitempty"`
}

// ── Portfolio Analysis ──────────────────────────────────────────────────────

type PortfolioAnalysis struct {
	FeeROI      []CardFeeROI      `json:"fee_roi"`
	DollarGap   DollarGapAnalysis `json:"dollar_gap"`
	Utilization UtilizationScore  `json:"utilization"`
}

type CardFeeROI struct {
	CardID         string  `json:"card_id"`
	CardName       string  `json:"card_name"`
	AnnualFee      float64 `json:"annual_fee"`
	ValueEarned    float64 `json:"value_earned"`
	TotalSpend     float64 `json:"total_spend"`
	AvgReturn      float64 `json:"avg_return"`      // percentage
	NetROI         float64 `json:"net_roi"`          // value_earned - annual_fee
	BreakevenSpend float64 `json:"breakeven_spend"`  // monthly spend needed to justify fee
}

type DollarGapAnalysis struct {
	TotalActualValue  float64    `json:"total_actual_value"`
	TotalOptimalValue float64    `json:"total_optimal_value"`
	TotalGap          float64    `json:"total_gap"`
	Entries           []GapEntry `json:"entries"`
}

type GapEntry struct {
	CategoryName string  `json:"category_name"`
	CardUsed     string  `json:"card_used"`
	OptimalCard  string  `json:"optimal_card"`
	ActualValue  float64 `json:"actual_value"`
	OptimalValue float64 `json:"optimal_value"`
	Gap          float64 `json:"gap"`
	TotalSpend   float64 `json:"total_spend"`
}

type UtilizationScore struct {
	Score             float64       `json:"score"` // 0.0 - 1.0
	CoveredCategories int           `json:"covered_categories"`
	TotalCategories   int           `json:"total_categories"`
	Gaps              []CategoryGap `json:"gaps"`
}

type CategoryGap struct {
	CategoryName     string  `json:"category_name"`
	BestCardInWallet string  `json:"best_card_in_wallet"`
	WalletReturn     float64 `json:"wallet_return"` // effective % return
	IsCovered        bool    `json:"is_covered"`
}

// ── Award Search (POST /api/v1/trip/award-search) ────────────────────────────

// AwardSearchRequest is the request body for the award search endpoint.
type AwardSearchRequest struct {
	SessionID   string `json:"session_id"`
	Origin      string `json:"origin"`
	Destination string `json:"destination"`
	Date        string `json:"date"`      // YYYY-MM-DD — center date
	FlexDays    int    `json:"flex_days"` // ±days around Date (default 0)
	Cabin       string `json:"cabin"`     // economy|business|first
	Passengers  int    `json:"passengers"` // default 1
}

// AwardSearchResult is one redemption option from the award search endpoint.
type AwardSearchResult struct {
	Date            string             `json:"date"`
	Program         string             `json:"program"`           // issuer slug (e.g. "aeroplan")
	ProgramName     string             `json:"program_name"`
	PointsCost      int                `json:"points_cost"`
	TaxesCash       float64            `json:"taxes_cash"`
	CashPriceCAD    float64            `json:"cash_price_cad"`
	CPP             float64            `json:"cpp"`               // cents per point
	ValueRating     string             `json:"value_rating"`      // "excellent"|"good"|"poor"
	SeatsAvailable  int                `json:"seats_available"`
	Source          string             `json:"source"`            // "live" | "estimated"
	BookingURL      string             `json:"booking_url"`
	PointsAvailable int64              `json:"points_available"`  // from user's wallet
	CanAfford       bool               `json:"can_afford"`
	CardBreakdowns  []CardContribution `json:"card_breakdowns"`
	Segments        []AwardSegmentInfo `json:"segments"`
}

// AwardSegmentInfo is one flight leg within an award itinerary.
type AwardSegmentInfo struct {
	Origin        string `json:"origin"`
	Destination   string `json:"destination"`
	Airline       string `json:"airline"`
	FlightNumber  string `json:"flight_number"`
	DepartureTime string `json:"departure_time"`
	ArrivalTime   string `json:"arrival_time"`
	Aircraft      string `json:"aircraft"`
}

// ── Trip Planner ────────────────────────────────────────────────────────────

type TripRequest struct {
	SessionID    string `json:"session_id"`
	Origin       string `json:"origin"`
	Destination  string `json:"destination"`
	Cabin        string `json:"cabin"`         // economy | business | first
	TripType     string `json:"trip_type"`     // "flight" | "hotel"
	Date         string `json:"date"`          // YYYY-MM-DD departure / check-in
	CheckoutDate string `json:"checkout_date"` // hotels only
	Passengers   int    `json:"passengers"`    // default 1
	Nights       int    `json:"nights"`        // hotels only (computed server-side)
}

type RedemptionOption struct {
	ProgramName     string  `json:"program_name"`
	ProgramSlug     string  `json:"program_slug"`
	PointsAvailable int64   `json:"points_available"`
	EstimatedCPP    float64 `json:"estimated_cpp"`
	EstimatedValue  float64 `json:"estimated_value"`
	TransferPath    string  `json:"transfer_path"` // "Direct" or "Amex MR → Aeroplan"
	TransferRatio   float64 `json:"transfer_ratio"`
	BookingURL      string  `json:"booking_url"`
	Notes           string  `json:"notes"`

	PointsRequired  int64              `json:"points_required"`
	CanAfford       bool               `json:"can_afford"`
	SavingsRating   string             `json:"savings_rating"`   // "good"|"fair"|"bad"
	ValuePerPoint   float64            `json:"value_per_point"`
	PropertiesCount int                `json:"properties_count"`
	CardBreakdowns  []CardContribution `json:"card_breakdowns"`

	CashPriceCAD  float64 `json:"cash_price_cad"`  // Real cash price for comparison
	DataSource    string  `json:"data_source"`     // "live_search" | "knowledge_base" | "estimated"
	PropertyName  string  `json:"property_name"`   // Hotels: specific property name
	HotelCategory int     `json:"hotel_category"`  // Hotels: category/tier number
	AirlineName   string  `json:"airline_name"`    // Flights: airline name (e.g. "Air Canada")
}

// CardContribution shows how a specific card contributes to a redemption
type CardContribution struct {
	CardName            string  `json:"card_name"`
	CardID              string  `json:"card_id"`
	ProgramName         string  `json:"program_name"`
	PointsHeld          int64   `json:"points_held"`
	TransferRatio       float64 `json:"transfer_ratio"`
	PointsAfterTransfer int64   `json:"points_after_transfer"`
}

// ── Missed Rewards Reports ──────────────────────────────────────────────────

// MissedRewardEntry is one logged spend that would have earned more on a different card.
type MissedRewardEntry struct {
	SpendEntryID    string  `json:"spend_entry_id"`
	SpentAt         string  `json:"spent_at"`
	CategorySlug    string  `json:"category_slug"`
	CategoryName    string  `json:"category_name"`
	Amount          float64 `json:"amount"`
	ActualCardID    string  `json:"actual_card_id"`
	ActualCardName  string  `json:"actual_card_name"`
	ActualValue     float64 `json:"actual_value"`     // CAD earned on the card used
	OptimalCardID   string  `json:"optimal_card_id"`
	OptimalCardName string  `json:"optimal_card_name"`
	OptimalValue    float64 `json:"optimal_value"`    // CAD that would have been earned
	Gap             float64 `json:"gap"`              // optimal_value − actual_value (CAD)
}

// CategoryMissed is per-category aggregate of missed rewards.
type CategoryMissed struct {
	CategorySlug    string  `json:"category_slug"`
	CategoryName    string  `json:"category_name"`
	TotalSpend      float64 `json:"total_spend"`
	ActualValue     float64 `json:"actual_value"`
	OptimalValue    float64 `json:"optimal_value"`
	Gap             float64 `json:"gap"`
	OptimalCardName string  `json:"optimal_card_name"` // most-frequent optimal card for category
	EntryCount      int     `json:"entry_count"`
	MissedCount     int     `json:"missed_count"`
}

// MissedRewardsReport is the full output of GET /wallet/{sid}/missed-rewards.
type MissedRewardsReport struct {
	Since           string              `json:"since"`            // ISO date floor
	TotalSpend      float64             `json:"total_spend"`
	TotalActual     float64             `json:"total_actual_value"`
	TotalOptimal    float64             `json:"total_optimal_value"`
	TotalGap        float64             `json:"total_gap"`
	EntryCount      int                 `json:"entry_count"`
	MissedCount     int                 `json:"missed_count"`
	ByCategory      []CategoryMissed    `json:"by_category"`
	TopMissed       []MissedRewardEntry `json:"top_missed"` // top N entries by gap
	WalletSnapshot  string              `json:"wallet_snapshot"` // "current" — caveat for users
}

// ── Card Credits + Annual-Fee Countdown ─────────────────────────────────────

// CardCreditStatus is one credit definition joined with this user's redemption
// status for the current anniversary year, plus annual-fee renewal countdown.
type CardCreditStatus struct {
	CreditDefID     string   `json:"credit_def_id"`
	CardID          string   `json:"card_id"`
	CardName        string   `json:"card_name"`
	CardAnnualFee   float64  `json:"card_annual_fee"`
	FeeRenewalDate  *string  `json:"fee_renewal_date,omitempty"`  // ISO YYYY-MM-DD
	DaysToRenewal   *int     `json:"days_to_renewal,omitempty"`

	Name            string   `json:"name"`        // "Travel Credit"
	Description     string   `json:"description,omitempty"`
	ValueCAD        float64  `json:"value_cad"`
	Recurrence      string   `json:"recurrence"`  // annual|biennial|quadrennial|once
	SortOrder       int      `json:"sort_order"`

	UserCreditID    string   `json:"user_credit_id,omitempty"` // empty if no row yet
	AnniversaryYear int      `json:"anniversary_year"`
	RedeemedAmount  float64  `json:"redeemed_amount"`
	RedeemedAt      *string  `json:"redeemed_at,omitempty"`
	Remaining       float64  `json:"remaining"`
	Status          string   `json:"status"` // unused|partial|redeemed
	Note            string   `json:"note,omitempty"`
}

// CreditRedemptionRequest is the body for POST /wallet/{sid}/credits/{credit_def_id}/redeem
type CreditRedemptionRequest struct {
	RedeemedAmount float64 `json:"redeemed_amount"`
	Note           string  `json:"note,omitempty"`
}

// ── 2026 Aeroplan SQC (Status Qualifying Credits) projector ──────────────────

// SQCCardContribution: one Aeroplan-cobranded card the user holds, with its
// rate and YTD spend → SQC earned.
type SQCCardContribution struct {
	CardID        string  `json:"card_id"`
	CardName      string  `json:"card_name"`
	DollarsPerSQC int     `json:"dollars_per_sqc"`  // e.g. 15 = "$15 spend → 1 SQC"
	YTDSpend      float64 `json:"ytd_spend"`
	SQCEarned     int     `json:"sqc_earned"`
}

// SQCTier: one row from aeroplan_status_thresholds.
type SQCTier struct {
	StatusLevel   string  `json:"status_level"`     // "25K" | "35K" | "50K" | "75K" | "Super Elite"
	SQCRequired   int     `json:"sqc_required"`
	MinRevenueCAD float64 `json:"min_revenue_cad"`  // 0 if no revenue floor
}

// SQCProjection: the API output of GET /wallet/{sid}/sqc-projection.
type SQCProjection struct {
	Year             int                   `json:"year"`
	TotalSQCEarned   int                   `json:"total_sqc_earned"`
	Cards            []SQCCardContribution `json:"cards"`
	Tiers            []SQCTier             `json:"tiers"`
	CurrentTier      string                `json:"current_tier,omitempty"`     // highest tier the user has cleared
	NextTier         string                `json:"next_tier,omitempty"`        // first tier above current SQC
	SQCToNextTier    int                   `json:"sqc_to_next_tier,omitempty"` // SQC still needed
	SpendToNextTier  float64               `json:"spend_to_next_tier,omitempty"` // CAD spend at user's BEST card rate to clear gap
	BestCardForGap   string                `json:"best_card_for_gap,omitempty"` // which card minimises spend-to-tier
	WalletHasNoCards bool                  `json:"wallet_has_no_aeroplan_cards"` // true if no SQC-earning card in wallet
}

// ── Aeroplan availability watcher ────────────────────────────────────────────

type AwardWatch struct {
	ID            string  `json:"id,omitempty"`
	UserID        string  `json:"user_id,omitempty"`
	Origin        string  `json:"origin"`
	Destination   string  `json:"destination"`
	DepartDate    string  `json:"depart_date"`     // YYYY-MM-DD
	FlexDays      int     `json:"flex_days"`
	Cabin         string  `json:"cabin"`           // economy|business|first
	MaxPoints     *int    `json:"max_points,omitempty"`
	ProgramSlug   string  `json:"program_slug"`    // default 'aeroplan'
	IsActive      bool    `json:"is_active"`
	LastCheckedAt *string `json:"last_checked_at,omitempty"`
	LastMinPoints *int    `json:"last_min_points,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
}

type CreateAwardWatchRequest struct {
	Origin      string `json:"origin"`
	Destination string `json:"destination"`
	DepartDate  string `json:"depart_date"`
	FlexDays    int    `json:"flex_days"`
	Cabin       string `json:"cabin"`
	MaxPoints   *int   `json:"max_points,omitempty"`
	ProgramSlug string `json:"program_slug"`
}

// ── Buy-points break-even calculator ─────────────────────────────────────────

type BuyPromo struct {
	ProgramSlug        string  `json:"program_slug"`
	PromoLabel         string  `json:"promo_label"`
	BaseCentsPerPoint  float64 `json:"base_cents_per_point"`
	PromoCentsPerPoint float64 `json:"promo_cents_per_point"`
	ValidFrom          time.Time `json:"valid_from"`
	ValidTo            *time.Time `json:"valid_to,omitempty"`
	SourceURL          string  `json:"source_url,omitempty"`
}

type BuyPointsRequest struct {
	ProgramSlug      string  `json:"program_slug"`
	PointsNeeded     int     `json:"points_needed"`
	CashAlternative  float64 `json:"cash_alternative_cad"` // what user would otherwise pay in CAD
}

type BuyPointsVerdict struct {
	ProgramSlug          string  `json:"program_slug"`
	PointsNeeded         int     `json:"points_needed"`
	CashAlternative      float64 `json:"cash_alternative_cad"`
	BreakEvenCentsPerPoint float64 `json:"break_even_cents_per_point"` // cash_alt / points
	CurrentPromoCPP      float64 `json:"current_promo_cents_per_point"`
	BasePurchaseCPP      float64 `json:"base_purchase_cents_per_point"`
	BuyCostCAD           float64 `json:"buy_cost_cad"`
	Verdict              string  `json:"verdict"`        // 'buy'|'earn'|'pay_cash'
	Rationale            string  `json:"rationale"`
	PromoLabel           string  `json:"promo_label,omitempty"`
	SourceURL            string  `json:"source_url,omitempty"`
}

// ── Devaluation events ───────────────────────────────────────────────────────

type DevaluationEvent struct {
	ID            string `json:"id"`
	ProgramSlug   string `json:"program_slug"`
	Title         string `json:"title"`
	Description   string `json:"description"`
	Severity      string `json:"severity"`       // 'minor'|'major'
	EffectiveDate string `json:"effective_date"` // YYYY-MM-DD
	PostedAt      string `json:"posted_at"`
	SourceURL     string `json:"source_url,omitempty"`
	DaysUntil     int    `json:"days_until"`     // can be negative if past
	UserHolds     bool   `json:"user_holds_balance"` // true if user has cards in this program
}

// ── Triple-stack calculator ──────────────────────────────────────────────────

type Merchant struct {
	Slug         string `json:"slug"`
	Name         string `json:"name"`
	CategorySlug string `json:"category_slug,omitempty"`
	PrimaryURL   string `json:"primary_url,omitempty"`
}

type PortalRate struct {
	Portal     string  `json:"portal"`        // 'rakuten_ca'|'gcr'|'topcashback'
	Merchant   string  `json:"merchant_slug"`
	RatePct    float64 `json:"rate_pct"`
	SourceURL  string  `json:"source_url,omitempty"`
	ScrapedAt  string  `json:"scraped_at,omitempty"`
}

type NetworkOffer struct {
	ID          string  `json:"id"`
	Network     string  `json:"network"` // 'amex'|'visa'|'mastercard'
	Merchant    string  `json:"merchant_slug"`
	Title       string  `json:"title"`
	RewardType  string  `json:"reward_type"` // 'statement_credit'|'bonus_points'|'merchant_discount'
	RewardValue float64 `json:"reward_value"`
	MinSpend    float64 `json:"min_spend"`
	CardFilter  *string `json:"card_filter,omitempty"`
	ValidTo     *string `json:"valid_to,omitempty"`
	Source      string  `json:"source"`
	SourceURL   string  `json:"source_url,omitempty"`
}

type StackRecommendRequest struct {
	SessionID   string  `json:"session_id"`
	MerchantSlug string  `json:"merchant_slug"`
	SpendAmount  float64 `json:"spend_amount"`
}

type StackComponent struct {
	Layer      string  `json:"layer"`         // 'portal'|'card'|'network_offer'|'loyalty'
	Source     string  `json:"source"`        // human-readable label
	ValueCAD   float64 `json:"value_cad"`     // dollars earned/saved on this layer
	Detail     string  `json:"detail,omitempty"`
	SourceURL  string  `json:"source_url,omitempty"`
}

type StackRecommendation struct {
	MerchantSlug    string           `json:"merchant_slug"`
	MerchantName    string           `json:"merchant_name"`
	SpendAmount     float64          `json:"spend_amount"`
	BestPortal      *PortalRate      `json:"best_portal,omitempty"`
	BestCard        *CardRecommendation `json:"best_card,omitempty"`
	NetworkOffers   []NetworkOffer   `json:"network_offers"`
	Components      []StackComponent `json:"components"`
	TotalValueCAD   float64          `json:"total_value_cad"`
	EffectiveReturn float64          `json:"effective_return_pct"`
	Warnings        []string         `json:"warnings,omitempty"`
}

// ── Annual card value comparison ─────────────────────────────────────────────

type CardValueComponent struct {
	ComponentType string  `json:"component_type"` // 'insurance'|'lounge'|'concierge'|'fx_savings'|'multiplier'|'credit_bundle'
	AnnualEVCAD   float64 `json:"annual_ev_cad"`
	Description   string  `json:"description"`
	SortOrder     int     `json:"sort_order"`
}

type CardValueSummary struct {
	CardID       string               `json:"card_id"`
	CardName     string               `json:"card_name"`
	AnnualFee    float64              `json:"annual_fee"`
	Components   []CardValueComponent `json:"components"`
	TotalEVCAD   float64              `json:"total_ev_cad"`
	NetEVCAD     float64              `json:"net_ev_cad"`     // total_ev - fee
	IsPositive   bool                 `json:"is_positive"`
}

// ── India-outbound hotel arbitrage ───────────────────────────────────────────

type IndiaArbitrageProperty struct {
	ProgramSlug      string  `json:"program_slug"`
	PropertyName     string  `json:"property_name"`
	City             string  `json:"city"`
	PointsPerNight   int     `json:"points_per_night"`
	CashRateINR      *int    `json:"cash_rate_inr,omitempty"`
	CashRateCAD      float64 `json:"cash_rate_cad"`
	ValueCADPerPoint float64 `json:"value_cad_per_point"`
	UserBalance      int     `json:"user_balance"`
	NightsAffordable int     `json:"nights_affordable"`
	TotalSavingsCAD  float64 `json:"total_savings_cad"`
	Notes            string  `json:"notes,omitempty"`
	SourceURL        string  `json:"source_url,omitempty"`
}

// ── Tangerine MCC resolver ───────────────────────────────────────────────────

type TangerineCategory struct {
	Slug        string `json:"slug"`
	DisplayName string `json:"display_name"`
	MCCCodes    []int  `json:"mcc_codes"`
	Description string `json:"description,omitempty"`
}
