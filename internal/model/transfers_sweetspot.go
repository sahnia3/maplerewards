package model

// TransferOption is one transfer-partner edge out of a program the user holds
// points in: how many points land in the destination after applying the ratio,
// what that's worth at the destination program's base CPP, and the value uplift
// over simply keeping the points in the source program.
type TransferOption struct {
	ToProgramSlug    string  `json:"to_program_slug"`
	ToProgramName    string  `json:"to_program_name"`
	TransferRatio    float64 `json:"transfer_ratio"`    // 1.0 = 1:1
	TransferredPoints int64  `json:"transferred_points"` // floor(points * ratio)
	TransferValueCAD float64 `json:"transfer_value_cad"`
	UpliftCAD        float64 `json:"uplift_cad"`     // transfer value - keep value
	MinTransfer      int     `json:"min_transfer"`   // source-program minimum to transfer
	Eligible         bool    `json:"eligible"`       // false when points < min_transfer
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
