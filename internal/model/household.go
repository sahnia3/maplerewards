package model

// HouseholdCategoryCoverage is one of the user's spend categories paired with
// the single best-earning card across the combined household wallet (the user's
// held cards + the partner's cards) and which side owns it.
type HouseholdCategoryCoverage struct {
	CategoryName   string  `json:"category_name"`
	BestCardID     string  `json:"best_card_id"`
	BestCardName   string  `json:"best_card_name"`
	Owner          string  `json:"owner"` // "you" | "partner"
	EffectiveValue float64 `json:"effective_value"`
}

// HouseholdCancelCandidate is a fee-carrying household card that earns its keep
// nowhere: it is not the sole best card for any category the user spends in, and
// dropping it leaves every category's best household value intact (the
// second-best card covers it). The annual fee is the potential saving.
type HouseholdCancelCandidate struct {
	CardID    string  `json:"card_id"`
	CardName  string  `json:"card_name"`
	Owner     string  `json:"owner"` // "you" | "partner"
	AnnualFee float64 `json:"annual_fee"`
	Reason    string  `json:"reason"`
}

// HouseholdReport tells a household which card (and whose) to reach for in each
// spend category and which fee-carrying cards are redundant. Values are
// estimates from the user's logged spend used as a household proxy and ignore
// monthly category caps (see Note).
type HouseholdReport struct {
	CategoryCoverage              []HouseholdCategoryCoverage `json:"category_coverage"`
	CancelCandidates              []HouseholdCancelCandidate  `json:"cancel_candidates"`
	TotalFeeSavingsOpportunityCAD float64                     `json:"total_fee_savings_opportunity_cad"`
	YouCardCount                  int                         `json:"you_card_count"`
	PartnerCardCount              int                         `json:"partner_card_count"`
	Note                          string                      `json:"note"`
}
