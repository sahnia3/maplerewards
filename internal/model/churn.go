package model

// ChurnCandidate is one catalog card the user does NOT already hold, scored for
// its welcome-bonus value, the user's ability to hit the minimum spend, and
// whether an issuer cooldown rule currently blocks an application. Reuses the
// same eligibility verdict the application tracker surfaces — it is not a second
// implementation of the cooldown math.
type ChurnCandidate struct {
	CardID                string  `json:"card_id"`
	CardName              string  `json:"card_name"`
	Issuer                string  `json:"issuer"`
	ProgramName           string  `json:"program_name"`
	WelcomeBonusPoints    int     `json:"welcome_bonus_points"`
	WelcomeBonusValueCAD  float64 `json:"welcome_bonus_value_cad"`
	AnnualFee             float64 `json:"annual_fee"`
	NetFirstYearValueCAD  float64 `json:"net_first_year_value_cad"`
	MinSpend              float64 `json:"min_spend"`
	MinSpendMonths        int     `json:"min_spend_months"`
	MonthlySpendNeededCAD float64 `json:"monthly_spend_needed_cad"`
	MinSpendFeasible      bool    `json:"min_spend_feasible"`
	Eligible              bool    `json:"eligible"`
	BlockReason           string  `json:"block_reason,omitempty"`
	EarliestEligibleDate  *string `json:"earliest_eligible_date,omitempty"` // ISO YYYY-MM-DD, set when blocked by cooldown
}

// ChurnPlan is the full per-wallet welcome-bonus / churn-planner output: the
// best next cards to apply for (eligible, ranked by net first-year value with
// feasible-to-hit bonuses first) and the attractive cards currently blocked by
// an issuer cooldown (with the reason and the date they clear).
type ChurnPlan struct {
	Year                       int              `json:"year"`
	Recommendations            []ChurnCandidate `json:"recommendations"`
	Blocked                    []ChurnCandidate `json:"blocked"`
	BestNextCard               string           `json:"best_next_card"`
	TotalPotentialBonusValueCAD float64         `json:"total_potential_bonus_value_cad"`
}
