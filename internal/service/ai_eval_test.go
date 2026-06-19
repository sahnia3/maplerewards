package service

// ai_eval_test.go — deterministic, OFFLINE-by-default regression suite that locks
// in Maple AI's anti-hallucination guarantees so future prompt/code changes can't
// silently regress them. NO network calls in the default suite.
//
// These are CROSS-CUTTING invariants. Unit-level coverage of the individual
// helpers already lives elsewhere and is intentionally NOT duplicated here:
//   - ceilToIncrement / sourcePointsToMove / computeAwardFacts field math:
//     award_math_test.go (TestAwardMath*)
//   - extractFirstJSONObject + the *AIService.selfCheckReply LLM round-trip
//     (gating, verdict application, fail-open): selfcheck_test.go
//
// What this file adds on top of those:
//   (1) The FACTS-block end-to-end regression for the user's #1 complaint —
//       "don't tell me to transfer my whole 1.5M balance". Feeds a fixed multi-
//       program []model.AwardSearchResult + wallet + transfer routes through
//       computeAwardFacts -> renderAwardFactsBlock and asserts the RENDERED block
//       quotes the REQUIRED transfer amount (60k–75k) and never the full balance.
//   (2) No fabricated live cash / CPP for estimated programs — renderAwardFactsBlock
//       tags "estimated cash" (not "live cash") and suppresses CPP when no cash is
//       known at all; CashIsLive is the only gate for the "live cash" label.
//   (3) computeCPP / netCashCAD correctness as a direct table (incl. taxes), using
//       the repo's 0.001 float-tolerance idiom.
//   (4) parseTravelQuery golden origin/destination/cabin extraction, including the
//       map-iteration/canadian-fixup ordering case "Toronto to Copenhagen".
//   (5) Self-check JSON extraction — already covered by selfcheck_test.go; see
//       TestAIEval_SelfCheckJSONExtraction_CoveredElsewhere for the pointer.

import (
	"os"
	"strings"
	"testing"
	"time"

	"maplerewards/internal/model"
)

// floatNear asserts got ≈ want within the repo's standard 0.001 tolerance idiom
// (mirrors award_search_test.go:147).
func floatNear(t *testing.T, got, want float64) {
	t.Helper()
	if d := got - want; d > 0.001 || d < -0.001 {
		t.Errorf("got %.6f, want %.6f (Δ=%.6f)", got, want, d)
	}
}

// assertFutureISODate asserts d parses as YYYY-MM-DD and is not in the past.
// Used for golden cases where extractDate is time.Now()-relative (e.g. the
// "flexible dates" prompt resolves to now+30d, which must never be pinned to an
// exact literal or the test rots daily).
func assertFutureISODate(t *testing.T, d string) {
	t.Helper()
	tt, err := time.Parse("2006-01-02", d)
	if err != nil {
		t.Fatalf("date %q is not YYYY-MM-DD: %v", d, err)
	}
	if !tt.After(time.Now().Add(-24 * time.Hour)) {
		t.Errorf("date %q is not a future date", d)
	}
}

