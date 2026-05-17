package service

import (
	"context"
	"fmt"
	"math"
	"sync"
	"testing"
	"time"

	"maplerewards/internal/model"
)

// ── Mock implementations ────────────────────────────────────────────────────

type mockCardRepo struct {
	categories  map[string]*model.Category // keyed by slug
	multipliers map[string]*model.CardMultiplier // keyed by "cardID:categoryID"
	fallback    *model.CardMultiplier
}

func (m *mockCardRepo) ListCards(ctx context.Context) ([]model.Card, error)          { return nil, nil }
func (m *mockCardRepo) GetCard(ctx context.Context, id string) (*model.Card, error)  { return nil, nil }
func (m *mockCardRepo) ListCategories(ctx context.Context) ([]model.Category, error) { return nil, nil }

func (m *mockCardRepo) GetCategoryBySlug(ctx context.Context, slug string) (*model.Category, error) {
	if c, ok := m.categories[slug]; ok {
		return c, nil
	}
	return nil, fmt.Errorf("category %q not found", slug)
}

func (m *mockCardRepo) GetCategoryByMCC(ctx context.Context, mcc int) (*model.Category, error) {
	return nil, fmt.Errorf("mcc %d not found", mcc)
}

func (m *mockCardRepo) GetMultiplierForCard(ctx context.Context, cardID, categoryID string) (*model.CardMultiplier, error) {
	key := cardID + ":" + categoryID
	if mul, ok := m.multipliers[key]; ok {
		return mul, nil
	}
	return nil, fmt.Errorf("no multiplier for %s", key)
}

func (m *mockCardRepo) GetEverythingElseMultiplier(ctx context.Context, cardID string) (*model.CardMultiplier, error) {
	if m.fallback != nil {
		return m.fallback, nil
	}
	return &model.CardMultiplier{EarnRate: 1.0, EarnType: "points", FallbackEarnRate: 1.0}, nil
}

func (m *mockCardRepo) GetProgramBySlug(ctx context.Context, slug string) (*model.LoyaltyProgram, error) {
	return &model.LoyaltyProgram{Slug: slug}, nil
}

type mockWalletRepo struct {
	users map[string]*model.User     // keyed by sessionID
	cards map[string][]model.UserCard // keyed by userID
}

func (m *mockWalletRepo) CreateUser(ctx context.Context, sessionID string) (*model.User, error) {
	return nil, nil
}

func (m *mockWalletRepo) GetUserBySession(ctx context.Context, sessionID string) (*model.User, error) {
	if u, ok := m.users[sessionID]; ok {
		return u, nil
	}
	return nil, fmt.Errorf("session not found")
}

func (m *mockWalletRepo) GetUserCards(ctx context.Context, userID string) ([]model.UserCard, error) {
	if cards, ok := m.cards[userID]; ok {
		return cards, nil
	}
	return nil, nil
}

func (m *mockWalletRepo) AddCard(ctx context.Context, userID, cardID string) (*model.UserCard, error) {
	return nil, nil
}

func (m *mockWalletRepo) RemoveCard(ctx context.Context, userID, cardID string) error { return nil }

func (m *mockWalletRepo) UpdateBalance(ctx context.Context, userID, cardID string, balance int64) error {
	return nil
}

func (m *mockWalletRepo) UpdateCardDetails(ctx context.Context, userID, cardID string, req model.UpdateCardDetailsRequest) error {
	return nil
}

type mockValuationRepo struct {
	cpps map[string]float64 // keyed by "slug:segment"
}

func (m *mockValuationRepo) GetCPP(ctx context.Context, programSlug, segment string) (float64, error) {
	key := programSlug + ":" + segment
	if cpp, ok := m.cpps[key]; ok {
		return cpp, nil
	}
	return 0, fmt.Errorf("no CPP for %s", key)
}

type mockTransferRepo struct {
	routes map[string][]model.TransferPartner // keyed by fromProgramID
}

func (m *mockTransferRepo) GetTransferRoutes(ctx context.Context, fromProgramID string) ([]model.TransferPartner, error) {
	if r, ok := m.routes[fromProgramID]; ok {
		return r, nil
	}
	return nil, nil
}

type mockSpendRepo struct {
	monthlySpend map[string]map[string]float64 // "userID:cardID:month" -> {categoryID: amount}
	capGroups    map[string]*model.CapGroup     // "cardID:categoryID" -> capGroup
}

func (m *mockSpendRepo) GetMonthlySpend(ctx context.Context, userID, cardID string, month time.Time) (map[string]float64, error) {
	key := userID + ":" + cardID + ":" + month.Format("2006-01-02")
	if spend, ok := m.monthlySpend[key]; ok {
		return spend, nil
	}
	return make(map[string]float64), nil
}

func (m *mockSpendRepo) UpsertMonthlySpend(ctx context.Context, userID, cardID, categoryID string, month time.Time, amount float64) error {
	return nil
}

func (m *mockSpendRepo) GetCapGroupForCard(ctx context.Context, cardID, categoryID string) (*model.CapGroup, error) {
	key := cardID + ":" + categoryID
	if cg, ok := m.capGroups[key]; ok {
		return cg, nil
	}
	return nil, fmt.Errorf("no cap group")
}

