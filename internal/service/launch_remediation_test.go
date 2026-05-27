package service

import (
	"context"
	"math"
	"testing"

	"maplerewards/internal/model"
)

// Launch-remediation regression suite (2026-05-27 production-readiness sweep).
// Pins the cap-bounded spend-logging earn, the corrected Aeroplan exposure
// buying-power math, and the thin-sample cash-price selection. Mocks follow
// .claude/rules/go-tests.md (function-field / map-backed stubs); mockSpendRepo
// and walletTestRepo are reused from optimizer_test.go / wallet_test.go.

// cappedPurchaseRate must never let a persisted spend entry store an uncapped
// spend×rate — the same unbounded-projection bug the optimizer remediation
// fixed, but on the write path. It mirrors the optimizer's per-purchase
// (priorSpend=0) scoring exactly.
func TestCappedPurchaseRate_BoundsEarn(t *testing.T) {
	// empty capGroups → GetCapGroupForCard returns an error → no shared group,
	// so the per-multiplier / default-guardrail branches are exercised.
	svc := NewWalletService(nil, nil, &mockSpendRepo{}, nil, nil)

	cap20k := 20000.0
	monthly := "monthly"

	cases := []struct {
		name     string
		m        model.CardMultiplier
		amount   float64
		wantRate float64
	}{
		{
			// Flat card (bonus == fallback): the blend is mathematically the
			// flat rate, so a legit unlimited card is unaffected even at $1M.
			name:     "flat card unaffected at huge amount",
			m:        model.CardMultiplier{EarnRate: 1, FallbackEarnRate: 1},
			amount:   1_000_000,
			wantRate: 1,
		},
		{
			// Per-multiplier cap: 5x to $20k, 1x after; $30k spend →
			// (20000*5 + 10000*1) / 30000 = 110000/30000 = 3.6667.
			name:     "per-multiplier cap blends down",
			m:        model.CardMultiplier{EarnRate: 5, FallbackEarnRate: 1, CapAmount: &cap20k, CapPeriod: &monthly},
			amount:   30000,
			wantRate: (20000*5 + 10000*1) / 30000.0,
		},
		{
			// No modelled cap, accelerated 5x: default $20k/annual guardrail
			// binds; $100k → (20000*5 + 80000*1) / 100000 = 180000/100000 = 1.8.
			// This is the founder's "500k points on $100k" class — bounded.
			name:     "no-cap accelerated bounded by guardrail",
			m:        model.CardMultiplier{EarnRate: 5, FallbackEarnRate: 1},
			amount:   100000,
			wantRate: (20000*5 + 80000*1) / 100000.0,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := svc.cappedPurchaseRate(context.Background(), "card", "cat", tc.amount, &tc.m)
			if math.Abs(got-tc.wantRate) > 1e-9 {
				t.Fatalf("rate = %v, want %v", got, tc.wantRate)
			}
			// Hard invariant: for an accelerated multiplier the persisted points
			// must be strictly below the old uncapped spend×earnRate.
			if tc.m.EarnRate > tc.m.FallbackEarnRate {
				capped := tc.amount * got
				uncapped := tc.amount * tc.m.EarnRate
				if capped >= uncapped {
					t.Fatalf("capped points %.0f not below uncapped %.0f", capped, uncapped)
				}
			}
		})
	}
}

// ProjectAeroplanJune2026 exposure must model lost buying power as H/(1+H), not
// the raw hike H (which overstated it and made value_after too low).
func TestProjectAeroplan_ExposureUsesBuyingPowerLoss(t *testing.T) {
	repo := &walletTestRepo{
		getUserBySession: func(context.Context, string) (*model.User, error) {
			return &model.User{ID: "u"}, nil
		},
		getUserCards: func(context.Context, string) ([]model.UserCard, error) {
			return []model.UserCard{{
				PointBalance: 100000,
				Card:         &model.Card{LoyaltyProgram: &model.LoyaltyProgram{Slug: "aeroplan", BaseCPP: 2.0}},
			}}, nil
		},
	}
	svc := NewDevaluationService(repo, nil)

	proj, err := svc.ProjectAeroplanJune2026(context.Background(), "sess")
	if err != nil {
		t.Fatalf("project: %v", err)
	}

	const burn = 0.30 // aeroplanJune2026BurnFraction
	const hike = 0.171 // aeroplanJune2026HikePercent
	valueToday := 100000 * 2.0 / 100.0 // $2000
	want := math.Round(valueToday*burn*(hike/(1+hike))*100) / 100

	if math.Abs(proj.Exposure-want) > 0.01 {
		t.Fatalf("exposure = %v, want %v (H/(1+H) buying-power loss)", proj.Exposure, want)
	}
	// Must be strictly below the naive raw-H formula it replaced.
	if naive := valueToday * burn * hike; proj.Exposure >= naive {
		t.Fatalf("exposure %v not below naive raw-H %v", proj.Exposure, naive)
	}
	// value_after = value_today - exposure must stay consistent.
	if math.Abs(proj.ValueAfter-(proj.ValueToday-proj.Exposure)) > 0.01 {
		t.Fatalf("value_after %v inconsistent with today-exposure %v",
			proj.ValueAfter, proj.ValueToday-proj.Exposure)
	}
}

// titleCabin upper-cases the first letter without the `Cabin[:1]` panic on an
// empty string (reachable from the legacy Chat() path, which is NOT panic-
// recovered).
func TestTitleCabin_EmptyDoesNotPanic(t *testing.T) {
	cases := map[string]string{"": "", "business": "Business", "economy": "Economy", "first": "First"}
	for in, want := range cases {
		if got := titleCabin(in); got != want {
			t.Errorf("titleCabin(%q) = %q, want %q", in, got, want)
		}
	}
}

// extractPriceFromResults must not let a single high outlier dominate on a thin
// sample: <4 parsed prices use the median, ≥4 keep the 75th percentile.
func TestExtractPriceFromResults_ThinSampleUsesMedian(t *testing.T) {
	// 3 prices: old 75th-pctile idx (2) picked the $9000 outlier; median (idx 1)
	// picks the representative $500.
	got := extractPriceFromResults([]tavilyResult{{Content: "fares $100, $500, $9000"}}, 50)
	if got != 500 {
		t.Fatalf("3-sample: got %v, want median 500 (not the $9000 outlier)", got)
	}
	// 4 prices: 75th percentile (idx 3) → $400.
	got4 := extractPriceFromResults([]tavilyResult{{Content: "$100 $200 $300 $400"}}, 50)
	if got4 != 400 {
		t.Fatalf("4-sample: got %v, want 75th-pctile 400", got4)
	}
}