// ── (1) FACTS-block end-to-end: required transfer amount, NOT the whole balance ──
//
// The regression guard for the user's #1 complaint. A user holds 1,500,000 Amex MR.
// An Aeroplan business award costs 75,000 pts at 1:1. The FACTS block must tell them
// to transfer 75,000 — NOT 1,500,000 — and must surface the points cost, a CPP from
// live cash, and "enough" rather than a shortfall.
func TestAIEval_FactsBlock_RequiredTransferNotWholeBalance(t *testing.T) {
	const wholeBalance int64 = 1_500_000

	award := model.AwardSearchResult{
		Program:      "aeroplan",
		ProgramName:  "Aeroplan",
		Cabin:        "business",
		PointsCost:   75_000,
		CashPriceCAD: 6_150, // route/cabin benchmark; live cash below overrides it
	}
	routes := map[string][]model.TransferPartner{
		"aeroplan": {{
			TransferRatio:     1.0,
			TransferIncrement: 1_000,
			MinimumTransfer:   1_000,
			IsActive:          true,
			FromProgram:       &model.LoyaltyProgram{Slug: "amex-mr", Name: "Amex MR"},
		}},
	}
	wallet := map[string]int64{"amex-mr": wholeBalance}

	// Live cheapest cash $6,150 → CPP = 6150/75000*100 = 8.20¢/pt.
	facts := computeAwardFacts([]model.AwardSearchResult{award}, 6_150, wallet, routes)
	if len(facts) != 1 {
		t.Fatalf("expected 1 fact, got %d", len(facts))
	}
	f := facts[0]

	// Structured assertions on the computed fact (what the renderer reads).
	if len(f.Transfers) != 1 {
		t.Fatalf("expected 1 transfer option, got %d", len(f.Transfers))
	}
	opt := f.Transfers[0]
	if opt.SourceToMove != 75_000 {
		t.Errorf("SourceToMove = %d, want 75000 (the required amount, not the balance)", opt.SourceToMove)
	}
	if opt.SourceToMove >= wholeBalance {
		t.Errorf("SourceToMove (%d) must be far below the 1.5M balance", opt.SourceToMove)
	}
	if !opt.CanCover || opt.SourceShortfall != 0 {
		t.Errorf("CanCover=%v shortfall=%d, want CanCover=true shortfall=0", opt.CanCover, opt.SourceShortfall)
	}
	if !f.CashIsLive {
		t.Errorf("CashIsLive=false, want true (live cash provided)")
	}
	floatNear(t, f.CPPLive, 8.20)

	// The rendered FACTS block is what the model actually quotes. Assert the
	// transfer line names 75,000 and never the whole balance.
	block := renderAwardFactsBlock(facts)
	if !strings.Contains(block, "Transfer 75,000 pts from Amex MR") {
		t.Errorf("FACTS block must instruct transferring 75,000 pts; got:\n%s", block)
	}
	if strings.Contains(block, "Transfer 1,500,000") {
		t.Errorf("FACTS block must NOT instruct transferring the whole 1.5M balance; got:\n%s", block)
	}
	for _, want := range []string{
		"DO NOT recalculate", // header forbids the model re-doing the math
		"75,000 pts",         // points cost
		"8.20¢/pt",           // CPP from live cash
		"live cash $6150",    // cash provenance is live, not estimated
		"✅ enough",           // the user can cover it
		"1,500,000 Amex MR",  // the block may state the balance as context…
	} {
		if !strings.Contains(block, want) {
			t.Errorf("FACTS block missing %q; got:\n%s", want, block)
		}
	}
}

// ── (1b) FACTS-block partial cover: shortfall is the gap, transfer is still bounded ──
//
// A user short on the source currency must be told the exact shortfall, and the
// transfer amount must still be the award-sized number rounded to the increment,
// never the balance. Locks the increment-rounding path through the renderer.
func TestAIEval_FactsBlock_ShortfallAndIncrementRounding(t *testing.T) {
	award := model.AwardSearchResult{
		Program:     "aeroplan",
		ProgramName: "Aeroplan",
		Cabin:       "business",
		PointsCost:  60_000,
	}
	// 0.75 ratio (source→dest), 1,000 increment: 60000/0.75 = 80000, already aligned.
	routes := map[string][]model.TransferPartner{
		"aeroplan": {{
			TransferRatio:     0.75,
			TransferIncrement: 1_000,
			MinimumTransfer:   1_000,
			IsActive:          true,
			FromProgram:       &model.LoyaltyProgram{Slug: "capone", Name: "Capital One"},
		}},
	}
	wallet := map[string]int64{"capone": 50_000} // short of the 80,000 needed

	facts := computeAwardFacts([]model.AwardSearchResult{award}, 0, wallet, routes)
	opt := facts[0].Transfers[0]
	if opt.SourceToMove != 80_000 {
		t.Fatalf("SourceToMove = %d, want 80000 (60000/0.75, increment-aligned)", opt.SourceToMove)
	}
	if opt.CanCover {
		t.Errorf("CanCover=true, want false (50k balance < 80k needed)")
	}
	if opt.SourceShortfall != 30_000 {
		t.Errorf("SourceShortfall = %d, want 30000", opt.SourceShortfall)
	}

	block := renderAwardFactsBlock(facts)
	if !strings.Contains(block, "Transfer 80,000 pts from Capital One") {
		t.Errorf("expected the increment-rounded 80,000 transfer line; got:\n%s", block)
	}
	if !strings.Contains(block, "❌ short 30,000 Capital One pts") {
		t.Errorf("expected the exact 30,000 shortfall; got:\n%s", block)
	}
}

