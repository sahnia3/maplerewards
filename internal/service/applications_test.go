package service

import (
	"context"
	"testing"
	"time"

	"maplerewards/internal/model"
	"maplerewards/internal/repo"
)

// ── Mocks (interface-with-function-fields per .claude/rules/go-tests.md) ──────

// mockAppRepo satisfies applicationRepository. Only the eligibility-path methods
// carry behaviour; List/Create/Delete are unused by CheckEligibility tests.
type mockAppRepo struct {
	rules      []repo.IssuerRule
	lastApp    time.Time // returned by LastApplicationForIssuer (zero = no prior)
	lastErr    error
	count      int // returned by CountApplicationsForIssuerSince
	countErr   error
	rulesErr   error
	lastCalls  int
	countCalls int
}

func (m *mockAppRepo) List(_ context.Context, _ string) ([]repo.CardApplication, error) {
	return nil, nil
}
func (m *mockAppRepo) Create(_ context.Context, _, _, _, _, _ string) (*repo.CardApplication, error) {
	return nil, nil
}
func (m *mockAppRepo) Delete(_ context.Context, _, _ string) error { return nil }
func (m *mockAppRepo) ListIssuerRules(_ context.Context) ([]repo.IssuerRule, error) {
	return m.rules, m.rulesErr
}
func (m *mockAppRepo) LastApplicationForIssuer(_ context.Context, _, _ string) (time.Time, error) {
	m.lastCalls++
	return m.lastApp, m.lastErr
}
func (m *mockAppRepo) CountApplicationsForIssuerSince(_ context.Context, _, _ string, _ time.Time) (int, error) {
	m.countCalls++
	return m.count, m.countErr
}

// mockAppWallet satisfies WalletRepository; only GetUserBySession is exercised.
type mockAppWallet struct{ user *model.User }

func (m *mockAppWallet) CreateUser(_ context.Context, _ string) (*model.User, error) { return nil, nil }
func (m *mockAppWallet) GetUserBySession(_ context.Context, _ string) (*model.User, error) {
	return m.user, nil
}
func (m *mockAppWallet) GetUserCards(_ context.Context, _ string) ([]model.UserCard, error) {
	return nil, nil
}
func (m *mockAppWallet) AddCard(_ context.Context, _, _ string) (*model.UserCard, error) {
	return nil, nil
}
func (m *mockAppWallet) RemoveCard(_ context.Context, _, _ string) error             { return nil }
func (m *mockAppWallet) UpdateBalance(_ context.Context, _, _ string, _ int64) error { return nil }
func (m *mockAppWallet) UpdateCardDetails(_ context.Context, _, _ string, _ model.UpdateCardDetailsRequest) error {
	return nil
}

// mockAppCard satisfies CardRepository; only GetCard is exercised.
type mockAppCard struct{ card *model.Card }

