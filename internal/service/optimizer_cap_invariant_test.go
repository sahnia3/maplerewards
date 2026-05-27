package service

import (
	"context"
	"testing"

	"maplerewards/internal/model"
)

// P5 — the cap-integrity verification gate (docs/OPTIMIZER-CAP-AUDIT.md).
//
// INVARIANT: for any spend amount, a card may never project more points than
//   cap×bonus + max(0, spend−cap)×fallback
// and IsCapHit must become true once spend exceeds the remaining cap. This is
// the exact property whose absence produced the founder bug (Scotiabank Gold
// = 500,000 pts on $100k). These table-driven tests assert it across the
// matrix: per-multiplier caps, shared cap groups, and the unverified
// guardrail, at spend = {cap-1, cap, cap+1, 5k, 10k, 100k}, for points and
// cashback earn types, with prior=0 (single-purchase / no history).

func capInvariantBound(spend, cap, bonus, fallback float64) float64 {
	if spend <= cap {
		return spend * bonus
	}
	return cap*bonus + (spend-cap)*fallback
}

func TestOptimizer_CapInvariant_Matrix(t *testing.T) {
	const eps = 0.5 // rounding tolerance on blended points

	type row struct {
		name      string
		earnType  string  // points|cashback_pct
		bonus     float64
		fallback  float64
		cap       float64
		capPeriod string
		shared    bool // model as cap_group instead of per-multiplier cap
	}
	rows := []row{
		{"points_percat_annual", "points", 5.0, 1.0, 50000, "annual", false},
		{"points_percat_monthly", "points", 5.0, 1.0, 500, "monthly", false},
		{"points_shared_annual", "points", 5.0, 1.0, 50000, "annual", true},
		{"cashback_percat_annual", "cashback_pct", 4.0, 1.0, 30000, "annual", false},
		{"cashback_percat_monthly", "cashback_pct", 5.0, 1.0, 500, "monthly", false},
		{"cashback_shared_monthly", "cashback_pct", 2.0, 0.5, 500, "monthly", true},
	}
	spends := func(cap float64) []float64 {
		return []float64{cap - 1, cap, cap + 1, 5000, 10000, 100000}
	}

	for _, r := range rows {
		for _, spend := range spends(r.cap) {
			if spend <= 0 {
				continue
			}
			r, spend := r, spend
			t.Run(r.name, func(t *testing.T) {
				ts := newTestOptimizer()
				ts.cardRepo.categories["groceries"] = &model.Category{ID: "cat-g", Slug: "groceries"}
				ts.walletRepo.users["s"] = &model.User{ID: "u"}
				ts.walletRepo.cards["u"] = []model.UserCard{{
					ID: "uc", UserID: "u", CardID: "c1",
					Card: &model.Card{ID: "c1", Name: r.name,
						LoyaltyProgramID: "lp", LoyaltyProgram: &model.LoyaltyProgram{ID: "lp", Slug: "prog", BaseCPP: 1.0}},
				}}
				ts.valuationRepo.cpps["prog:base"] = 1.0 // 1¢/pt → points==dollar*1

				mul := &model.CardMultiplier{
					EarnRate: r.bonus, EarnType: r.earnType, FallbackEarnRate: r.fallback,
				}
				if r.shared {
					ts.spendRepo.capGroups["c1:cat-g"] = &model.CapGroup{
						ID: "cg", CardID: "c1", Name: r.name,
						CapAmount: r.cap, CapPeriod: r.capPeriod, CategoryIDs: []string{"cat-g"},
					}
				} else {
					cp := r.capPeriod
					mul.CapAmount = &r.cap
					mul.CapPeriod = &cp
				}
				ts.cardRepo.multipliers["c1:cat-g"] = mul

				recs, err := ts.svc.GetBestCard(context.Background(), model.OptimizeRequest{
					SessionID: "s", CategorySlug: "groceries", SpendAmount: spend,
				})
				if err != nil {
					t.Fatalf("spend %.0f: unexpected error %v", spend, err)
				}
				if len(recs) == 0 {
					t.Fatalf("spend %.0f: no recommendation", spend)
				}
				rec := recs[0]

				bound := capInvariantBound(spend, r.cap, r.bonus, r.fallback)
				var projected float64
				if r.earnType == "cashback_pct" {
					// dollar value = spend × effRate/100; compare in "rate units".
					// rec.DollarValue is already the projected dollar amount, so
					// we bound it directly (no intermediate `projected` here).
					bound = capInvariantBound(spend, r.cap, r.bonus, r.fallback) / 100
					if rec.DollarValue > bound+eps {
						t.Errorf("spend %.0f: cashback $%.2f exceeds cap bound $%.2f",
							spend, rec.DollarValue, bound)
					}
				} else {
					projected = rec.PointsEarned
					if projected > bound+eps {
						t.Errorf("spend %.0f: %.2f pts exceeds invariant bound %.2f (cap=%.0f bonus=%.1f fb=%.1f)",
							spend, projected, bound, r.cap, r.bonus, r.fallback)
					}
				}

				// IsCapHit must be set once spend strictly exceeds the cap.
				if spend > r.cap && !rec.IsCapHit {
					t.Errorf("spend %.0f > cap %.0f: expected IsCapHit=true", spend, r.cap)
				}
				if spend < r.cap && rec.IsCapHit {
					t.Errorf("spend %.0f < cap %.0f: unexpected IsCapHit=true", spend, r.cap)
				}
			})
		}
	}
}

