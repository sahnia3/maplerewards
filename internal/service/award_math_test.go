package service

import (
	"strings"
	"testing"

	"maplerewards/internal/model"
)

func ptrFloat(v float64) *float64 { return &v }

func TestAwardMathCeilToIncrement(t *testing.T) {
	cases := []struct {
		name string
		n    int64
		inc  int
		want int64
	}{
		{"already aligned", 300, 100, 300},
		{"rounds up", 250, 100, 300},
		{"rounds up to first multiple", 1, 1000, 1000},
		{"zero increment treated as 1", 50, 0, 50},
		{"negative increment treated as 1", 50, -5, 50},
		{"increment 1 passthrough", 73, 1, 73},
		{"zero value", 0, 100, 0},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := ceilToIncrement(c.n, c.inc); got != c.want {
				t.Fatalf("ceilToIncrement(%d, %d) = %d, want %d", c.n, c.inc, got, c.want)
			}
		})
	}
}

func TestAwardMathSourcePointsToMove(t *testing.T) {
	cases := []struct {
		name      string
		awardCost int64
		ratio     float64
		inc       int
		want      int64
	}{
		{"exact 1:1 in 100s", 75000, 1.0, 100, 75000},
		{"1:1 in 1000s rounds up", 75001, 1.0, 1000, 76000},
		{"fractional ratio Marriott", 60000, 0.833, 1, 72029},
		{"ratio greater than one moves fewer", 60000, 1.2, 1, 50000},
		{"zero ratio invalid", 75000, 0, 100, 0},
		{"negative ratio invalid", 75000, -1, 100, 0},
		{"zero award", 0, 1.0, 100, 0},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := sourcePointsToMove(c.awardCost, c.ratio, c.inc); got != c.want {
				t.Fatalf("sourcePointsToMove(%d, %v, %d) = %d, want %d",
					c.awardCost, c.ratio, c.inc, got, c.want)
			}
		})
	}
}

func TestAwardMathComputeFactsCPPOverride(t *testing.T) {
	r := model.AwardSearchResult{
		Program:      "aeroplan",
		ProgramName:  "Aeroplan",
		Cabin:        "business",
		PointsCost:   80000,
		CashPriceCAD: 5000, // benchmark fallback
		TaxesCash:    ptrFloat(500),
	}

	// Live cash present → CPP computed against net live cash (8000-500)/80000*100.
	live := computeAwardFacts([]model.AwardSearchResult{r}, 8000, nil, nil)
	if len(live) != 1 {
		t.Fatalf("expected 1 fact, got %d", len(live))
	}
	if !live[0].CashIsLive {
		t.Errorf("expected CashIsLive=true with live cash")
	}
	if live[0].LiveCashCAD != 8000 {
		t.Errorf("LiveCashCAD = %v, want 8000", live[0].LiveCashCAD)
	}
	wantLive := computeCPP(netCashCAD(8000, ptrFloat(500)), 80000)
	if live[0].CPPLive != wantLive {
		t.Errorf("CPPLive = %v, want %v (live)", live[0].CPPLive, wantLive)
	}

	// No live cash → falls back to the row's CashPriceCAD benchmark.
	est := computeAwardFacts([]model.AwardSearchResult{r}, 0, nil, nil)
	if est[0].CashIsLive {
		t.Errorf("expected CashIsLive=false with no live cash")
	}
	if est[0].LiveCashCAD != 5000 {
		t.Errorf("LiveCashCAD = %v, want 5000 (benchmark)", est[0].LiveCashCAD)
	}
	wantEst := computeCPP(netCashCAD(5000, ptrFloat(500)), 80000)
	if est[0].CPPLive != wantEst {
		t.Errorf("CPPLive = %v, want %v (benchmark)", est[0].CPPLive, wantEst)
	}
}

func TestAwardMathComputeFactsDirectAffordability(t *testing.T) {
	cases := []struct {
		name       string
		available  int64
		cost       int
		wantAfford bool
		wantShort  int64
	}{
		{"enough", 80000, 75000, true, 0},
		{"short", 60000, 75000, false, 15000},
		{"exact", 75000, 75000, true, 0},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			r := model.AwardSearchResult{
				Program:         "aeroplan",
				ProgramName:     "Aeroplan",
				PointsCost:      c.cost,
				PointsAvailable: c.available,
			}
			facts := computeAwardFacts([]model.AwardSearchResult{r}, 0, nil, nil)
			if facts[0].DirectCanAfford != c.wantAfford {
				t.Errorf("DirectCanAfford = %v, want %v", facts[0].DirectCanAfford, c.wantAfford)
			}
			if facts[0].DirectShortfall != c.wantShort {
				t.Errorf("DirectShortfall = %d, want %d", facts[0].DirectShortfall, c.wantShort)
			}
		})
	}
}

