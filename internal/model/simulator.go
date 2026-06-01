package model

// SimulatorCardRef is an echoed add/drop card with its annual fee, so the
// frontend can show exactly which cards moved and what they cost.
type SimulatorCardRef struct {
	CardID    string  `json:"card_id"`
	CardName  string  `json:"card_name"`
	AnnualFee float64 `json:"annual_fee"`
}

// SimulatorCategoryChange is one spend category whose best-earning card changed
// between the baseline (cards held today) and the simulated card set. Only
// categories where the winning card actually changed are emitted.
type SimulatorCategoryChange struct {
	CategoryName string  `json:"category_name"`
	AnnualSpend  float64 `json:"annual_spend"`
	BeforeCard   string  `json:"before_card"`
	BeforeValue  float64 `json:"before_value"`
	AfterCard    string  `json:"after_card"`
	AfterValue   float64 `json:"after_value"`
	DeltaCAD     float64 `json:"delta_cad"`
}

// SimulationResult is the net annual-value impact of adding and/or dropping
// cards. Values are estimates from logged spend and intentionally ignore
// monthly category caps (see Note).
type SimulationResult struct {
	BaselineAnnualValue  float64                   `json:"baseline_annual_value"`
	SimulatedAnnualValue float64                   `json:"simulated_annual_value"`
	ValueDeltaCAD        float64                   `json:"value_delta_cad"`
	FeeDeltaCAD          float64                   `json:"fee_delta_cad"`
	NetDeltaAfterFeesCAD float64                   `json:"net_delta_after_fees_cad"`
	Added                []SimulatorCardRef        `json:"added"`
	Dropped              []SimulatorCardRef        `json:"dropped"`
	CategoryChanges      []SimulatorCategoryChange `json:"category_changes"`
	// IgnoredAlreadyHeld lists add_card_ids that the user already holds (no-op).
	IgnoredAlreadyHeld []string `json:"ignored_already_held"`
	// IgnoredNotHeld lists drop_card_ids that the user does not hold (no-op).
	IgnoredNotHeld []string `json:"ignored_not_held"`
	Note           string   `json:"note"`
}