// ── (2) No fabricated live cash / CPP for estimated or cash-less programs ──────
//
// Anti-hallucination invariant: the FACTS block may only claim "live cash" when
// CashIsLive is true, and must suppress the CPP line entirely when no cash is
// known at all (LiveCashCAD == 0). An unsearched program must never carry a
// fabricated live CPP/seat claim.
func TestAIEval_FactsBlock_NoFabricatedLiveCashOrCPP(t *testing.T) {
	t.Run("estimated cash is tagged, never claimed live", func(t *testing.T) {
		award := model.AwardSearchResult{
			Program:      "flying-blue",
			ProgramName:  "Flying Blue",
			Cabin:        "business",
			PointsCost:   75_000,
			CashPriceCAD: 6_000, // route benchmark only — no live flights
		}
		facts := computeAwardFacts([]model.AwardSearchResult{award}, 0, nil, nil)
		if facts[0].CashIsLive {
			t.Errorf("CashIsLive=true with no live cash; benchmark must be flagged estimated")
		}
		block := renderAwardFactsBlock(facts)
		if !strings.Contains(block, "estimated cash") {
			t.Errorf("benchmark-only row must be tagged 'estimated cash'; got:\n%s", block)
		}
		if strings.Contains(block, "live cash") {
			t.Errorf("benchmark-only row must NOT claim 'live cash'; got:\n%s", block)
		}
	})

	t.Run("no cash anywhere suppresses the CPP line", func(t *testing.T) {
		award := model.AwardSearchResult{
			Program:     "united",
			ProgramName: "United MileagePlus",
			Cabin:       "economy",
			PointsCost:  35_000,
			// CashPriceCAD: 0 — truly unsearched; no live flights either.
		}
		facts := computeAwardFacts([]model.AwardSearchResult{award}, 0, nil, nil)
		if facts[0].LiveCashCAD != 0 {
			t.Fatalf("LiveCashCAD = %v, want 0 (no cash known)", facts[0].LiveCashCAD)
		}
		block := renderAwardFactsBlock(facts)
		// Points cost still appears; CPP line (¢/pt) must NOT — we can't compute a
		// CPP without a cash anchor, so the block must not invent one.
		if !strings.Contains(block, "35,000 pts") {
			t.Errorf("points cost should still render; got:\n%s", block)
		}
		if strings.Contains(block, "¢/pt") {
			t.Errorf("no cash known → CPP line must be suppressed, not fabricated; got:\n%s", block)
		}
	})
}

// ── (3) CPP / net-cash correctness, direct table (incl. taxes) ────────────────
//
// award_math_test.go exercises these only indirectly via computeAwardFacts; this
// pins the pure functions directly across the inputs the domain cares about.
func TestAIEval_CPPAndNetCash(t *testing.T) {
	t.Run("computeCPP", func(t *testing.T) {
		cases := []struct {
			name   string
			cash   float64
			points int
			want   float64
		}{
			{"2cpp basic", 1000, 50_000, 2.0},
			{"business 8.2cpp", 6_150, 75_000, 8.2},
			{"sub-cent", 250, 50_000, 0.5},
			{"zero points guarded", 1000, 0, 0},
			{"negative points guarded", 1000, -10, 0},
			{"zero cash", 0, 50_000, 0},
		}
		for _, c := range cases {
			t.Run(c.name, func(t *testing.T) {
				floatNear(t, computeCPP(c.cash, c.points), c.want)
			})
		}
	})

	t.Run("netCashCAD", func(t *testing.T) {
		tax := func(v float64) *float64 { return &v }
		cases := []struct {
			name  string
			cash  float64
			taxes *float64
			want  float64
		}{
			{"nil taxes passes through", 1000, nil, 1000},
			{"subtracts taxes", 1000, tax(300), 700},
			{"taxes exceed fare clamps to 0", 100, tax(300), 0},
			{"taxes equal fare clamps to 0", 300, tax(300), 0},
			{"zero taxes", 1000, tax(0), 1000},
		}
		for _, c := range cases {
			t.Run(c.name, func(t *testing.T) {
				floatNear(t, netCashCAD(c.cash, c.taxes), c.want)
			})
		}
	})

	t.Run("CPP on net-of-tax cash", func(t *testing.T) {
		// (1000-300)/50000*100 = 1.4¢/pt — the taxes path the user actually pays.
		tax := 300.0
		floatNear(t, computeCPP(netCashCAD(1000, &tax), 50_000), 1.4)
	})
}