func mrRoute(active bool) model.TransferPartner {
	return model.TransferPartner{
		TransferRatio:     1.0,
		TransferIncrement: 100,
		MinimumTransfer:   100,
		IsActive:          active,
		FromProgram:       &model.LoyaltyProgram{Slug: "amex-mr", Name: "Amex MR"},
	}
}

func TestAwardMathComputeFactsTransferPath(t *testing.T) {
	r := model.AwardSearchResult{
		Program:     "aeroplan",
		ProgramName: "Aeroplan",
		Cabin:       "business",
		PointsCost:  75000,
	}
	routes := map[string][]model.TransferPartner{
		"aeroplan": {mrRoute(true)},
	}

	// Wallet covers the transfer.
	facts := computeAwardFacts([]model.AwardSearchResult{r}, 0,
		map[string]int64{"amex-mr": 100000}, routes)
	if len(facts[0].Transfers) != 1 {
		t.Fatalf("expected 1 transfer option, got %d", len(facts[0].Transfers))
	}
	opt := facts[0].Transfers[0]
	if opt.SourceToMove != 75000 {
		t.Errorf("SourceToMove = %d, want 75000", opt.SourceToMove)
	}
	if !opt.CanCover {
		t.Errorf("expected CanCover=true with 100k balance")
	}
	if opt.SourceShortfall != 0 {
		t.Errorf("SourceShortfall = %d, want 0", opt.SourceShortfall)
	}

	// Wallet short → CanCover false, shortfall = 75000 - 50000.
	short := computeAwardFacts([]model.AwardSearchResult{r}, 0,
		map[string]int64{"amex-mr": 50000}, routes)
	so := short[0].Transfers[0]
	if so.CanCover {
		t.Errorf("expected CanCover=false with 50k balance")
	}
	if so.SourceShortfall != 25000 {
		t.Errorf("SourceShortfall = %d, want 25000", so.SourceShortfall)
	}
}

func TestAwardMathComputeFactsSkipsInvalidRoutes(t *testing.T) {
	r := model.AwardSearchResult{Program: "aeroplan", ProgramName: "Aeroplan", PointsCost: 75000}

	inactive := mrRoute(false)
	nilFrom := mrRoute(true)
	nilFrom.FromProgram = nil

	routes := map[string][]model.TransferPartner{
		"aeroplan": {inactive, nilFrom, mrRoute(true)},
	}

	// Zero source balance for an active+valid route → skipped (only surface
	// fundable paths). With 0 balance on amex-mr, none qualify.
	zeroBal := computeAwardFacts([]model.AwardSearchResult{r}, 0,
		map[string]int64{"amex-mr": 0}, routes)
	if len(zeroBal[0].Transfers) != 0 {
		t.Errorf("expected 0 transfers (zero balance), got %d", len(zeroBal[0].Transfers))
	}

	// With a positive balance, inactive + nil-FromProgram are still skipped,
	// leaving only the one valid route.
	withBal := computeAwardFacts([]model.AwardSearchResult{r}, 0,
		map[string]int64{"amex-mr": 100000}, routes)
	if len(withBal[0].Transfers) != 1 {
		t.Errorf("expected 1 transfer (inactive/nil skipped), got %d", len(withBal[0].Transfers))
	}
}

func TestAwardMathRenderBlock(t *testing.T) {
	if got := renderAwardFactsBlock(nil); got != "" {
		t.Errorf("renderAwardFactsBlock(nil) = %q, want empty", got)
	}

	r := model.AwardSearchResult{
		Program:     "aeroplan",
		ProgramName: "Aeroplan",
		Cabin:       "business",
		PointsCost:  75000,
	}
	routes := map[string][]model.TransferPartner{"aeroplan": {mrRoute(true)}}
	facts := computeAwardFacts([]model.AwardSearchResult{r}, 8000,
		map[string]int64{"amex-mr": 100000}, routes)

	out := renderAwardFactsBlock(facts)
	for _, sub := range []string{
		"DO NOT recalculate",
		"75,000", // formatPoints comma format
		"¢/pt",   // CPP token
		"Amex MR",
	} {
		if !strings.Contains(out, sub) {
			t.Errorf("rendered block missing %q\n---\n%s", sub, out)
		}
	}
}
