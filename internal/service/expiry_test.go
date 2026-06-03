package service

import (
	"context"
	"testing"
	"time"

	"maplerewards/internal/model"
	"maplerewards/internal/repo"
)

type mockExpWallet struct{ user *model.User }

func (m *mockExpWallet) GetUserBySession(_ context.Context, _ string) (*model.User, error) {
	return m.user, nil
}

type mockExpAccounts struct{ accounts []model.LoyaltyAccount }

func (m *mockExpAccounts) ListByUser(_ context.Context, _ string) ([]model.LoyaltyAccount, error) {
	return m.accounts, nil
}

type mockExpRules struct{ rules []repo.ExpiryRule }

func (m *mockExpRules) ListExpiryRules(_ context.Context) ([]repo.ExpiryRule, error) {
	return m.rules, nil
}

type mockExpPrograms struct{ programs []model.LoyaltyProgram }

func (m *mockExpPrograms) ListPrograms(_ context.Context) ([]model.LoyaltyProgram, error) {
	return m.programs, nil
}

func dateStr(daysFromNow int) string {
	return time.Now().AddDate(0, 0, daysFromNow).Format("2006-01-02")
}

func intPtr(v int) *int { return &v }

func expAccount(slug string, balance int64, expiresInDays *int) model.LoyaltyAccount {
	a := model.LoyaltyAccount{ProgramSlug: slug, ProgramName: slug, Balance: balance}
	if expiresInDays != nil {
		s := dateStr(*expiresInDays)
		a.ExpiresAt = &s
	}
	return a
}

func TestExpiry_RiskAndMath(t *testing.T) {
	wallet := &mockExpWallet{user: &model.User{ID: "u1"}}
	accounts := &mockExpAccounts{accounts: []model.LoyaltyAccount{
		expAccount("aeroplan", 100_000, intPtr(20)),     // critical (<30d)
		expAccount("hilton-honors", 50_000, intPtr(60)), // warning (<90d)
		expAccount("scene-plus", 10_000, intPtr(300)),   // ok (>=180d)
		expAccount("amex-mr-ca", 200_000, nil),          // never (NULL inactivity, no expires_at)
	}}
	rules := &mockExpRules{rules: []repo.ExpiryRule{
		{ProgramSlug: "aeroplan", InactivityMonths: intPtr(18)},
		{ProgramSlug: "hilton-honors", InactivityMonths: intPtr(12)},
		{ProgramSlug: "scene-plus", InactivityMonths: intPtr(12)},
		{ProgramSlug: "amex-mr-ca", InactivityMonths: nil},
	}}
	programs := &mockExpPrograms{programs: []model.LoyaltyProgram{
		{Slug: "aeroplan", BaseCPP: 1.5},
		{Slug: "hilton-honors", BaseCPP: 0.5},
		{Slug: "scene-plus", BaseCPP: 1.0},
		{Slug: "amex-mr-ca", BaseCPP: 2.0},
	}}

	svc := NewExpiryGuardianService(wallet, accounts, rules, programs)
	rep, err := svc.Assess(context.Background(), "sess")
	if err != nil {
		t.Fatalf("assess: %v", err)
	}

	got := make(map[string]model.ExpiryAccount, len(rep.Accounts))
	for _, a := range rep.Accounts {
		got[a.ProgramSlug] = a
	}

	// Risk classification.
	if r := got["aeroplan"].Risk; r != "critical" {
		t.Errorf("aeroplan: got risk %q want critical", r)
	}
	if r := got["hilton-honors"].Risk; r != "warning" {
		t.Errorf("hilton: got risk %q want warning", r)
	}
	if r := got["scene-plus"].Risk; r != "ok" {
		t.Errorf("scene+: got risk %q want ok", r)
	}
	if r := got["amex-mr-ca"].Risk; r != "none" {
		t.Errorf("amex: got risk %q want none", r)
	}

	// Never-expiry account has nil days + nil effective date.
	if got["amex-mr-ca"].DaysToExpiry != nil {
		t.Errorf("amex: expected nil days_to_expiry, got %v", *got["amex-mr-ca"].DaysToExpiry)
	}
	if got["amex-mr-ca"].EffectiveExpiry != nil {
		t.Errorf("amex: expected nil effective_expiry, got %v", *got["amex-mr-ca"].EffectiveExpiry)
	}

	// Points-at-risk math: balance * base_cpp / 100.
	// aeroplan: 100000 * 1.5 / 100 = 1500.
	if v := got["aeroplan"].PointsAtRiskCAD; v != 1500 {
		t.Errorf("aeroplan: got points_at_risk_cad %.2f want 1500", v)
	}
	// hilton: 50000 * 0.5 / 100 = 250.
	if v := got["hilton-honors"].PointsAtRiskCAD; v != 250 {
		t.Errorf("hilton: got points_at_risk_cad %.2f want 250", v)
	}
	// amex: 200000 * 2.0 / 100 = 4000.
	if v := got["amex-mr-ca"].PointsAtRiskCAD; v != 4000 {
		t.Errorf("amex: got points_at_risk_cad %.2f want 4000", v)
	}

	// Total at risk = 1500 + 250 + 100 + 4000 = 5850.
	if rep.TotalPointsAtRiskCAD != 5850 {
		t.Errorf("total_points_at_risk_cad: got %.2f want 5850", rep.TotalPointsAtRiskCAD)
	}

	// Only critical + warning count as "expiring soon".
	if rep.AccountsExpiringSoon != 2 {
		t.Errorf("accounts_expiring_soon: got %d want 2", rep.AccountsExpiringSoon)
	}

	// Reset suggestion for inactivity-based program names the month count.
	if s := got["aeroplan"].ResetSuggestion; s != "Any earn or redeem resets the 18-month clock." {
		t.Errorf("aeroplan: unexpected reset suggestion %q", s)
	}

	// Sorting: soonest expiry first, never-expiry last.
	wantOrder := []string{"aeroplan", "hilton-honors", "scene-plus", "amex-mr-ca"}
	if len(rep.Accounts) != len(wantOrder) {
		t.Fatalf("got %d accounts want %d", len(rep.Accounts), len(wantOrder))
	}
	for i, slug := range wantOrder {
		if rep.Accounts[i].ProgramSlug != slug {
			t.Errorf("sort position %d: got %q want %q", i, rep.Accounts[i].ProgramSlug, slug)
		}
	}
}