// Regression for the conditional-guardrail gap: a multiplier with NO modelled
// cap (no cap group, no CapAmount) that the OLD heuristic let escape because
// `EarnRate > FallbackEarnRate && EarnRate > 1` was false — e.g. accelerated
// but sub-2x, or mis-modelled fallback. The unconditional guardrail must bound
// EVERY no-cap accelerated multiplier by defaultUnverifiedAnnualCap, while
// leaving genuinely flat (bonus == fallback) unlimited cards unchanged.
func TestOptimizer_NoCapDefaultBranch_AlwaysBounded(t *testing.T) {
	const eps = 0.5
	cases := []struct {
		name             string
		bonus, fallback  float64
		flat             bool // genuinely unlimited flat card — must NOT be bounded down
	}{
		{"accelerated_sub2x_escaped_old_heuristic", 1.5, 1.0, false},
		{"accelerated_below1_escaped_old_heuristic", 0.8, 0.5, false},
		{"mismodelled_fallback_zero", 2.0, 0.0, false},
		{"flat_unlimited_legit", 1.5, 1.5, true},
	}
	for _, c := range cases {
		c := c
		t.Run(c.name, func(t *testing.T) {
			ts := newTestOptimizer()
			ts.cardRepo.categories["groceries"] = &model.Category{ID: "cat-g", Slug: "groceries"}
			ts.walletRepo.users["s"] = &model.User{ID: "u"}
			ts.walletRepo.cards["u"] = []model.UserCard{{
				ID: "uc", UserID: "u", CardID: "c1",
				Card: &model.Card{ID: "c1", Name: c.name,
					LoyaltyProgramID: "lp", LoyaltyProgram: &model.LoyaltyProgram{ID: "lp", Slug: "prog", BaseCPP: 1.0}},
			}}
			ts.valuationRepo.cpps["prog:base"] = 1.0
			// No cap group, no CapAmount → falls into the default branch.
			ts.cardRepo.multipliers["c1:cat-g"] = &model.CardMultiplier{
				EarnRate: c.bonus, EarnType: "points", FallbackEarnRate: c.fallback,
			}

			const spend = 100000.0
			recs, err := ts.svc.GetBestCard(context.Background(), model.OptimizeRequest{
				SessionID: "s", CategorySlug: "groceries", SpendAmount: spend,
			})
			if err != nil || len(recs) == 0 {
				t.Fatalf("no recommendation: err=%v", err)
			}
			got := recs[0].PointsEarned

			if c.flat {
				// Legit flat unlimited card: value must be unchanged (spend×rate),
				// not bounded down — under-promising would break real cards.
				if want := spend * c.bonus; got < want-eps {
					t.Errorf("flat unlimited card under-projected: got %.0f want %.0f", got, want)
				}
				return
			}
			// Accelerated/mis-modelled: must be bounded by the default cap.
			bound := capInvariantBound(spend, defaultUnverifiedAnnualCap, c.bonus, c.fallback)
			if got > bound+eps {
				t.Errorf("no-cap projection %.0f exceeds default-cap bound %.0f (bonus=%.1f fb=%.1f) — unbounded-projection class regression",
					got, bound, c.bonus, c.fallback)
			}
		})
	}
}

// The founder's exact scenario, end to end through GetBestCard: a 5x grocery
// card with a $50k annual shared cap must NOT project 500,000 pts on $100k —
// it must blend to 50k×5 + 50k×1 = 300,000.
func TestOptimizer_ScotiaGoldScenario_Bounded(t *testing.T) {
	ts := newTestOptimizer()
	ts.cardRepo.categories["groceries"] = &model.Category{ID: "cat-g", Slug: "groceries"}
	ts.walletRepo.users["s"] = &model.User{ID: "u"}
	ts.walletRepo.cards["u"] = []model.UserCard{{
		ID: "uc", UserID: "u", CardID: "c1",
		Card: &model.Card{ID: "c1", Name: "Scotiabank Gold American Express",
			LoyaltyProgramID: "lp", LoyaltyProgram: &model.LoyaltyProgram{ID: "lp", Slug: "scene", BaseCPP: 1.0}},
	}}
	ts.valuationRepo.cpps["scene:base"] = 1.0
	ts.cardRepo.multipliers["c1:cat-g"] = &model.CardMultiplier{
		EarnRate: 5.0, EarnType: "points", FallbackEarnRate: 1.0,
	}
	ts.spendRepo.capGroups["c1:cat-g"] = &model.CapGroup{
		ID: "cg", CardID: "c1", Name: "Scotia Gold Amex $50K Annual Accelerated Cap",
		CapAmount: 50000, CapPeriod: "annual", CategoryIDs: []string{"cat-g"},
	}

	recs, err := ts.svc.GetBestCard(context.Background(), model.OptimizeRequest{
		SessionID: "s", CategorySlug: "groceries", SpendAmount: 100000,
	})
	if err != nil {
		t.Fatalf("error: %v", err)
	}
	got := recs[0].PointsEarned
	if got > 300000+0.5 {
		t.Fatalf("REGRESSION: $100k @ Scotia Gold projected %.0f pts (must be ≤ 300,000 — the founder bug)", got)
	}
	if !recs[0].IsCapHit {
		t.Error("expected IsCapHit=true at $100k over a $50k cap")
	}
}