func (m *mockAppCard) ListCards(_ context.Context) ([]model.Card, error) { return nil, nil }
func (m *mockAppCard) GetCard(_ context.Context, _ string) (*model.Card, error) {
	return m.card, nil
}
func (m *mockAppCard) ListCategories(_ context.Context) ([]model.Category, error) { return nil, nil }
func (m *mockAppCard) GetCategoryBySlug(_ context.Context, _ string) (*model.Category, error) {
	return nil, nil
}
func (m *mockAppCard) GetCategoryByMCC(_ context.Context, _ int) (*model.Category, error) {
	return nil, nil
}
func (m *mockAppCard) GetMultiplierForCard(_ context.Context, _, _ string) (*model.CardMultiplier, error) {
	return nil, nil
}
func (m *mockAppCard) GetEverythingElseMultiplier(_ context.Context, _ string) (*model.CardMultiplier, error) {
	return nil, nil
}
func (m *mockAppCard) ListMultipliersForCard(_ context.Context, _ string) ([]model.MultiplierRow, error) {
	return nil, nil
}
func (m *mockAppCard) GetProgramBySlug(_ context.Context, _ string) (*model.LoyaltyProgram, error) {
	return nil, nil
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const appTestIssuer = "TestBank"

func appSvc(rules []repo.IssuerRule, last time.Time, count int) (*ApplicationService, *mockAppRepo) {
	appRepo := &mockAppRepo{rules: rules, lastApp: last, count: count}
	wallet := &mockAppWallet{user: &model.User{ID: "u1"}}
	card := &mockAppCard{card: &model.Card{ID: "c1", Issuer: appTestIssuer}}
	return NewApplicationService(appRepo, wallet, card), appRepo
}

func cooldownRule(days int) repo.IssuerRule {
	return repo.IssuerRule{Issuer: appTestIssuer, RuleType: "cooldown_days", Value: days, Notes: "cooldown note"}
}
func maxRule(n int) repo.IssuerRule {
	return repo.IssuerRule{Issuer: appTestIssuer, RuleType: "max_per_year", Value: n, Notes: "max note"}
}

// ── Cooldown-only ───────────────────────────────────────────────────────────

// Within the cooldown window → "warn" with an EligibleAt date set.
func TestCheckEligibility_CooldownWithin(t *testing.T) {
	last := time.Now().AddDate(0, 0, -10) // 10 days ago, 90-day cooldown
	svc, _ := appSvc([]repo.IssuerRule{cooldownRule(90)}, last, 0)

	res, err := svc.CheckEligibility(context.Background(), "sess", "c1")
	if err != nil {
		t.Fatalf("CheckEligibility: %v", err)
	}
	if res.Severity != "warn" {
		t.Errorf("severity: got %q want warn", res.Severity)
	}
	if res.EligibleAt == nil {
		t.Fatal("expected EligibleAt to be set within cooldown")
	}
	wantEligible := last.Add(90 * 24 * time.Hour)
	if !res.EligibleAt.Equal(wantEligible) {
		t.Errorf("EligibleAt: got %v want %v", res.EligibleAt, wantEligible)
	}
	if res.LastAppliedAt == nil || !res.LastAppliedAt.Equal(last) {
		t.Errorf("LastAppliedAt: got %v want %v", res.LastAppliedAt, last)
	}
}

// Past the cooldown window → "ok", no EligibleAt.
func TestCheckEligibility_CooldownPast(t *testing.T) {
	last := time.Now().AddDate(0, 0, -120) // 120 days ago, 90-day cooldown cleared
	svc, _ := appSvc([]repo.IssuerRule{cooldownRule(90)}, last, 0)

	res, err := svc.CheckEligibility(context.Background(), "sess", "c1")
	if err != nil {
		t.Fatalf("CheckEligibility: %v", err)
	}
	if res.Severity != "ok" {
		t.Errorf("severity: got %q want ok", res.Severity)
	}
	if res.EligibleAt != nil {
		t.Errorf("expected no EligibleAt past cooldown, got %v", res.EligibleAt)
	}
}

// No prior application on file → "ok" (cooldown can't be violated).
func TestCheckEligibility_CooldownNoPriorApplication(t *testing.T) {
	svc, _ := appSvc([]repo.IssuerRule{cooldownRule(90)}, time.Time{}, 0)

	res, err := svc.CheckEligibility(context.Background(), "sess", "c1")
	if err != nil {
		t.Fatalf("CheckEligibility: %v", err)
	}
	if res.Severity != "ok" {
		t.Errorf("severity: got %q want ok", res.Severity)
	}
	if res.LastAppliedAt != nil {
		t.Errorf("expected no LastAppliedAt with no prior application, got %v", res.LastAppliedAt)
	}
}

// ── Max-per-year-only ─────────────────────────────────────────────────────────

// count == max → "warn" (boundary: at the limit blocks a new application).
func TestCheckEligibility_MaxPerYearAtLimit(t *testing.T) {
	svc, repoMock := appSvc([]repo.IssuerRule{maxRule(2)}, time.Time{}, 2)

	res, err := svc.CheckEligibility(context.Background(), "sess", "c1")
	if err != nil {
		t.Fatalf("CheckEligibility: %v", err)
	}
	if res.Severity != "warn" {
		t.Errorf("severity: got %q want warn (count==max)", res.Severity)
	}
	// A max-only rule must not consult the cooldown query.
	if repoMock.lastCalls != 0 {
		t.Errorf("LastApplicationForIssuer called %d times for a max-only rule, want 0", repoMock.lastCalls)
	}
}

// count == max-1 → "ok" (one slot left under the limit).
func TestCheckEligibility_MaxPerYearUnderLimit(t *testing.T) {
	svc, _ := appSvc([]repo.IssuerRule{maxRule(2)}, time.Time{}, 1)

	res, err := svc.CheckEligibility(context.Background(), "sess", "c1")
	if err != nil {
		t.Fatalf("CheckEligibility: %v", err)
	}
	if res.Severity != "ok" {
		t.Errorf("severity: got %q want ok (count==max-1)", res.Severity)
	}
}

// ── Both rules present ─────────────────────────────────────────────────────────

// Cooldown clear but max-per-year at limit → still "warn" (the max rule fires).
func TestCheckEligibility_BothRulesMaxTrips(t *testing.T) {
	last := time.Now().AddDate(0, 0, -120) // cooldown cleared
	svc, _ := appSvc([]repo.IssuerRule{cooldownRule(90), maxRule(2)}, last, 2)

	res, err := svc.CheckEligibility(context.Background(), "sess", "c1")
	if err != nil {
		t.Fatalf("CheckEligibility: %v", err)
	}
	if res.Severity != "warn" {
		t.Errorf("severity: got %q want warn (max rule trips despite cleared cooldown)", res.Severity)
	}
}

// Both rules present and both clear → "ok".
func TestCheckEligibility_BothRulesClear(t *testing.T) {
	last := time.Now().AddDate(0, 0, -120) // cooldown cleared
	svc, repoMock := appSvc([]repo.IssuerRule{cooldownRule(90), maxRule(2)}, last, 1)

	res, err := svc.CheckEligibility(context.Background(), "sess", "c1")
	if err != nil {
		t.Fatalf("CheckEligibility: %v", err)
	}
	if res.Severity != "ok" {
		t.Errorf("severity: got %q want ok (both rules clear)", res.Severity)
	}
	// Both rules present → both repo queries consulted.
	if repoMock.lastCalls != 1 || repoMock.countCalls != 1 {
		t.Errorf("expected both rule queries (last=1 count=1), got last=%d count=%d", repoMock.lastCalls, repoMock.countCalls)
	}
}

// ── Neither rule ───────────────────────────────────────────────────────────────

// No rule for the issuer → "unknown".
func TestCheckEligibility_NoRuleUnknown(t *testing.T) {
	// A rule for a DIFFERENT issuer must not apply to this card's issuer.
	other := repo.IssuerRule{Issuer: "OtherBank", RuleType: "cooldown_days", Value: 90}
	svc, repoMock := appSvc([]repo.IssuerRule{other}, time.Time{}, 0)

	res, err := svc.CheckEligibility(context.Background(), "sess", "c1")
	if err != nil {
		t.Fatalf("CheckEligibility: %v", err)
	}
	if res.Severity != "unknown" {
		t.Errorf("severity: got %q want unknown (no rule for issuer)", res.Severity)
	}
	// No applicable rule → neither history query should run.
	if repoMock.lastCalls != 0 || repoMock.countCalls != 0 {
		t.Errorf("expected no history queries with no applicable rule, got last=%d count=%d", repoMock.lastCalls, repoMock.countCalls)
	}
}

// Anonymous session (no user) short-circuits to "ok" without touching rules.
func TestCheckEligibility_AnonymousOK(t *testing.T) {
	appRepo := &mockAppRepo{rules: []repo.IssuerRule{cooldownRule(90)}}
	wallet := &mockAppWallet{user: nil}
	card := &mockAppCard{card: &model.Card{ID: "c1", Issuer: appTestIssuer}}
	svc := NewApplicationService(appRepo, wallet, card)

	res, err := svc.CheckEligibility(context.Background(), "sess", "c1")
	if err != nil {
		t.Fatalf("CheckEligibility: %v", err)
	}
	if res.Severity != "ok" {
		t.Errorf("severity: got %q want ok for anonymous session", res.Severity)
	}
}

// ── Batch ──────────────────────────────────────────────────────────────────────

// CheckEligibilityBatch loads issuer rules ONCE for the whole candidate set and
// returns the same per-card verdict as CheckEligibility.
func TestCheckEligibilityBatch_LoadsRulesOnce(t *testing.T) {
	last := time.Now().AddDate(0, 0, -10) // within 90-day cooldown
	appRepo := &mockAppRepo{rules: []repo.IssuerRule{cooldownRule(90)}, lastApp: last}
	wallet := &mockAppWallet{user: &model.User{ID: "u1"}}
	card := &mockAppCard{card: &model.Card{ID: "c1", Issuer: appTestIssuer}}
	svc := NewApplicationService(appRepo, wallet, card)

	res, err := svc.CheckEligibilityBatch(context.Background(), "sess", []string{"c1", "c2", "c3"})
	if err != nil {
		t.Fatalf("CheckEligibilityBatch: %v", err)
	}
	if len(res) != 3 {
		t.Fatalf("expected 3 verdicts, got %d", len(res))
	}
	for _, id := range []string{"c1", "c2", "c3"} {
		if res[id] == nil || res[id].Severity != "warn" {
			t.Errorf("card %s: expected warn verdict, got %+v", id, res[id])
		}
	}
}
