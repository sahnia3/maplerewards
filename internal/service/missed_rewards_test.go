package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"maplerewards/internal/model"
)

// ── Mocks ─────────────────────────────────────────────────────────────────

type mockMissedSpendRepo struct {
	entries []model.SpendEntry
}

func (m *mockMissedSpendRepo) GetMonthlySpend(ctx context.Context, userID, cardID string, month time.Time) (map[string]float64, error) {
	return map[string]float64{}, nil
}
func (m *mockMissedSpendRepo) UpsertMonthlySpend(ctx context.Context, userID, cardID, categoryID string, month time.Time, amount float64) error {
	return nil
}
func (m *mockMissedSpendRepo) GetCapGroupForCard(ctx context.Context, cardID, categoryID string) (*model.CapGroup, error) {
	return nil, nil
}
func (m *mockMissedSpendRepo) CreateSpendEntry(ctx context.Context, entry model.SpendEntry) (*model.SpendEntry, error) {
	return &entry, nil
}
func (m *mockMissedSpendRepo) ListSpendEntries(ctx context.Context, userID string, limit, offset int) ([]model.SpendEntry, error) {
	if offset >= len(m.entries) {
		return nil, nil
	}
	end := offset + limit
	if end > len(m.entries) {
		end = len(m.entries)
	}
	return m.entries[offset:end], nil
}
func (m *mockMissedSpendRepo) GetSpendStats(ctx context.Context, userID string) (*model.SpendStats, error) {
	return &model.SpendStats{}, nil
}

// mockMissedOptimizer returns a fixed best-card-per-category map.
type mockMissedOptimizer struct {
	bestByCat map[string]model.CardRecommendation
}

func (m *mockMissedOptimizer) GetBestCard(ctx context.Context, req model.OptimizeRequest) ([]model.CardRecommendation, error) {
	rec, ok := m.bestByCat[req.CategorySlug]
	if !ok {
		return nil, errors.New("no rec for category")
	}
	// Scale dollar value linearly with spend so caller sees consistent math.
	scaled := rec
	if req.SpendAmount > 0 && rec.DollarValue > 0 {
		// Treat the rec's DollarValue as the value at $100; scale to actual.
		scaled.DollarValue = rec.DollarValue * (req.SpendAmount / 100.0)
	}
	return []model.CardRecommendation{scaled}, nil
}

// Wallet mock — only GetUserBySession is exercised here.
type mockMissedWalletRepo struct{}

func (m *mockMissedWalletRepo) CreateUser(ctx context.Context, sessionID string) (*model.User, error) {
	return &model.User{ID: "u1", SessionID: sessionID}, nil
}
func (m *mockMissedWalletRepo) GetUserBySession(ctx context.Context, sessionID string) (*model.User, error) {
	if sessionID == "" {
		return nil, errors.New("empty session")
	}
	return &model.User{ID: "u1", SessionID: sessionID}, nil
}
func (m *mockMissedWalletRepo) GetUserCards(ctx context.Context, userID string) ([]model.UserCard, error) {
	return nil, nil
}
func (m *mockMissedWalletRepo) AddCard(ctx context.Context, userID, cardID string) (*model.UserCard, error) {
	return nil, nil
}
func (m *mockMissedWalletRepo) RemoveCard(ctx context.Context, userID, cardID string) error {
	return nil
}
func (m *mockMissedWalletRepo) UpdateBalance(ctx context.Context, userID, cardID string, balance int64) error {
	return nil
}
func (m *mockMissedWalletRepo) UpdateCardDetails(ctx context.Context, userID, cardID string, req model.UpdateCardDetailsRequest) error {
	return nil
}

// ── Helpers ───────────────────────────────────────────────────────────────

func newMissedSvc(entries []model.SpendEntry, bestByCat map[string]model.CardRecommendation) *MissedRewardsService {
	return NewMissedRewardsService(
		&mockMissedWalletRepo{},
		&mockMissedSpendRepo{entries: entries},
		&mockMissedOptimizer{bestByCat: bestByCat},
	)
}

func todayMinus(days int) string {
	return time.Now().AddDate(0, 0, -days).Format("2006-01-02")
}

// ── Tests ─────────────────────────────────────────────────────────────────

