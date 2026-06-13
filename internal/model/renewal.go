package model

// RenewalDowngradeOption is a lower-fee card from the same issuer and loyalty
// program that a user could product-change / downgrade to instead of paying the
// full annual fee. Sourced from the live card catalog, not a hardcoded mapping.
type RenewalDowngradeOption struct {
	CardID    string  `json:"card_id"`
	CardName  string  `json:"card_name"`
	AnnualFee float64 `json:"annual_fee"`
	FeeSaved  float64 `json:"fee_saved"`
}

// RenewalAssessment is the keep / use-credits / downgrade-or-cancel verdict for a
// single held card, derived from the user's actual reward value, statement
// credits, and the card's annual fee.
type RenewalAssessment struct {
	CardID           string                   `json:"card_id"`
	CardName         string                   `json:"card_name"`
	Issuer           string                   `json:"issuer"`
	ProgramName      string                   `json:"program_name"`
	AnnualFee        float64                  `json:"annual_fee"`
	FeeRenewalDate   *string                  `json:"fee_renewal_date,omitempty"`
	DaysToRenewal    *int                     `json:"days_to_renewal,omitempty"`
	SpendValue       float64                  `json:"spend_value"`   // annual reward value from logged spend
	CreditsValue     float64                  `json:"credits_value"` // total annual statement-credit value
	CreditsUsed      float64                  `json:"credits_used"`  // redeemed this anniversary year
	RealizedNet      float64                  `json:"realized_net"`  // spendValue + creditsUsed - fee
	PotentialNet     float64                  `json:"potential_net"` // spendValue + creditsValue - fee
	Verdict          string                   `json:"verdict"`       // keep | keep_no_fee | use_credits | downgrade_or_cancel | insufficient_history
	Rationale        string                   `json:"rationale"`
	DowngradeOptions []RenewalDowngradeOption `json:"downgrade_options,omitempty"`
}

// RenewalReport is the full per-wallet renewal-optimizer output.
type RenewalReport struct {
	Year             int                 `json:"year"`
	Assessments      []RenewalAssessment `json:"assessments"`
	TotalAnnualFees  float64             `json:"total_annual_fees"`
	TotalNetValue    float64             `json:"total_net_value"`   // sum of realized net
	PotentialSavings float64             `json:"potential_savings"` // fees recoverable by downgrading/cancelling
	// SpendMonthsObserved is how many distinct calendar months of spend the
	// user has logged. When it's thin, hard "cancel" verdicts are softened to
	// insufficient_history because the value math is extrapolated from a short
	// window (e.g. one day's spend ≠ an annual picture).
	SpendMonthsObserved int  `json:"spend_months_observed"`
	ThinSpendHistory    bool `json:"thin_spend_history"`
}