// ── (4) parseTravelQuery golden origin/destination/cabin extraction ───────────
//
// Locks the route/cabin parser, including the "Toronto to Copenhagen" case whose
// final origin/dest is deterministic ONLY via the Canadian-airport fixup (the raw
// city-map ordering is non-deterministic before that correction). Date assertions
// avoid exact literals where extractDate is time.Now()-relative.
func TestAIEval_ParseTravelQuery(t *testing.T) {
	cases := []struct {
		name       string
		msg        string
		wantNil    bool
		wantOrigin string
		wantDest   string
		wantCabin  string
		checkDate  func(*testing.T, string) // nil → skip date assertion
	}{
		{
			name: "toronto to copenhagen business flexible",
			msg:  "Toronto to Copenhagen business class, flexible dates",
			// codes come from the city map; canadian-fixup forces YYZ to origin.
			wantOrigin: "YYZ", wantDest: "CPH", wantCabin: "business",
			checkDate: assertFutureISODate,
		},
		{
			name: "explicit IATA codes economy far-future ISO",
			msg:  "points to fly YYZ to LHR on 2030-06-15",
			// canadian-fixup is a no-op: YYZ is already the origin.
			wantOrigin: "YYZ", wantDest: "LHR", wantCabin: "economy",
			checkDate: func(t *testing.T, d string) {
				t.Helper()
				if d != "2030-06-15" {
					t.Errorf("date = %q, want 2030-06-15", d)
				}
			},
		},
		{
			name: "vancouver to tokyo first class",
			msg:  "Vancouver to Tokyo first class",
			// "first class" checked AFTER "business"; no "business" substring here.
			wantOrigin: "YVR", wantDest: "NRT", wantCabin: "first",
			checkDate: assertFutureISODate,
		},
		{
			name: "premium economy",
			msg:  "YUL to CDG premium economy",
			// "premium" substring → premium_economy.
			wantOrigin: "YUL", wantDest: "CDG", wantCabin: "premium_economy",
			checkDate: assertFutureISODate,
		},
		{
			name:    "fewer than two codes returns nil",
			msg:     "how do points actually work anyway",
			wantNil: true,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := parseTravelQuery(c.msg)
			if c.wantNil {
				if got != nil {
					t.Fatalf("want nil, got %+v", got)
				}
				return
			}
			if got == nil {
				t.Fatalf("got nil, want %s→%s", c.wantOrigin, c.wantDest)
			}
			if got.Origin != c.wantOrigin {
				t.Errorf("origin = %q, want %q", got.Origin, c.wantOrigin)
			}
			if got.Destination != c.wantDest {
				t.Errorf("destination = %q, want %q", got.Destination, c.wantDest)
			}
			if got.Cabin != c.wantCabin {
				t.Errorf("cabin = %q, want %q", got.Cabin, c.wantCabin)
			}
			if got.Passengers != 1 {
				t.Errorf("passengers = %d, want 1", got.Passengers)
			}
			if c.checkDate != nil {
				c.checkDate(t, got.Date)
			}
		})
	}
}

// ── (5) Self-check JSON extraction — covered elsewhere, asserted here only to ──
//
//	pin the shared contract and fail loudly if that coverage is deleted.
//
// extractFirstJSONObject's full table (plain / wrapped-in-prose / fenced / nested
// braces / brace-in-string / no-json / unbalanced) lives in
// selfcheck_test.go:TestSelfCheckExtractFirstJSONObject. We do not duplicate it;
// this single smoke assertion guards against that file being removed.
func TestAIEval_SelfCheckJSONExtraction_CoveredElsewhere(t *testing.T) {
	const wrapped = `Sure, here is the verdict: {"ok":false,"issues":["x"]} hope that helps`
	if got := extractFirstJSONObject(wrapped); got != `{"ok":false,"issues":["x"]}` {
		t.Fatalf("extractFirstJSONObject regressed: got %q — see selfcheck_test.go for full coverage", got)
	}
}

// ── (6) OPTIONAL key-gated live smoke ─────────────────────────────────────────
//
// Mirrors the repo's external-service gate (applications_integration_test.go:
// os.Getenv + t.Skip). It is intentionally a skip-only placeholder: a real live
// smoke would need to construct an *AIService whose Chat path dereferences
// wallet/card/transfer/valuation repos, and wiring honest empty-returning fakes
// for an LLM round-trip is out of scope for a DETERMINISTIC eval. Per the brief,
// it is better to skip cleanly than to half-wire a live path. The two gates match
// the documented contract so an operator can see exactly what is required.
func TestAIEval_Live(t *testing.T) {
	if os.Getenv("ANTHROPIC_API_KEY") == "" || os.Getenv("RUN_AI_EVALS") != "1" {
		t.Skip("live eval disabled: set ANTHROPIC_API_KEY and RUN_AI_EVALS=1 to enable")
	}
	t.Skip("live smoke body intentionally omitted — deterministic suite makes no model calls; " +
		"a no-repo Chat smoke path is not wired (see comment)")
}