func TestExpiry_DerivedFromLastActivity(t *testing.T) {
	wallet := &mockExpWallet{user: &model.User{ID: "u1"}}
	// No explicit expires_at; last_activity ~18 months ago (minus 10 days) +
	// 18-month inactivity rule => expiry ~10 days out => critical. Anchoring 10
	// days under the full 18-month window keeps the derived expiry safely below
	// the 30-day "critical" threshold on any calendar date (month-length
	// arithmetic alone would otherwise land right on the 30-day knife-edge).
	lastAct := time.Now().AddDate(0, -18, 0).AddDate(0, 0, 10).Format("2006-01-02")
	accounts := &mockExpAccounts{accounts: []model.LoyaltyAccount{
		{ProgramSlug: "aeroplan", ProgramName: "Aeroplan", Balance: 40_000, LastActivity: &lastAct},
	}}
	rules := &mockExpRules{rules: []repo.ExpiryRule{
		{ProgramSlug: "aeroplan", InactivityMonths: intPtr(18)},
	}}
	programs := &mockExpPrograms{programs: []model.LoyaltyProgram{
		{Slug: "aeroplan", BaseCPP: 1.5},
	}}

	svc := NewExpiryGuardianService(wallet, accounts, rules, programs)
	rep, err := svc.Assess(context.Background(), "sess")
	if err != nil {
		t.Fatalf("assess: %v", err)
	}
	if len(rep.Accounts) != 1 {
		t.Fatalf("got %d accounts want 1", len(rep.Accounts))
	}
	a := rep.Accounts[0]
	if a.EffectiveExpiry == nil {
		t.Fatalf("expected derived effective_expiry from last_activity, got nil")
	}
	if a.DaysToExpiry == nil || *a.DaysToExpiry >= 30 {
		t.Errorf("expected derived expiry under 30 days (critical), got %v", a.DaysToExpiry)
	}
	if a.Risk != "critical" {
		t.Errorf("got risk %q want critical", a.Risk)
	}
}
