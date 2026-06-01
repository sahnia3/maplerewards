package service

import (
	"context"
	"testing"
	"time"

	"maplerewards/internal/model"
)

// ── mocks (function-field interface impls per .claude/rules/go-tests.md) ──────

type mockChurnWallet struct {
	user  *model.User
	cards []model.UserCard
}

func (m *mockChurnWallet) GetUserBySession(_ context.Context, _ string) (*model.User, error) {
	return m.user, nil
}
func (m *mockChurnWallet) GetUserCards(_ context.Context, _ string) ([]model.UserCard, error) {
	return m.cards, nil
}

type mockChurnCards struct{ catalog []model.Card }

func (m *mockChurnCards) ListCards(_ context.Context) ([]model.Card, error) {
	return m.catalog, nil
}

type mockChurnSpend struct {
	stats  *model.SpendStats
	months int
}

func (m *mockChurnSpend) GetSpendStats(_ context.Context, _ string) (*model.SpendStats, error) {
	return m.stats, nil
}
func (m *mockChurnSpend) SpendMonthsObserved(_ context.Context, _ string) (int, error) {
	return m.months, nil
}

// mockChurnEligibility returns a per-card verdict from a fixed map; cards absent
// from the map are treated as eligible ("ok").
type mockChurnEligibility struct{ byCard map[string]*EligibilityResult }

func (m *mockChurnEligibility) CheckEligibilityBatch(_ context.Context, _ string, cardIDs []string) (map[string]*EligibilityResult, error) {
	out := make(map[string]*EligibilityResult, len(cardIDs))
	for _, id := range cardIDs {
		if r, ok := m.byCard[id]; ok {
			out[id] = r
		} else {
			out[id] = &EligibilityResult{CardID: id, Severity: "ok", Reason: "No known restriction."}
		}
	}
	return out, nil
}

// ── helpers ──────────────────────────────────────────────────────────────────

func churnCard(id, name, issuer, progName, progType string, baseCPP float64, bonus int, minSpend float64, months int, fee float64) model.Card {
	return model.Card{
		ID:                   id,
		Name:                 name,
		Issuer:               issuer,
		LoyaltyProgramID:     "lp-" + id,
		AnnualFee:            fee,
		WelcomeBonusPoints:   bonus,
		WelcomeBonusMinSpend: minSpend,
		WelcomeBonusMonths:   months,
		IsActive:             true,
		LoyaltyProgram: &model.LoyaltyProgram{
			Name:        progName,
			ProgramType: progType,
			BaseCPP:     baseCPP,
		},
	}
}

func candByID(t *testing.T, list []model.ChurnCandidate, id string) model.ChurnCandidate {
	t.Helper()
	for _, c := range list {
		if c.CardID == id {
			return c
		}
	}
	t.Fatalf("candidate %q not found in list", id)
	return model.ChurnCandidate{}
}

// ── tests ────────────────────────────────────────────────────────────────────

// Ranking by net first-year value (feasible bonuses first), already-held
// excluded, no-bonus excluded.
func TestChurn_RankingAndExclusions(t *testing.T) {
	wallet := &mockChurnWallet{
		user: &model.User{ID: "u1"},
		// User already holds c-held — must NOT appear as a candidate.
		cards: []model.UserCard{{CardID: "c-held"}},
	}
	cards := &mockChurnCards{catalog: []model.Card{
		// All feasible (low min-spend), distinct net values.
		churnCard("c-held", "Held Card", "BMO", "BMO Rewards", "bank", 1.0, 50000, 1000, 6, 120),
		churnCard("c-high", "High Net", "American Express", "Amex MR", "bank", 2.0, 100000, 1000, 6, 150), // value 2000, net 1850
		churnCard("c-mid", "Mid Net", "Scotiabank", "Scene+", "bank", 1.0, 100000, 1000, 6, 100),          // value 1000, net 900
		churnCard("c-nobonus", "No Bonus", "CIBC", "Aventura", "bank", 1.0, 0, 0, 0, 120),                 // excluded (no bonus)
	}}
	// 12 months of $24k total = $2k/mo → covers $1000/6mo ($167/mo) easily.
	spend := &mockChurnSpend{stats: &model.SpendStats{TotalSpend: 24000}, months: 12}
	elig := &mockChurnEligibility{}

	svc := NewChurnPlannerService(wallet, cards, spend, elig)
	plan, err := svc.Plan(context.Background(), "sess")
	if err != nil {
		t.Fatalf("plan: %v", err)
	}

	for _, c := range plan.Recommendations {
		if c.CardID == "c-held" {
			t.Error("held card leaked into recommendations")
		}
		if c.CardID == "c-nobonus" {
			t.Error("no-bonus card leaked into recommendations")
		}
	}
	if len(plan.Recommendations) != 2 {
		t.Fatalf("want 2 recommendations, got %d", len(plan.Recommendations))
	}
	if plan.Recommendations[0].CardID != "c-high" || plan.Recommendations[1].CardID != "c-mid" {
		t.Errorf("ranking wrong: got [%s, %s], want [c-high, c-mid]",
			plan.Recommendations[0].CardID, plan.Recommendations[1].CardID)
	}
	if plan.BestNextCard != "High Net" {
		t.Errorf("best_next_card: got %q want High Net", plan.BestNextCard)
	}
	// Net first-year value sanity: 100000 * 2.0 / 100 = 2000; minus 150 fee = 1850.
	if got := plan.Recommendations[0].NetFirstYearValueCAD; got != 1850 {
		t.Errorf("c-high net first-year: got %.2f want 1850", got)
	}
	// total_potential = feasible+eligible bonus values = 2000 + 1000.
	if got := plan.TotalPotentialBonusValueCAD; got != 3000 {
		t.Errorf("total_potential_bonus_value: got %.2f want 3000", got)
	}
}