func (m *mockSpendRepo) CreateSpendEntry(ctx context.Context, entry model.SpendEntry) (*model.SpendEntry, error) {
	entry.ID = "test-entry-id"
	entry.CreatedAt = "2026-01-01T00:00:00Z"
	return &entry, nil
}

func (m *mockSpendRepo) ListSpendEntries(ctx context.Context, userID string, limit, offset int) ([]model.SpendEntry, error) {
	return nil, nil
}

func (m *mockSpendRepo) GetSpendStats(ctx context.Context, userID string) (*model.SpendStats, error) {
	return &model.SpendStats{}, nil
}

type mockCache struct {
	mu         sync.Mutex
	valuations map[string]float64
}

func (m *mockCache) GetValuation(ctx context.Context, programSlug, segment string) (float64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := programSlug + ":" + segment
	if v, ok := m.valuations[key]; ok {
		return v, nil
	}
	return 0, fmt.Errorf("cache miss")
}

func (m *mockCache) SetValuation(ctx context.Context, programSlug, segment string, cpp float64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.valuations == nil {
		m.valuations = make(map[string]float64)
	}
	m.valuations[programSlug+":"+segment] = cpp
	return nil
}

func (m *mockCache) GetWallet(ctx context.Context, sessionID string, dest any) error {
	return fmt.Errorf("cache miss")
}

func (m *mockCache) SetWallet(ctx context.Context, sessionID string, data any) error { return nil }

func (m *mockCache) InvalidateWallet(ctx context.Context, sessionID string) error { return nil }

// ── Helper to build a standard test service ─────────────────────────────────

func newTestOptimizer(opts ...func(*testSetup)) *testSetup {
	ts := &testSetup{
		cardRepo:      &mockCardRepo{categories: make(map[string]*model.Category), multipliers: make(map[string]*model.CardMultiplier)},
		walletRepo:    &mockWalletRepo{users: make(map[string]*model.User), cards: make(map[string][]model.UserCard)},
		valuationRepo: &mockValuationRepo{cpps: make(map[string]float64)},
		transferRepo:  &mockTransferRepo{routes: make(map[string][]model.TransferPartner)},
		spendRepo:     &mockSpendRepo{monthlySpend: make(map[string]map[string]float64), capGroups: make(map[string]*model.CapGroup)},
		cache:         &mockCache{valuations: make(map[string]float64)},
	}
	for _, opt := range opts {
		opt(ts)
	}
	ts.svc = NewOptimizerService(ts.cardRepo, ts.walletRepo, ts.valuationRepo, ts.transferRepo, ts.spendRepo, ts.cache)
	return ts
}

type testSetup struct {
	svc           *OptimizerService
	cardRepo      *mockCardRepo
	walletRepo    *mockWalletRepo
	valuationRepo *mockValuationRepo
	transferRepo  *mockTransferRepo
	spendRepo     *mockSpendRepo
	cache         *mockCache
}

func almostEqual(a, b, epsilon float64) bool {
	return math.Abs(a-b) < epsilon
}

// ── Tests ───────────────────────────────────────────────────────────────────

