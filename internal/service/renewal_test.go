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

type mockRenSpend struct{ stats *model.SpendStats }

func (m *mockRenSpend) GetSpendStats(_ context.Context, _ string) (*model.SpendStats, error) {
	return m.stats, nil
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
	spend := &mockRenSpend{stats: &model.SpendStats{ByCard: []model.CardStat{
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
