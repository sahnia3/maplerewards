package model

// ExpiryAccount is the points-expiry verdict for a single tracked loyalty
// account: when the balance effectively expires, how much CAD is at risk, and
// the cheapest way to reset the clock. Read-only over loyalty_accounts +
// loyalty_expiry_rules + loyalty_programs.base_cpp.
type ExpiryAccount struct {
	ProgramSlug      string  `json:"program_slug"`
	ProgramName      string  `json:"program_name"`
	AccountLabel     *string `json:"account_label,omitempty"`
	Balance          int64   `json:"balance"`
	EffectiveExpiry  *string `json:"effective_expiry,omitempty"` // ISO date, nil = never
	DaysToExpiry     *int    `json:"days_to_expiry,omitempty"`   // nil = never
	PointsAtRiskCAD  float64 `json:"points_at_risk_cad"`
	Risk             string  `json:"risk"` // critical | warning | watch | ok | none
	ResetSuggestion  string  `json:"reset_suggestion"`
}

// ExpiryReport is the full per-wallet points-expiry-guardian output.
type ExpiryReport struct {
	GeneratedYear        int             `json:"generated_year"`
	Accounts             []ExpiryAccount `json:"accounts"`
	TotalPointsAtRiskCAD float64         `json:"total_points_at_risk_cad"`
	AccountsExpiringSoon int             `json:"accounts_expiring_soon"`
}