func TestMissedRewards_EmptySpend(t *testing.T) {
	svc := newMissedSvc(nil, nil)
	r, err := svc.ComputeMissedRewards(context.Background(), "sess", 0, 5)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r.EntryCount != 0 || r.TotalGap != 0 || len(r.TopMissed) != 0 {
		t.Fatalf("expected empty report, got %+v", r)
	}
}

func TestMissedRewards_OptimalCard_NoGap(t *testing.T) {
	// User spent $100 on dining with the optimal card (cobalt).
	entries := []model.SpendEntry{{
		ID: "s1", CardID: "cobalt", CardName: "Cobalt",
		CategorySlug: "dining", CategoryName: "Dining",
		Amount: 100, DollarValue: 12.5, SpentAt: todayMinus(5),
	}}
	best := map[string]model.CardRecommendation{
		"dining": {CardID: "cobalt", CardName: "Cobalt", DollarValue: 12.5},
	}
	r, err := newMissedSvc(entries, best).ComputeMissedRewards(context.Background(), "sess", 0, 5)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r.MissedCount != 0 {
		t.Fatalf("expected MissedCount 0, got %d", r.MissedCount)
	}
	if r.TotalGap != 0 {
		t.Fatalf("expected TotalGap 0, got %.2f", r.TotalGap)
	}
	if len(r.TopMissed) != 0 {
		t.Fatalf("expected no top-missed, got %d", len(r.TopMissed))
	}
	if r.EntryCount != 1 {
		t.Fatalf("expected EntryCount 1, got %d", r.EntryCount)
	}
}

func TestMissedRewards_SuboptimalCard_RecordsGap(t *testing.T) {
	// User spent $200 on dining with TD Cash (1% = $2). Cobalt would have given $25.
	entries := []model.SpendEntry{{
		ID: "s1", CardID: "td-cash", CardName: "TD Cash",
		CategorySlug: "dining", CategoryName: "Dining",
		Amount: 200, DollarValue: 2.0, SpentAt: todayMinus(3),
	}}
	best := map[string]model.CardRecommendation{
		// 12.5 at $100 → 25.0 at $200
		"dining": {CardID: "cobalt", CardName: "Cobalt", DollarValue: 12.5},
	}
	r, err := newMissedSvc(entries, best).ComputeMissedRewards(context.Background(), "sess", 0, 5)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r.MissedCount != 1 {
		t.Fatalf("expected MissedCount 1, got %d", r.MissedCount)
	}
	if r.TotalGap < 22.99 || r.TotalGap > 23.01 {
		t.Fatalf("expected TotalGap ~23.00, got %.2f", r.TotalGap)
	}
	if len(r.TopMissed) != 1 {
		t.Fatalf("expected 1 top-missed entry, got %d", len(r.TopMissed))
	}
	if r.TopMissed[0].OptimalCardName != "Cobalt" {
		t.Fatalf("expected optimal Cobalt, got %s", r.TopMissed[0].OptimalCardName)
	}
}

