package service

import (
	"context"
	"testing"

	"maplerewards/internal/model"
)

type mockRenWallet struct {
	user  *model.User
	cards []model.UserCard
}

func (m *mockRenWallet) GetUserBySession(_ context.Context, _ string) (*model.User, error) {
	return m.user, nil
}
func (m *mockRenWallet) GetUserCards(_ context.Context, _ string) ([]model.UserCard, error) {
	return m.cards, nil
}

type mockRenSpend struct {
	stats  *model.SpendStats
	months int
}

func (m *mockRenSpend) GetSpendStats(_ context.Context, _ string) (*model.SpendStats, error) {
	return m.stats, nil
}
func (m *mockRenSpend) GetPointsSeries(_ context.Context, _ string, _ int) (*model.PointsSeries, error) {
	return &model.PointsSeries{Months: []model.PointsMonth{}}, nil
}
func (m *mockRenSpend) SpendMonthsObserved(_ context.Context, _ string) (int, error) {
	return m.months, nil
}

type mockRenCredit struct{ credits []model.CardCreditStatus }

func (m *mockRenCredit) ListUserCardCredits(_ context.Context, _ string) ([]model.CardCreditStatus, error) {
	return m.credits, nil
}

type mockRenCard struct{ cands []model.Card }

func (m *mockRenCard) DowngradeCandidates(_ context.Context, _, _ string, _ float64, _ string) ([]model.Card, error) {
	return m.cands, nil
}

func renUCard(id, name, issuer, prog string, fee float64) model.UserCard {
	return model.UserCard{
		CardID: id,
		Card: &model.Card{
			ID:               id,
			Name:             name,
			Issuer:           issuer,
			LoyaltyProgramID: prog,
			AnnualFee:        fee,
			LoyaltyProgram:   &model.LoyaltyProgram{Name: "Test Program"},
		},
	}
}

func TestRenewal_Verdicts(t *testing.T) {
	wallet := &mockRenWallet{
		user: &model.User{ID: "u1"},
		cards: []model.UserCard{
			renUCard("c-keep", "Keep Card", "Amex", "p1", 150),
			renUCard("c-credits", "Credit Card", "Amex", "p1", 150),
			renUCard("c-cancel", "Cancel Card", "TD", "p2", 150),
			renUCard("c-free", "Free Card", "Brim", "p3", 0),
		},
	}
	spend := &mockRenSpend{months: 12, stats: &model.SpendStats{ByCard: []model.CardStat{
		{CardName: "Keep Card", TotalValue: 300},
		{CardName: "Credit Card", TotalValue: 50},
		{CardName: "Cancel Card", TotalValue: 20},
	}}}
	credit := &mockRenCredit{credits: []model.CardCreditStatus{
		{CardID: "c-credits", ValueCAD: 120, RedeemedAmount: 0},
	}}
	card := &mockRenCard{cands: []model.Card{{ID: "c-dg", Name: "No-Fee TD", AnnualFee: 0}}}

	svc := NewRenewalService(wallet, spend, credit, card)
	rep, err := svc.Assess(context.Background(), "sess")
	if err != nil {
		t.Fatalf("assess: %v", err)
	}

	got := make(map[string]model.RenewalAssessment, len(rep.Assessments))
	for _, a := range rep.Assessments {
		got[a.CardID] = a
	}

	if v := got["c-keep"].Verdict; v != "keep" {
		t.Errorf("keep card: got %q want keep (rationale: %s)", v, got["c-keep"].Rationale)
	}
	if v := got["c-credits"].Verdict; v != "use_credits" {
		t.Errorf("credit card: got %q want use_credits (rationale: %s)", v, got["c-credits"].Rationale)
	}
	if v := got["c-cancel"].Verdict; v != "downgrade_or_cancel" {
		t.Errorf("cancel card: got %q want downgrade_or_cancel", v)
	}
	if len(got["c-cancel"].DowngradeOptions) == 0 {
		t.Errorf("cancel card: expected downgrade options from catalog")
	}
	if v := got["c-free"].Verdict; v != "keep_no_fee" {
		t.Errorf("free card: got %q want keep_no_fee", v)
	}

	// Potential savings should reflect the cancellable card's recoverable fee.
	if rep.PotentialSavings <= 0 {
		t.Errorf("expected positive potential savings, got %.2f", rep.PotentialSavings)
	}
}

