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