func TestMissedRewards_TopMissedSortedByGapDesc(t *testing.T) {
	// Three suboptimal entries — ensure ordering by gap descending.
	entries := []model.SpendEntry{
		{ID: "small", CardID: "td", CardName: "TD", CategorySlug: "dining", CategoryName: "Dining",
			Amount: 50, DollarValue: 0.5, SpentAt: todayMinus(1)}, // optimal $6.25 → gap $5.75
		{ID: "big", CardID: "td", CardName: "TD", CategorySlug: "dining", CategoryName: "Dining",
			Amount: 1000, DollarValue: 10.0, SpentAt: todayMinus(2)}, // optimal $125 → gap $115
		{ID: "med", CardID: "td", CardName: "TD", CategorySlug: "dining", CategoryName: "Dining",
			Amount: 200, DollarValue: 2.0, SpentAt: todayMinus(3)}, // optimal $25 → gap $23
	}
	best := map[string]model.CardRecommendation{
		"dining": {CardID: "cobalt", CardName: "Cobalt", DollarValue: 12.5},
	}
	r, err := newMissedSvc(entries, best).ComputeMissedRewards(context.Background(), "sess", 0, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(r.TopMissed) != 3 {
		t.Fatalf("expected 3 top-missed, got %d", len(r.TopMissed))
	}
	if r.TopMissed[0].SpendEntryID != "big" {
		t.Fatalf("expected biggest-gap first (big), got %s", r.TopMissed[0].SpendEntryID)
	}
	if r.TopMissed[2].SpendEntryID != "small" {
		t.Fatalf("expected smallest-gap last (small), got %s", r.TopMissed[2].SpendEntryID)
	}
}

func TestMissedRewards_SinceDaysFiltersOldEntries(t *testing.T) {
	entries := []model.SpendEntry{
		{ID: "recent", CardID: "td", CardName: "TD", CategorySlug: "dining", CategoryName: "Dining",
			Amount: 100, DollarValue: 1.0, SpentAt: todayMinus(5)},
		{ID: "old", CardID: "td", CardName: "TD", CategorySlug: "dining", CategoryName: "Dining",
			Amount: 100, DollarValue: 1.0, SpentAt: todayMinus(60)},
	}
	best := map[string]model.CardRecommendation{
		"dining": {CardID: "cobalt", CardName: "Cobalt", DollarValue: 12.5},
	}
	r, err := newMissedSvc(entries, best).ComputeMissedRewards(context.Background(), "sess", 30, 5)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r.EntryCount != 1 {
		t.Fatalf("expected only 1 entry within 30 days, got %d", r.EntryCount)
	}
	if r.TopMissed[0].SpendEntryID != "recent" {
		t.Fatalf("expected recent entry only, got %s", r.TopMissed[0].SpendEntryID)
	}
}

func TestMissedRewards_ByCategoryAggregates(t *testing.T) {
	entries := []model.SpendEntry{
		{ID: "d1", CardID: "td", CardName: "TD", CategorySlug: "dining", CategoryName: "Dining",
			Amount: 100, DollarValue: 1.0, SpentAt: todayMinus(1)},
		{ID: "d2", CardID: "td", CardName: "TD", CategorySlug: "dining", CategoryName: "Dining",
			Amount: 100, DollarValue: 1.0, SpentAt: todayMinus(2)},
		{ID: "g1", CardID: "td", CardName: "TD", CategorySlug: "groceries", CategoryName: "Groceries",
			Amount: 200, DollarValue: 2.0, SpentAt: todayMinus(3)},
	}
	best := map[string]model.CardRecommendation{
		"dining":    {CardID: "cobalt", CardName: "Cobalt", DollarValue: 12.5},
		"groceries": {CardID: "scotia-pass", CardName: "Scotia Passport", DollarValue: 6.0},
	}
	r, err := newMissedSvc(entries, best).ComputeMissedRewards(context.Background(), "sess", 0, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(r.ByCategory) != 2 {
		t.Fatalf("expected 2 category buckets, got %d", len(r.ByCategory))
	}
	// Sorted gap desc: dining gap = 23, groceries gap = 10
	if r.ByCategory[0].CategorySlug != "dining" {
		t.Fatalf("expected dining first (largest gap), got %s", r.ByCategory[0].CategorySlug)
	}
	if r.ByCategory[0].EntryCount != 2 {
		t.Fatalf("expected dining EntryCount 2, got %d", r.ByCategory[0].EntryCount)
	}
}

func TestMissedRewards_SkipsEntriesOptimizerCantScore(t *testing.T) {
	entries := []model.SpendEntry{
		{ID: "ok", CardID: "td", CardName: "TD", CategorySlug: "dining", CategoryName: "Dining",
			Amount: 100, DollarValue: 1.0, SpentAt: todayMinus(1)},
		{ID: "unknown", CardID: "td", CardName: "TD", CategorySlug: "fictional", CategoryName: "Fictional",
			Amount: 100, DollarValue: 1.0, SpentAt: todayMinus(2)},
	}
	best := map[string]model.CardRecommendation{
		"dining": {CardID: "cobalt", CardName: "Cobalt", DollarValue: 12.5},
	}
	r, err := newMissedSvc(entries, best).ComputeMissedRewards(context.Background(), "sess", 0, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r.EntryCount != 1 {
		t.Fatalf("expected 1 scorable entry, got %d", r.EntryCount)
	}
}

func TestMissedRewards_EmptySession_Errors(t *testing.T) {
	_, err := newMissedSvc(nil, nil).ComputeMissedRewards(context.Background(), "", 0, 5)
	if err == nil {
		t.Fatal("expected error for empty session")
	}
}