// Cooldown-blocked candidate shows reason + earliest eligible date and is moved
// to the blocked list, out of recommendations.
func TestChurn_CooldownBlocked(t *testing.T) {
	eligibleAt := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	wallet := &mockChurnWallet{user: &model.User{ID: "u1"}}
	cards := &mockChurnCards{catalog: []model.Card{
		churnCard("c-ok", "Open Card", "American Express", "Amex MR", "bank", 2.0, 60000, 1000, 6, 150),
		churnCard("c-cooldown", "TD Blocked", "TD Bank", "TD Rewards", "bank", 1.0, 90000, 1000, 6, 120),
	}}
	spend := &mockChurnSpend{stats: &model.SpendStats{TotalSpend: 24000}, months: 12}
	elig := &mockChurnEligibility{byCard: map[string]*EligibilityResult{
		"c-cooldown": {
			CardID:     "c-cooldown",
			Severity:   "warn",
			Reason:     "Last TD Bank application was 30 day(s) ago. The typical cooldown is 365 days — wait ~335 more day(s) to clear it.",
			EligibleAt: &eligibleAt,
		},
	}}

	svc := NewChurnPlannerService(wallet, cards, spend, elig)
	plan, err := svc.Plan(context.Background(), "sess")
	if err != nil {
		t.Fatalf("plan: %v", err)
	}

	for _, c := range plan.Recommendations {
		if c.CardID == "c-cooldown" {
			t.Fatal("cooldown-blocked card leaked into recommendations")
		}
	}
	b := candByID(t, plan.Blocked, "c-cooldown")
	if b.Eligible {
		t.Error("blocked card marked eligible")
	}
	if b.BlockReason == "" {
		t.Error("blocked card missing block_reason")
	}
	if b.EarliestEligibleDate == nil || *b.EarliestEligibleDate != "2026-09-01" {
		t.Errorf("earliest_eligible_date: got %v want 2026-09-01", b.EarliestEligibleDate)
	}
	// The blocked card's bonus must NOT count toward potential (it's not bankable now).
	// c-ok: 60000 * 2.0 / 100 = 1200 only.
	if got := plan.TotalPotentialBonusValueCAD; got != 1200 {
		t.Errorf("total_potential should exclude blocked bonus: got %.2f want 1200", got)
	}
}

