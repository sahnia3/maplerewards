package model

// TransferOption is one transfer-partner edge out of a program the user holds
// points in: how many points land in the destination after applying the ratio,
// what that's worth at the destination program's base CPP, and the value uplift
// over simply keeping the points in the source program.
type TransferOption struct {
	ToProgramSlug    string  `json:"to_program_slug"`
	ToProgramName    string  `json:"to_program_name"`
	TransferRatio    float64 `json:"transfer_ratio"`    // base 1.0 = 1:1
	TransferredPoints int64  `json:"transferred_points"` // floor(points * effective ratio)
	TransferValueCAD float64 `json:"transfer_value_cad"`
	UpliftCAD        float64 `json:"uplift_cad"`     // transfer value - keep value
	MinTransfer      int     `json:"min_transfer"`   // source-program minimum to transfer
	Eligible         bool    `json:"eligible"`       // false when points < min_transfer

	// Live transfer-bonus fields. Populated only when transfer_bonus_events has
	// an active promo covering this exact (source → destination) route; the
	// scraped data is reflected, never invented. EffectiveRatio already folds
	// the bonus into TransferRatio*(1+bonus%), and TransferredPoints/
	// TransferValueCAD/UpliftCAD above are computed on the boosted ratio.
	BonusPercent   float64 `json:"bonus_percent,omitempty"`   // e.g. 30 for a +30% bonus; 0 when none live
	BonusLabel     string  `json:"bonus_label,omitempty"`     // e.g. "BONUS LIVE: +30% through 2026-07-15"
	BonusExpiresAt string  `json:"bonus_expires_at,omitempty"` // YYYY-MM-DD; empty when no bonus
	EffectiveRatio float64 `json:"effective_ratio,omitempty"` // TransferRatio*(1+BonusPercent/100); 0 omits when == base
}

// TransferSweetSpotSource is one source program the user holds points in that
// has at least one transfer partner. It carries the keep-value baseline and the
// ranked transfer options, with the single best (eligible, positive-uplift)
// move surfaced separately.
type TransferSweetSpotSource struct {
	ProgramSlug  string           `json:"program_slug"`
	ProgramName  string           `json:"program_name"`
	Points       int64            `json:"points"`
	KeepValueCAD float64          `json:"keep_value_cad"`
	BaseCPP      float64          `json:"base_cpp"`
	BestTransfer *TransferOption  `json:"best_transfer"` // nil when no eligible uplift exists
	AllTransfers []TransferOption `json:"all_transfers"` // sorted by uplift desc
}

// TransferSweetSpotReport is the full per-wallet transfer sweet-spot output:
// every program the user holds points in (that has partners), with the best
// value-increasing transfer move per program and the total potential uplift.
type TransferSweetSpotReport struct {
	Sources                []TransferSweetSpotSource `json:"sources"`
	TotalPotentialUpliftCAD float64                  `json:"total_potential_uplift_cad"`
	Note                   string                    `json:"note"`
}