func TestGetBestCard_SinglePointsCard(t *testing.T) {
	ts := newTestOptimizer()

	// Setup: one user with one card, one category, one multiplier
	ts.cardRepo.categories["groceries"] = &model.Category{ID: "cat-1", Name: "Groceries", Slug: "groceries"}
	ts.walletRepo.users["session-abc"] = &model.User{ID: "user-1", SessionID: "session-abc"}
	ts.walletRepo.cards["user-1"] = []model.UserCard{
		{
			ID: "uc-1", UserID: "user-1", CardID: "card-1",
			Card: &model.Card{
				ID: "card-1", Name: "Amex Cobalt",
				LoyaltyProgramID: "lp-1",
				LoyaltyProgram:   &model.LoyaltyProgram{ID: "lp-1", Name: "Amex MR", Slug: "amex-mr", BaseCPP: 1.5},
			},
		},
	}
	ts.cardRepo.multipliers["card-1:cat-1"] = &model.CardMultiplier{
		EarnRate: 5.0, EarnType: "points", FallbackEarnRate: 1.0,
	}
	ts.valuationRepo.cpps["amex-mr:base"] = 2.0 // 2 cents per point

	recs, err := ts.svc.GetBestCard(context.Background(), model.OptimizeRequest{
		SessionID:    "session-abc",
		CategorySlug: "groceries",
		SpendAmount:  100,
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(recs) != 1 {
		t.Fatalf("expected 1 recommendation, got %d", len(recs))
	}

	rec := recs[0]
	if rec.CardName != "Amex Cobalt" {
		t.Errorf("expected card name 'Amex Cobalt', got %q", rec.CardName)
	}
	// 100 * 5 = 500 points
	if !almostEqual(rec.PointsEarned, 500, 0.01) {
		t.Errorf("expected 500 points, got %.2f", rec.PointsEarned)
	}
	// 500 * (2.0/100) = $10.00
	if !almostEqual(rec.DollarValue, 10.0, 0.01) {
		t.Errorf("expected $10.00 value, got $%.2f", rec.DollarValue)
	}
	// (10/100)*100 = 10%
	if !almostEqual(rec.EffectiveReturn, 10.0, 0.01) {
		t.Errorf("expected 10%% return, got %.2f%%", rec.EffectiveReturn)
	}
	if rec.RedemptionSegment != "base" {
		t.Errorf("expected segment 'base', got %q", rec.RedemptionSegment)
	}
}

func TestGetBestCard_CashbackCard(t *testing.T) {
	ts := newTestOptimizer()

	ts.cardRepo.categories["groceries"] = &model.Category{ID: "cat-1", Slug: "groceries"}
	ts.walletRepo.users["session-abc"] = &model.User{ID: "user-1", SessionID: "session-abc"}
	ts.walletRepo.cards["user-1"] = []model.UserCard{
		{
			ID: "uc-1", UserID: "user-1", CardID: "card-cb",
			Card: &model.Card{
				ID: "card-cb", Name: "Rogers Platinum",
				LoyaltyProgramID: "lp-cb",
				LoyaltyProgram:   &model.LoyaltyProgram{ID: "lp-cb", Name: "Rogers Cashback", Slug: "rogers-cb", BaseCPP: 1.0},
			},
		},
	}
	ts.cardRepo.multipliers["card-cb:cat-1"] = &model.CardMultiplier{
		EarnRate: 1.5, EarnType: "cashback_pct", FallbackEarnRate: 0.5,
	}

	recs, err := ts.svc.GetBestCard(context.Background(), model.OptimizeRequest{
		SessionID:    "session-abc",
		CategorySlug: "groceries",
		SpendAmount:  200,
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(recs) != 1 {
		t.Fatalf("expected 1 rec, got %d", len(recs))
	}

	rec := recs[0]
	// Cashback: 200 * (1.5/100) = $3.00
	if !almostEqual(rec.DollarValue, 3.0, 0.01) {
		t.Errorf("expected $3.00 cashback, got $%.2f", rec.DollarValue)
	}
	if rec.PointsEarned != 0 {
		t.Errorf("cashback cards should have 0 points, got %.2f", rec.PointsEarned)
	}
	if !almostEqual(rec.EffectiveReturn, 1.5, 0.01) {
		t.Errorf("expected 1.5%% return, got %.2f%%", rec.EffectiveReturn)
	}
}

func TestGetBestCard_RanksMultipleCards(t *testing.T) {
	ts := newTestOptimizer()

	ts.cardRepo.categories["dining"] = &model.Category{ID: "cat-d", Slug: "dining"}
	ts.walletRepo.users["sess-1"] = &model.User{ID: "u1", SessionID: "sess-1"}
	ts.walletRepo.cards["u1"] = []model.UserCard{
		{
			ID: "uc-1", UserID: "u1", CardID: "c1",
			Card: &model.Card{
				ID: "c1", Name: "Card A (worse)",
				LoyaltyProgramID: "lp-1",
				LoyaltyProgram:   &model.LoyaltyProgram{ID: "lp-1", Name: "Prog A", Slug: "prog-a", BaseCPP: 1.0},
			},
		},
		{
			ID: "uc-2", UserID: "u1", CardID: "c2",
			Card: &model.Card{
				ID: "c2", Name: "Card B (better)",
				LoyaltyProgramID: "lp-2",
				LoyaltyProgram:   &model.LoyaltyProgram{ID: "lp-2", Name: "Prog B", Slug: "prog-b", BaseCPP: 2.0},
			},
		},
	}
	ts.cardRepo.multipliers["c1:cat-d"] = &model.CardMultiplier{EarnRate: 1.0, EarnType: "points", FallbackEarnRate: 1.0}
	ts.cardRepo.multipliers["c2:cat-d"] = &model.CardMultiplier{EarnRate: 3.0, EarnType: "points", FallbackEarnRate: 1.0}
	ts.valuationRepo.cpps["prog-a:base"] = 1.0
	ts.valuationRepo.cpps["prog-b:base"] = 2.0

	recs, err := ts.svc.GetBestCard(context.Background(), model.OptimizeRequest{
		SessionID:    "sess-1",
		CategorySlug: "dining",
		SpendAmount:  100,
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(recs) != 2 {
		t.Fatalf("expected 2 recs, got %d", len(recs))
	}

	// Card B should be ranked first (3x * 2cpp > 1x * 1cpp)
	if recs[0].CardName != "Card B (better)" {
		t.Errorf("expected Card B first, got %q", recs[0].CardName)
	}
	if recs[1].CardName != "Card A (worse)" {
		t.Errorf("expected Card A second, got %q", recs[1].CardName)
	}

	// Card B: 100 * 3 = 300pts * 0.02 = $6.00 → 6%
	if !almostEqual(recs[0].EffectiveReturn, 6.0, 0.01) {
		t.Errorf("expected 6%% for Card B, got %.2f%%", recs[0].EffectiveReturn)
	}
	// Card A: 100 * 1 = 100pts * 0.01 = $1.00 → 1%
	if !almostEqual(recs[1].EffectiveReturn, 1.0, 0.01) {
		t.Errorf("expected 1%% for Card A, got %.2f%%", recs[1].EffectiveReturn)
	}
}

func TestGetBestCard_SessionNotFound(t *testing.T) {
	ts := newTestOptimizer()
	ts.cardRepo.categories["groceries"] = &model.Category{ID: "cat-1", Slug: "groceries"}

	_, err := ts.svc.GetBestCard(context.Background(), model.OptimizeRequest{
		SessionID:    "nonexistent",
		CategorySlug: "groceries",
		SpendAmount:  100,
	})

	if err == nil {
		t.Fatal("expected error for nonexistent session")
	}
}

func TestGetBestCard_EmptyWallet(t *testing.T) {
	ts := newTestOptimizer()

	ts.cardRepo.categories["groceries"] = &model.Category{ID: "cat-1", Slug: "groceries"}
	ts.walletRepo.users["sess-empty"] = &model.User{ID: "u-empty", SessionID: "sess-empty"}
	ts.walletRepo.cards["u-empty"] = []model.UserCard{} // empty

	_, err := ts.svc.GetBestCard(context.Background(), model.OptimizeRequest{
		SessionID:    "sess-empty",
		CategorySlug: "groceries",
		SpendAmount:  50,
	})

	if err == nil {
		t.Fatal("expected error for empty wallet")
	}
}

func TestGetBestCard_CategoryFallsBackToEverythingElse(t *testing.T) {
	ts := newTestOptimizer()

	// Only "everything-else" exists, not the requested slug
	ts.cardRepo.categories["everything-else"] = &model.Category{ID: "cat-ee", Slug: "everything-else"}
	ts.walletRepo.users["sess-1"] = &model.User{ID: "u1"}
	ts.walletRepo.cards["u1"] = []model.UserCard{
		{
			ID: "uc-1", UserID: "u1", CardID: "c1",
			Card: &model.Card{
				ID: "c1", Name: "TestCard",
				LoyaltyProgramID: "lp-1",
				LoyaltyProgram:   &model.LoyaltyProgram{ID: "lp-1", Slug: "test-prog", BaseCPP: 1.0},
			},
		},
	}
	ts.cardRepo.fallback = &model.CardMultiplier{EarnRate: 1.0, EarnType: "points", FallbackEarnRate: 1.0}
	ts.valuationRepo.cpps["test-prog:base"] = 1.0

	recs, err := ts.svc.GetBestCard(context.Background(), model.OptimizeRequest{
		SessionID:    "sess-1",
		CategorySlug: "unknown-category",
		SpendAmount:  100,
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(recs) != 1 {
		t.Fatalf("expected 1 rec, got %d", len(recs))
	}
}

func TestGetBestCard_RedemptionSegment(t *testing.T) {
	ts := newTestOptimizer()

	ts.cardRepo.categories["travel"] = &model.Category{ID: "cat-t", Slug: "travel"}
	ts.walletRepo.users["sess-1"] = &model.User{ID: "u1"}
	ts.walletRepo.cards["u1"] = []model.UserCard{
		{
			ID: "uc-1", UserID: "u1", CardID: "c1",
			Card: &model.Card{
				ID: "c1", Name: "Aeroplan Card",
				LoyaltyProgramID: "lp-ap",
				LoyaltyProgram:   &model.LoyaltyProgram{ID: "lp-ap", Slug: "aeroplan", BaseCPP: 1.5},
			},
		},
	}
	ts.cardRepo.multipliers["c1:cat-t"] = &model.CardMultiplier{EarnRate: 3.0, EarnType: "points", FallbackEarnRate: 1.0}
	ts.valuationRepo.cpps["aeroplan:base"] = 1.5
	ts.valuationRepo.cpps["aeroplan:business"] = 3.0 // business class = 2x the CPP

	// Test base segment
	recsBase, err := ts.svc.GetBestCard(context.Background(), model.OptimizeRequest{
		SessionID:    "sess-1",
		CategorySlug: "travel",
		SpendAmount:  100,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Test business segment
	recsBiz, err := ts.svc.GetBestCard(context.Background(), model.OptimizeRequest{
		SessionID:         "sess-1",
		CategorySlug:      "travel",
		SpendAmount:       100,
		RedemptionSegment: "business",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if recsBase[0].EffectiveReturn >= recsBiz[0].EffectiveReturn {
		t.Errorf("business segment should yield higher return: base=%.2f%% biz=%.2f%%",
			recsBase[0].EffectiveReturn, recsBiz[0].EffectiveReturn)
	}
	if recsBiz[0].RedemptionSegment != "business" {
		t.Errorf("expected segment 'business', got %q", recsBiz[0].RedemptionSegment)
	}
}

func TestGetBestCard_TransferPartnerYieldsHigherValue(t *testing.T) {
	ts := newTestOptimizer()

	ts.cardRepo.categories["groceries"] = &model.Category{ID: "cat-g", Slug: "groceries"}
	ts.walletRepo.users["sess-1"] = &model.User{ID: "u1"}
	ts.walletRepo.cards["u1"] = []model.UserCard{
		{
			ID: "uc-1", UserID: "u1", CardID: "c1",
			Card: &model.Card{
				ID: "c1", Name: "Cobalt",
				LoyaltyProgramID: "lp-mr",
				LoyaltyProgram:   &model.LoyaltyProgram{ID: "lp-mr", Name: "Amex MR", Slug: "amex-mr", BaseCPP: 1.0},
			},
		},
	}
	ts.cardRepo.multipliers["c1:cat-g"] = &model.CardMultiplier{EarnRate: 5.0, EarnType: "points", FallbackEarnRate: 1.0}
	ts.valuationRepo.cpps["amex-mr:base"] = 1.0     // Native: 1cpp
	ts.valuationRepo.cpps["aeroplan:base"] = 2.5     // Transfer partner: 2.5cpp

	ts.transferRepo.routes["lp-mr"] = []model.TransferPartner{
		{
			ID:            "tp-1",
			FromProgramID: "lp-mr",
			ToProgramID:   "lp-ap",
			TransferRatio: 1.0, // 1:1
			ToProgram:     &model.LoyaltyProgram{ID: "lp-ap", Name: "Aeroplan", Slug: "aeroplan", BaseCPP: 2.5},
		},
	}

	recs, err := ts.svc.GetBestCard(context.Background(), model.OptimizeRequest{
		SessionID:    "sess-1",
		CategorySlug: "groceries",
		SpendAmount:  100,
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(recs) != 1 {
		t.Fatalf("expected 1 rec, got %d", len(recs))
	}

	rec := recs[0]
	if rec.TransferPartner != "Aeroplan" {
		t.Errorf("expected transfer partner 'Aeroplan', got %q", rec.TransferPartner)
	}
	// 100 * 5 = 500 pts * 1.0 transfer * (2.5/100) = $12.50
	if !almostEqual(rec.DollarValue, 12.5, 0.01) {
		t.Errorf("expected $12.50 via transfer, got $%.2f", rec.DollarValue)
	}
	// (12.5/100)*100 = 12.5%
	if !almostEqual(rec.EffectiveReturn, 12.5, 0.01) {
		t.Errorf("expected 12.5%% return, got %.2f%%", rec.EffectiveReturn)
	}
	if !almostEqual(rec.TransferCPP, 2.5, 0.01) {
		t.Errorf("expected transfer CPP 2.5, got %.2f", rec.TransferCPP)
	}
}

func TestGetBestCard_TransferNotUsedWhenNativeIsBetter(t *testing.T) {
	ts := newTestOptimizer()

	ts.cardRepo.categories["groceries"] = &model.Category{ID: "cat-g", Slug: "groceries"}
	ts.walletRepo.users["sess-1"] = &model.User{ID: "u1"}
	ts.walletRepo.cards["u1"] = []model.UserCard{
		{
			ID: "uc-1", UserID: "u1", CardID: "c1",
			Card: &model.Card{
				ID: "c1", Name: "Cobalt",
				LoyaltyProgramID: "lp-mr",
				LoyaltyProgram:   &model.LoyaltyProgram{ID: "lp-mr", Name: "Amex MR", Slug: "amex-mr", BaseCPP: 2.0},
			},
		},
	}
	ts.cardRepo.multipliers["c1:cat-g"] = &model.CardMultiplier{EarnRate: 5.0, EarnType: "points", FallbackEarnRate: 1.0}
	ts.valuationRepo.cpps["amex-mr:base"] = 2.0   // Native: 2cpp
	ts.valuationRepo.cpps["bad-prog:base"] = 0.5   // Transfer: only 0.5cpp

	ts.transferRepo.routes["lp-mr"] = []model.TransferPartner{
		{
			ID:            "tp-1",
			FromProgramID: "lp-mr",
			ToProgramID:   "lp-bad",
			TransferRatio: 1.0,
			ToProgram:     &model.LoyaltyProgram{ID: "lp-bad", Name: "BadProg", Slug: "bad-prog", BaseCPP: 0.5},
		},
	}

	recs, err := ts.svc.GetBestCard(context.Background(), model.OptimizeRequest{
		SessionID:    "sess-1",
		CategorySlug: "groceries",
		SpendAmount:  100,
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	rec := recs[0]
	if rec.TransferPartner != "" {
		t.Errorf("expected no transfer partner when native is better, got %q", rec.TransferPartner)
	}
	// Native: 100 * 5 = 500pts * (2.0/100) = $10.00
	if !almostEqual(rec.DollarValue, 10.0, 0.01) {
		t.Errorf("expected $10.00 native, got $%.2f", rec.DollarValue)
	}
}

// ── Blended rate / cap enforcement tests ────────────────────────────────────

func TestCalculateBlendedRate_NoCap(t *testing.T) {
	rate, isHit, note := calculateBlendedRate(100, 0, 2500, "monthly", 5.0, 1.0)

	if isHit {
		t.Error("cap should not be hit")
	}
	if !almostEqual(rate, 5.0, 0.001) {
		t.Errorf("expected full bonus rate 5.0, got %.3f", rate)
	}
	if note == "" {
		t.Error("expected a note about remaining cap")
	}
}

func TestCalculateBlendedRate_FullCapHit(t *testing.T) {
	rate, isHit, note := calculateBlendedRate(100, 2500, 2500, "monthly", 5.0, 1.0)

	if !isHit {
		t.Error("cap should be hit")
	}
	if !almostEqual(rate, 1.0, 0.001) {
		t.Errorf("expected fallback rate 1.0, got %.3f", rate)
	}
	if note == "" {
		t.Error("expected a note")
	}
}

func TestCalculateBlendedRate_PartialCap(t *testing.T) {
	// Current spend: 2400, cap: 2500, spending 200
	// 100 at 5x + 100 at 1x → blended = (500 + 100) / 200 = 3.0
	rate, isHit, note := calculateBlendedRate(200, 2400, 2500, "monthly", 5.0, 1.0)

	if !isHit {
		t.Error("cap should be hit (partial)")
	}
	if !almostEqual(rate, 3.0, 0.001) {
		t.Errorf("expected blended rate 3.0, got %.3f", rate)
	}
	if note == "" {
		t.Error("expected a note about blended rate")
	}
}

func TestCalculateBlendedRate_CapExceeded(t *testing.T) {
	// Already over cap
	rate, isHit, _ := calculateBlendedRate(100, 3000, 2500, "monthly", 5.0, 1.0)

	if !isHit {
		t.Error("cap should be hit")
	}
	if !almostEqual(rate, 1.0, 0.001) {
		t.Errorf("expected fallback rate 1.0, got %.3f", rate)
	}
}

func TestCalculateBlendedRate_ExactCapBoundary(t *testing.T) {
	// Spending exactly what's left in the cap
	rate, isHit, _ := calculateBlendedRate(100, 2400, 2500, "monthly", 5.0, 1.0)

	if isHit {
		t.Error("cap should NOT be hit when spend exactly fits")
	}
	if !almostEqual(rate, 5.0, 0.001) {
		t.Errorf("expected full bonus rate 5.0, got %.3f", rate)
	}
}

func TestGetBestCard_PerCategoryCap(t *testing.T) {
	ts := newTestOptimizer()

	ts.cardRepo.categories["groceries"] = &model.Category{ID: "cat-g", Slug: "groceries"}
	ts.walletRepo.users["sess-1"] = &model.User{ID: "u1"}
	ts.walletRepo.cards["u1"] = []model.UserCard{
		{
			ID: "uc-1", UserID: "u1", CardID: "c1",
			Card: &model.Card{
				ID: "c1", Name: "Capped Card",
				LoyaltyProgramID: "lp-1",
				LoyaltyProgram:   &model.LoyaltyProgram{ID: "lp-1", Slug: "prog", BaseCPP: 1.0},
			},
		},
	}
	cap := 500.0
	period := "monthly"
	ts.cardRepo.multipliers["c1:cat-g"] = &model.CardMultiplier{
		EarnRate: 5.0, EarnType: "points", FallbackEarnRate: 1.0,
		CapAmount: &cap, CapPeriod: &period,
	}
	ts.valuationRepo.cpps["prog:base"] = 1.0

	// Already spent $400 this month
	month := beginningOfMonth(time.Now())
	key := "u1:c1:" + month.Format("2006-01-02")
	ts.spendRepo.monthlySpend[key] = map[string]float64{"cat-g": 400}

	recs, err := ts.svc.GetBestCard(context.Background(), model.OptimizeRequest{
		SessionID:    "sess-1",
		CategorySlug: "groceries",
		SpendAmount:  200, // 100 at bonus + 100 at fallback
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	rec := recs[0]
	if !rec.IsCapHit {
		t.Error("expected cap hit")
	}
	// Blended: 100 at 5x + 100 at 1x → (500+100)/200 = 3.0
	if !almostEqual(rec.EarnRate, 3.0, 0.01) {
		t.Errorf("expected blended rate 3.0, got %.2f", rec.EarnRate)
	}
}

func TestGetBestCard_SharedCapGroup(t *testing.T) {
	ts := newTestOptimizer()

	ts.cardRepo.categories["groceries"] = &model.Category{ID: "cat-g", Slug: "groceries"}
	ts.walletRepo.users["sess-1"] = &model.User{ID: "u1"}
	ts.walletRepo.cards["u1"] = []model.UserCard{
		{
			ID: "uc-1", UserID: "u1", CardID: "c1",
			Card: &model.Card{
				ID: "c1", Name: "Cobalt",
				LoyaltyProgramID: "lp-1",
				LoyaltyProgram:   &model.LoyaltyProgram{ID: "lp-1", Slug: "amex-mr", BaseCPP: 1.0},
			},
		},
	}
	cap := 2500.0
	period := "monthly"
	ts.cardRepo.multipliers["c1:cat-g"] = &model.CardMultiplier{
		EarnRate: 5.0, EarnType: "points", FallbackEarnRate: 1.0,
		CapAmount: &cap, CapPeriod: &period,
	}
	ts.valuationRepo.cpps["amex-mr:base"] = 2.0

	// Shared cap group: groceries + dining share $2500
	ts.spendRepo.capGroups["c1:cat-g"] = &model.CapGroup{
		ID: "cg-1", CardID: "c1", Name: "Cobalt Essentials",
		CapAmount: 2500, CapPeriod: "monthly",
		CategoryIDs: []string{"cat-g", "cat-d"},
	}

	// Already spent: $1500 groceries + $800 dining = $2300 total
	month := beginningOfMonth(time.Now())
	key := "u1:c1:" + month.Format("2006-01-02")
	ts.spendRepo.monthlySpend[key] = map[string]float64{
		"cat-g": 1500,
		"cat-d": 800,
	}

	recs, err := ts.svc.GetBestCard(context.Background(), model.OptimizeRequest{
		SessionID:    "sess-1",
		CategorySlug: "groceries",
		SpendAmount:  300, // 200 at bonus + 100 at fallback (2300+200=2500, then 100 over)
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	rec := recs[0]
	if !rec.IsCapHit {
		t.Error("expected cap hit for shared cap group")
	}
}

// ── getCPP cache integration tests ──────────────────────────────────────────

func TestGetCPP_CacheHit(t *testing.T) {
	ts := newTestOptimizer()
	ts.cache.valuations["amex-mr:base"] = 2.5

	cpp, err := ts.svc.getCPP(context.Background(), "amex-mr", "base")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !almostEqual(cpp, 2.5, 0.001) {
		t.Errorf("expected 2.5 from cache, got %.3f", cpp)
	}
}

func TestGetCPP_CacheMissFallsToRepo(t *testing.T) {
	ts := newTestOptimizer()
	// Cache empty, repo has value
	ts.valuationRepo.cpps["aeroplan:base"] = 1.8

	cpp, err := ts.svc.getCPP(context.Background(), "aeroplan", "base")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !almostEqual(cpp, 1.8, 0.001) {
		t.Errorf("expected 1.8 from repo, got %.3f", cpp)
	}
}

func TestGetCPP_BothMissReturnsError(t *testing.T) {
	ts := newTestOptimizer()

	_, err := ts.svc.getCPP(context.Background(), "nonexistent", "base")
	if err == nil {
		t.Fatal("expected error when both cache and repo miss")
	}
}

// ── Helpers ─────────────────────────────────────────────────────────────────

func TestBeginningOfMonth(t *testing.T) {
	input := time.Date(2026, 3, 15, 14, 30, 0, 0, time.UTC)
	got := beginningOfMonth(input)
	want := time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Errorf("expected %v, got %v", want, got)
	}
}

func TestSafeStr(t *testing.T) {
	s := "hello"
	if got := safeStr(&s); got != "hello" {
		t.Errorf("expected 'hello', got %q", got)
	}
	if got := safeStr(nil); got != "" {
		t.Errorf("expected empty string for nil, got %q", got)
	}
}

// TestGetBestCard_SharedCapGroupEnforcedWhenMultiplierCapNil is the regression
// test for the P0.1 optimizer bug: a card whose cap lives in a shared cap_group
// (per-multiplier cap_amount NULL — Amex Cobalt after migration 000038) was
// skipping cap enforcement entirely because the cap-group lookup was gated
// behind multiplier.CapAmount != nil. Result: Cobalt ranked $10k spend at a
// flat 5x instead of its true blended rate, beating better uncapped cards.
//
// Scenario: Cobalt 5x groceries (cap_amount NIL on the multiplier) with a
// $2,500/mo shared cap group, vs a plain uncapped 3x card, on $10,000 of
// grocery spend, same program/CPP so the comparison is purely about the cap.
//   Cobalt blended rate = (2500*5 + 7500*1) / 10000 = 2.0x  → 4.0% return
//   Plain 3x (uncapped)  = 3.0x                               → 6.0% return
// The uncapped card must win and Cobalt must report the blended rate + cap hit.
func TestGetBestCard_SharedCapGroupEnforcedWhenMultiplierCapNil(t *testing.T) {
	ts := newTestOptimizer()

	ts.cardRepo.categories["groceries"] = &model.Category{ID: "cat-1", Name: "Groceries", Slug: "groceries"}
	ts.walletRepo.users["sess"] = &model.User{ID: "user-1", SessionID: "sess"}
	ts.walletRepo.cards["user-1"] = []model.UserCard{
		{
			ID: "uc-cobalt", UserID: "user-1", CardID: "card-cobalt",
			Card: &model.Card{
				ID: "card-cobalt", Name: "Amex Cobalt", LoyaltyProgramID: "lp-1",
				LoyaltyProgram: &model.LoyaltyProgram{ID: "lp-1", Name: "Amex MR", Slug: "amex-mr", BaseCPP: 2.0},
			},
		},
		{
			ID: "uc-plain", UserID: "user-1", CardID: "card-plain",
			Card: &model.Card{
				ID: "card-plain", Name: "Plain 3x", LoyaltyProgramID: "lp-1",
				LoyaltyProgram: &model.LoyaltyProgram{ID: "lp-1", Name: "Amex MR", Slug: "amex-mr", BaseCPP: 2.0},
			},
		},
	}
	// Cobalt: 5x grocery but per-multiplier cap is NIL (cap lives in the group).
	ts.cardRepo.multipliers["card-cobalt:cat-1"] = &model.CardMultiplier{
		EarnRate: 5.0, EarnType: "points", CapAmount: nil, FallbackEarnRate: 1.0,
	}
	// Plain competitor: 3x, no cap of any kind.
	ts.cardRepo.multipliers["card-plain:cat-1"] = &model.CardMultiplier{
		EarnRate: 3.0, EarnType: "points", FallbackEarnRate: 1.0,
	}
	// The shared $2,500/mo cap group covering groceries (cat-1).
	ts.spendRepo.capGroups["card-cobalt:cat-1"] = &model.CapGroup{
		ID: "cg-1", CardID: "card-cobalt", Name: "food_drink_streaming",
		CapAmount: 2500, CapPeriod: "monthly", CategoryIDs: []string{"cat-1"},
	}
	ts.valuationRepo.cpps["amex-mr:base"] = 2.0

	recs, err := ts.svc.GetBestCard(context.Background(), model.OptimizeRequest{
		SessionID: "sess", CategorySlug: "groceries", SpendAmount: 10000,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(recs) != 2 {
		t.Fatalf("expected 2 recommendations, got %d", len(recs))
	}

	// Uncapped 3x must outrank the group-capped Cobalt.
	if recs[0].CardName != "Plain 3x" {
		t.Errorf("expected 'Plain 3x' ranked #1, got %q (cap not enforced — the bug)", recs[0].CardName)
	}

	var cobalt *model.CardRecommendation
	for i := range recs {
		if recs[i].CardName == "Amex Cobalt" {
			cobalt = &recs[i]
		}
	}
	if cobalt == nil {
		t.Fatal("Cobalt recommendation missing")
	}
	// Blended effective return must be ~4.0%, NOT the buggy uncapped ~10.0%.
	if !almostEqual(cobalt.EffectiveReturn, 4.0, 0.01) {
		t.Errorf("Cobalt effective return: expected ~4.0%% (blended), got %.2f%% — cap group not applied", cobalt.EffectiveReturn)
	}
	if !cobalt.IsCapHit {
		t.Error("Cobalt should report IsCapHit=true for $10k spend over a $2,500 cap")
	}
}

// TestGetBestCard_PerPurchaseIgnoresMonthlySpend is the regression test for
// H3: the missed-rewards replay scored months-old transactions against the
// CURRENT live month's running cap state, making "$X left on the table"
// wrong and non-deterministic. PerPurchase mode must score each call as an
// independent transaction — fully ignoring accumulated monthly spend.
func TestGetBestCard_PerPurchaseIgnoresMonthlySpend(t *testing.T) {
	ts := newTestOptimizer()
	ts.cardRepo.categories["groceries"] = &model.Category{ID: "cat-g", Slug: "groceries"}
	ts.walletRepo.users["sess-1"] = &model.User{ID: "u1"}
	ts.walletRepo.cards["u1"] = []model.UserCard{
		{
			ID: "uc-1", UserID: "u1", CardID: "c1",
			Card: &model.Card{
				ID: "c1", Name: "Capped Card", LoyaltyProgramID: "lp-1",
				LoyaltyProgram: &model.LoyaltyProgram{ID: "lp-1", Slug: "prog", BaseCPP: 1.0},
			},
		},
	}
	capAmt := 500.0
	period := "monthly"
	ts.cardRepo.multipliers["c1:cat-g"] = &model.CardMultiplier{
		EarnRate: 5.0, EarnType: "points", FallbackEarnRate: 1.0,
		CapAmount: &capAmt, CapPeriod: &period,
	}
	ts.valuationRepo.cpps["prog:base"] = 1.0

	// Seed the live month as if the cap were already blown a hundred times
	// over. Non-per-purchase scoring would collapse to the 1x fallback.
	month := beginningOfMonth(time.Now())
	ts.spendRepo.monthlySpend["u1:c1:"+month.Format("2006-01-02")] = map[string]float64{"cat-g": 50000}

	recs, err := ts.svc.GetBestCard(context.Background(), model.OptimizeRequest{
		SessionID: "sess-1", CategorySlug: "groceries", SpendAmount: 300,
		PerPurchase: true,
	})
	if err != nil || len(recs) != 1 {
		t.Fatalf("unexpected: err=%v recs=%d", err, len(recs))
	}
	// $300 < $500 cap → full 5x at 1.0¢: 300*5=1500 pts → $15 → 5.0% return.
	// If the seeded $50,000 leaked in, this would be the 1x fallback (~1.0%).
	if !almostEqual(recs[0].EffectiveReturn, 5.0, 0.01) {
		t.Errorf("per-purchase return: got %.2f%%, want 5.00%% — monthly spend state leaked into the replay (H3)", recs[0].EffectiveReturn)
	}
}