// AU-8(b): a card whose value math would say "cancel" must be softened to
// insufficient_history when the user has logged too short a spend window, and
// such a card must NOT contribute to PotentialSavings (the renewal optimizer
// can't tell the user to cancel on one day of extrapolated data).
func TestRenewal_ThinHistorySoftensCancel(t *testing.T) {
	wallet := &mockRenWallet{
		user:  &model.User{ID: "u1"},
		cards: []model.UserCard{renUCard("c-cancel", "Cancel Card", "TD", "p2", 150)},
	}
	// Value far below the fee → would be downgrade_or_cancel on a full window.
	spend := &mockRenSpend{months: 1, stats: &model.SpendStats{ByCard: []model.CardStat{
		{CardName: "Cancel Card", TotalValue: 20},
	}}}
	card := &mockRenCard{cands: []model.Card{{ID: "c-dg", Name: "No-Fee TD", AnnualFee: 0}}}

	svc := NewRenewalService(wallet, spend, &mockRenCredit{}, card)
	rep, err := svc.Assess(context.Background(), "sess")
	if err != nil {
		t.Fatalf("assess: %v", err)
	}
	if len(rep.Assessments) != 1 {
		t.Fatalf("expected 1 assessment, got %d", len(rep.Assessments))
	}
	if v := rep.Assessments[0].Verdict; v != "insufficient_history" {
		t.Errorf("thin-history cancel: got %q want insufficient_history", v)
	}
	if len(rep.Assessments[0].DowngradeOptions) != 0 {
		t.Errorf("insufficient_history should not surface downgrade options")
	}
	if rep.PotentialSavings != 0 {
		t.Errorf("thin-history cancel must not count toward savings, got %.2f", rep.PotentialSavings)
	}
	if !rep.ThinSpendHistory || rep.SpendMonthsObserved != 1 {
		t.Errorf("expected ThinSpendHistory=true, months=1; got %v, %d", rep.ThinSpendHistory, rep.SpendMonthsObserved)
	}
}

// P1-9: a quadrennial credit (e.g. $100 NEXUS every 4 years) must contribute
// its amortized ~value/4 to the annual renewal math, not its full face value.
func TestRenewal_QuadrennialCreditAmortized(t *testing.T) {
	wallet := &mockRenWallet{
		user:  &model.User{ID: "u1"},
		cards: []model.UserCard{renUCard("c-vip", "TD Aeroplan VIP", "TD", "p1", 599)},
	}
	spend := &mockRenSpend{stats: &model.SpendStats{}}
	credit := &mockRenCredit{credits: []model.CardCreditStatus{
		{CardID: "c-vip", ValueCAD: 100, Recurrence: "quadrennial", RedeemedAmount: 0},
		{CardID: "c-vip", ValueCAD: 200, Recurrence: "annual", RedeemedAmount: 0},
	}}

	svc := NewRenewalService(wallet, spend, credit, &mockRenCard{})
	rep, err := svc.Assess(context.Background(), "sess")
	if err != nil {
		t.Fatalf("assess: %v", err)
	}
	if len(rep.Assessments) != 1 {
		t.Fatalf("expected 1 assessment, got %d", len(rep.Assessments))
	}
	// $100 quadrennial → $25/yr, plus $200 annual = $225 (full-value bug = $300).
	if got := rep.Assessments[0].CreditsValue; got != 225 {
		t.Errorf("CreditsValue = %.2f, want 225 (quadrennial credit amortized to value/4)", got)
	}
}