// Min-spend infeasible is flagged and sorts behind feasible cards even when its
// net value is higher.
func TestChurn_MinSpendFeasibility(t *testing.T) {
	wallet := &mockChurnWallet{user: &model.User{ID: "u1"}}
	cards := &mockChurnCards{catalog: []model.Card{
		// Huge bonus but $15k/3mo = $5k/mo needed — infeasible at $2k/mo.
		churnCard("c-bigbutfar", "Whale Bonus", "American Express", "Amex MR", "bank", 1.65, 100000, 15000, 3, 699),
		// Modest bonus, easy min spend — feasible.
		churnCard("c-easy", "Easy Bonus", "Scotiabank", "Scene+", "bank", 1.0, 40000, 1000, 6, 0),
	}}
	// $2k/mo capacity.
	spend := &mockChurnSpend{stats: &model.SpendStats{TotalSpend: 24000}, months: 12}
	elig := &mockChurnEligibility{}

	svc := NewChurnPlannerService(wallet, cards, spend, elig)
	plan, err := svc.Plan(context.Background(), "sess")
	if err != nil {
		t.Fatalf("plan: %v", err)
	}

	whale := candByID(t, plan.Recommendations, "c-bigbutfar")
	easy := candByID(t, plan.Recommendations, "c-easy")
	if whale.MinSpendFeasible {
		t.Errorf("whale bonus should be infeasible: $5000/mo needed, monthly_needed=%.2f", whale.MonthlySpendNeededCAD)
	}
	if !easy.MinSpendFeasible {
		t.Error("easy bonus should be feasible")
	}
	if whale.MonthlySpendNeededCAD != 5000 {
		t.Errorf("whale monthly_spend_needed: got %.2f want 5000", whale.MonthlySpendNeededCAD)
	}
	// Feasible-first ordering: c-easy must rank ahead of the higher-net but
	// infeasible c-bigbutfar.
	if plan.Recommendations[0].CardID != "c-easy" {
		t.Errorf("feasible card should rank first: got %s", plan.Recommendations[0].CardID)
	}
	// Only the feasible bonus counts toward potential: 40000 * 1.0 / 100 = 400.
	if got := plan.TotalPotentialBonusValueCAD; got != 400 {
		t.Errorf("total_potential should exclude infeasible bonus: got %.2f want 400", got)
	}
}

// No spend history → avg monthly spend 0 → every min-spend>0 bonus infeasible.
func TestChurn_NoSpendHistoryInfeasible(t *testing.T) {
	wallet := &mockChurnWallet{user: &model.User{ID: "u1"}}
	cards := &mockChurnCards{catalog: []model.Card{
		churnCard("c-a", "Card A", "American Express", "Amex MR", "bank", 2.0, 60000, 3000, 3, 150),
		// Zero min spend → feasible even with no history.
		churnCard("c-free", "No Min Spend", "Brim Financial", "Brim Rewards", "bank", 1.0, 10000, 0, 0, 0),
	}}
	spend := &mockChurnSpend{stats: &model.SpendStats{TotalSpend: 0}, months: 0}
	elig := &mockChurnEligibility{}

	svc := NewChurnPlannerService(wallet, cards, spend, elig)
	plan, err := svc.Plan(context.Background(), "sess")
	if err != nil {
		t.Fatalf("plan: %v", err)
	}

	if candByID(t, plan.Recommendations, "c-a").MinSpendFeasible {
		t.Error("card with min spend should be infeasible when no spend history")
	}
	if !candByID(t, plan.Recommendations, "c-free").MinSpendFeasible {
		t.Error("zero-min-spend card should be feasible even with no history")
	}
}

// Cashback vs points value: base_cpp is the single conversion source for both.
func TestChurn_CashbackVsPointsValue(t *testing.T) {
	wallet := &mockChurnWallet{user: &model.User{ID: "u1"}}
	cards := &mockChurnCards{catalog: []model.Card{
		// Points program: 75000 × 2.0¢ / 100 = $1500.
		churnCard("c-points", "Points Card", "American Express", "Aeroplan", "airline", 2.0, 75000, 1000, 6, 0),
		// Cashback (Air Miles): 7000 × 10.5¢ / 100 = $735 — value comes straight
		// from base_cpp, no name special-casing.
		churnCard("c-cashback", "Air Miles Card", "BMO", "Air Miles", "cashback", 10.5, 7000, 1000, 6, 0),
	}}
	spend := &mockChurnSpend{stats: &model.SpendStats{TotalSpend: 24000}, months: 12}
	elig := &mockChurnEligibility{}

	svc := NewChurnPlannerService(wallet, cards, spend, elig)
	plan, err := svc.Plan(context.Background(), "sess")
	if err != nil {
		t.Fatalf("plan: %v", err)
	}

	if got := candByID(t, plan.Recommendations, "c-points").WelcomeBonusValueCAD; got != 1500 {
		t.Errorf("points bonus value: got %.2f want 1500", got)
	}
	if got := candByID(t, plan.Recommendations, "c-cashback").WelcomeBonusValueCAD; got != 735 {
		t.Errorf("cashback bonus value: got %.2f want 735", got)
	}
}
