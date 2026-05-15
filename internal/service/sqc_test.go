package service

import (
	"context"
	"errors"
	"testing"

	"maplerewards/internal/model"
)

// ── Mock ──────────────────────────────────────────────────────────────────

type mockSQCRepo struct {
	cards []model.SQCCardContribution
	tiers []model.SQCTier
	err   error
}

func (m *mockSQCRepo) GetUserSQCContext(ctx context.Context, userID string, year int) ([]model.SQCCardContribution, []model.SQCTier, error) {
	if m.err != nil {
		return nil, nil, m.err
	}
	return m.cards, m.tiers, nil
}

func newSQCSvc(cards []model.SQCCardContribution, tiers []model.SQCTier) *SQCService {
	return NewSQCService(&mockMissedWalletRepo{}, &mockSQCRepo{cards: cards, tiers: tiers})
}

func defaultTiers() []model.SQCTier {
	return []model.SQCTier{
		{StatusLevel: "25K", SQCRequired: 25_000},
		{StatusLevel: "35K", SQCRequired: 35_000},
		{StatusLevel: "50K", SQCRequired: 50_000},
		{StatusLevel: "75K", SQCRequired: 75_000, MinRevenueCAD: 9_000},
		{StatusLevel: "Super Elite", SQCRequired: 125_000, MinRevenueCAD: 20_000},
	}
}

// ── Tests ─────────────────────────────────────────────────────────────────

func TestSQC_NoAeroplanCards(t *testing.T) {
	r, err := newSQCSvc(nil, defaultTiers()).Project(context.Background(), "sess")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !r.WalletHasNoCards {
		t.Fatal("expected WalletHasNoCards=true")
	}
	if r.TotalSQCEarned != 0 {
		t.Fatalf("expected TotalSQCEarned=0, got %d", r.TotalSQCEarned)
	}
}

func TestSQC_SumsAcrossCards(t *testing.T) {
	cards := []model.SQCCardContribution{
		{CardID: "c1", CardName: "Aeroplan Reserve", DollarsPerSQC: 4, YTDSpend: 12_000, SQCEarned: 3000},
		{CardID: "c2", CardName: "Aeroplan Visa Infinite", DollarsPerSQC: 5, YTDSpend: 15_000, SQCEarned: 3000},
	}
	r, err := newSQCSvc(cards, defaultTiers()).Project(context.Background(), "sess")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r.TotalSQCEarned != 6000 {
		t.Fatalf("expected 6000 SQC total, got %d", r.TotalSQCEarned)
	}
	if r.WalletHasNoCards {
		t.Fatal("expected WalletHasNoCards=false")
	}
}

func TestSQC_CurrentTierBelowFirstThreshold(t *testing.T) {
	cards := []model.SQCCardContribution{
		{CardID: "c1", CardName: "Reserve", DollarsPerSQC: 4, YTDSpend: 40_000, SQCEarned: 10_000},
	}
	r, err := newSQCSvc(cards, defaultTiers()).Project(context.Background(), "sess")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r.CurrentTier != "" {
		t.Fatalf("expected no tier yet at 10K SQC, got %q", r.CurrentTier)
	}
	if r.NextTier != "25K" {
		t.Fatalf("expected NextTier 25K, got %q", r.NextTier)
	}
	if r.SQCToNextTier != 15_000 {
		t.Fatalf("expected 15K SQC gap, got %d", r.SQCToNextTier)
	}
}

func TestSQC_AtTierThresholdShowsCurrentAndNext(t *testing.T) {
	cards := []model.SQCCardContribution{
		{CardID: "c1", CardName: "Reserve", DollarsPerSQC: 4, YTDSpend: 100_000, SQCEarned: 28_000},
	}
	r, err := newSQCSvc(cards, defaultTiers()).Project(context.Background(), "sess")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r.CurrentTier != "25K" {
		t.Fatalf("expected CurrentTier 25K at 28K SQC, got %q", r.CurrentTier)
	}
	if r.NextTier != "35K" {
		t.Fatalf("expected NextTier 35K, got %q", r.NextTier)
	}
	if r.SQCToNextTier != 7000 {
		t.Fatalf("expected 7K SQC to next, got %d", r.SQCToNextTier)
	}
}

func TestSQC_AtTopTierNoNext(t *testing.T) {
	cards := []model.SQCCardContribution{
		{CardID: "c1", CardName: "Reserve", DollarsPerSQC: 4, YTDSpend: 600_000, SQCEarned: 150_000},
	}
	r, err := newSQCSvc(cards, defaultTiers()).Project(context.Background(), "sess")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r.CurrentTier != "Super Elite" {
		t.Fatalf("expected Super Elite, got %q", r.CurrentTier)
	}
	if r.NextTier != "" {
		t.Fatalf("expected no NextTier at top, got %q", r.NextTier)
	}
}

func TestSQC_BestCardForGapAndSpendToClose(t *testing.T) {
	cards := []model.SQCCardContribution{
		// card1 needs $4 per SQC; card2 needs $5 — card1 is the best rate.
		{CardID: "c1", CardName: "Reserve", DollarsPerSQC: 4, YTDSpend: 50_000, SQCEarned: 12_500},
		{CardID: "c2", CardName: "Infinite", DollarsPerSQC: 5, YTDSpend: 25_000, SQCEarned: 5_000},
	}
	r, err := newSQCSvc(cards, defaultTiers()).Project(context.Background(), "sess")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// 17,500 SQC earned → next tier 25K, gap = 7,500
	if r.SQCToNextTier != 7_500 {
		t.Fatalf("expected gap 7500, got %d", r.SQCToNextTier)
	}
	if r.BestCardForGap != "Reserve" {
		t.Fatalf("expected Reserve as best, got %q", r.BestCardForGap)
	}
	// 7500 × $4 = $30,000
	if r.SpendToNextTier != 30_000 {
		t.Fatalf("expected $30,000 spend to clear, got %.2f", r.SpendToNextTier)
	}
}

func TestSQC_SkipsCardsWithZeroSQCRate(t *testing.T) {
	cards := []model.SQCCardContribution{
		{CardID: "c1", CardName: "ZeroRate", DollarsPerSQC: 0, YTDSpend: 100_000, SQCEarned: 0},
		{CardID: "c2", CardName: "Reserve", DollarsPerSQC: 4, YTDSpend: 50_000, SQCEarned: 12_500},
	}
	r, err := newSQCSvc(cards, defaultTiers()).Project(context.Background(), "sess")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// BestCardForGap should be Reserve (the one with positive rate), not ZeroRate.
	if r.BestCardForGap != "Reserve" {
		t.Fatalf("expected Reserve (zero-rate skipped), got %q", r.BestCardForGap)
	}
}

func TestSQC_RepoErrorPropagates(t *testing.T) {
	svc := NewSQCService(&mockMissedWalletRepo{}, &mockSQCRepo{err: errors.New("db down")})
	_, err := svc.Project(context.Background(), "sess")
	if err == nil {
		t.Fatal("expected error when repo fails")
	}
}
