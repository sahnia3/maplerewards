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
	r, err := newSQCSvc(nil, defaultTiers()).Project(context.Background(), "sess", SQCFlightInputs{})
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
	r, err := newSQCSvc(cards, defaultTiers()).Project(context.Background(), "sess", SQCFlightInputs{})
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
	r, err := newSQCSvc(cards, defaultTiers()).Project(context.Background(), "sess", SQCFlightInputs{})
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
	r, err := newSQCSvc(cards, defaultTiers()).Project(context.Background(), "sess", SQCFlightInputs{})
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
	r, err := newSQCSvc(cards, defaultTiers()).Project(context.Background(), "sess", SQCFlightInputs{})
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
	r, err := newSQCSvc(cards, defaultTiers()).Project(context.Background(), "sess", SQCFlightInputs{})
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
	r, err := newSQCSvc(cards, defaultTiers()).Project(context.Background(), "sess", SQCFlightInputs{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// BestCardForGap should be Reserve (the one with positive rate), not ZeroRate.
	if r.BestCardForGap != "Reserve" {
		t.Fatalf("expected Reserve (zero-rate skipped), got %q", r.BestCardForGap)
	}
}

// P6 sibling re-sweep: GetUserSQCContext does not guarantee tier ordering.
// Feed tiers in a shuffled order and assert the projection is identical to
// the ascending-ordered case (no impossible "next tier", correct current).
func TestSQC_UnorderedTiersStillCorrect(t *testing.T) {
	shuffled := []model.SQCTier{
		{StatusLevel: "Super Elite", SQCRequired: 125_000, MinRevenueCAD: 20_000},
		{StatusLevel: "25K", SQCRequired: 25_000},
		{StatusLevel: "75K", SQCRequired: 75_000, MinRevenueCAD: 9_000},
		{StatusLevel: "35K", SQCRequired: 35_000},
		{StatusLevel: "50K", SQCRequired: 50_000},
	}
	cards := []model.SQCCardContribution{
		{CardID: "c1", CardName: "Reserve", DollarsPerSQC: 4, YTDSpend: 100_000, SQCEarned: 28_000},
	}
	r, err := newSQCSvc(cards, shuffled).Project(context.Background(), "sess", SQCFlightInputs{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Same expectations as TestSQC_AtTierThresholdShowsCurrentAndNext.
	if r.CurrentTier != "25K" {
		t.Fatalf("unordered tiers: expected CurrentTier 25K, got %q", r.CurrentTier)
	}
	if r.NextTier != "35K" {
		t.Fatalf("unordered tiers: expected NextTier 35K (not a higher tier), got %q", r.NextTier)
	}
	if r.SQCToNextTier != 7000 {
		t.Fatalf("unordered tiers: expected 7K SQC to next, got %d", r.SQCToNextTier)
	}
	// out.Tiers must be surfaced ascending after the in-place sort.
	for i := 1; i < len(r.Tiers); i++ {
		if r.Tiers[i].SQCRequired < r.Tiers[i-1].SQCRequired {
			t.Fatalf("out.Tiers not ascending at %d: %+v", i, r.Tiers)
		}
	}
}

func TestSQC_RepoErrorPropagates(t *testing.T) {
	svc := NewSQCService(&mockMissedWalletRepo{}, &mockSQCRepo{err: errors.New("db down")})
	_, err := svc.Project(context.Background(), "sess", SQCFlightInputs{})
	if err == nil {
		t.Fatal("expected error when repo fails")
	}
}

// ── Revenue-floor + flight-SQC enhancement (additive) ───────────────────────

// Absent flight inputs MUST leave the legacy fields untouched AND the new
// fields harmless: at flight_spend 0 with no revenue floor on the target tier,
// qualified_tier should equal current_tier.
func TestSQC_NoFlightInputsPreservesLegacyAndQualifies(t *testing.T) {
	cards := []model.SQCCardContribution{
		{CardID: "c1", CardName: "Reserve", DollarsPerSQC: 4, YTDSpend: 100_000, SQCEarned: 28_000},
	}
	r, err := newSQCSvc(cards, defaultTiers()).Project(context.Background(), "sess", SQCFlightInputs{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Legacy fields unchanged vs TestSQC_AtTierThresholdShowsCurrentAndNext.
	if r.CurrentTier != "25K" || r.NextTier != "35K" || r.SQCToNextTier != 7000 {
		t.Fatalf("legacy fields drifted: current=%q next=%q gap=%d", r.CurrentTier, r.NextTier, r.SQCToNextTier)
	}
	// New echo fields default to 0.
	if r.FlightSQC != 0 || r.FlightSpendCAD != 0 {
		t.Fatalf("expected flight inputs echoed as 0, got sqc=%d spend=%.2f", r.FlightSQC, r.FlightSpendCAD)
	}
	// 25K tier has no revenue floor → next tier (35K) floor is 0 → met, no gap.
	if r.RevenueFloorCAD != 0 || !r.RevenueFloorMet || r.RevenueFloorGapCAD != 0 {
		t.Fatalf("expected floor 0/met/0, got floor=%.0f met=%v gap=%.0f", r.RevenueFloorCAD, r.RevenueFloorMet, r.RevenueFloorGapCAD)
	}
	// Both conditions met for 25K → qualified equals current.
	if r.QualifiedTier != "25K" {
		t.Fatalf("expected qualified_tier 25K, got %q", r.QualifiedTier)
	}
}

// Floor NOT met: card SQC clears 75K (which carries a $9K floor) but the user
// reports $0 flight revenue, so qualified_tier must trail current_tier.
func TestSQC_RevenueFloorNotMetTrailsCurrentTier(t *testing.T) {
	cards := []model.SQCCardContribution{
		{CardID: "c1", CardName: "Reserve", DollarsPerSQC: 4, YTDSpend: 320_000, SQCEarned: 80_000},
	}
	r, err := newSQCSvc(cards, defaultTiers()).Project(context.Background(), "sess", SQCFlightInputs{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// 80K SQC clears 75K on SQC alone.
	if r.CurrentTier != "75K" {
		t.Fatalf("expected CurrentTier 75K, got %q", r.CurrentTier)
	}
	// But 75K needs $9K flight revenue (have $0) → highest BOTH-met tier is 50K.
	if r.QualifiedTier != "50K" {
		t.Fatalf("expected QualifiedTier 50K (floor not met for 75K), got %q", r.QualifiedTier)
	}
	if r.NextTier != "Super Elite" {
		t.Fatalf("expected NextTier Super Elite, got %q", r.NextTier)
	}
	// Target floor is Super Elite's $20K; unmet with $0 reported.
	if r.RevenueFloorCAD != 20_000 {
		t.Fatalf("expected RevenueFloorCAD 20000, got %.0f", r.RevenueFloorCAD)
	}
	if r.RevenueFloorMet {
		t.Fatal("expected RevenueFloorMet=false")
	}
	if r.RevenueFloorGapCAD != 20_000 {
		t.Fatalf("expected RevenueFloorGapCAD 20000, got %.0f", r.RevenueFloorGapCAD)
	}
}

// Floor MET: enough flight revenue clears the highest tier's floor, so
// qualified_tier rises to match the SQC-cleared tier.
func TestSQC_RevenueFloorMetQualifiesTopTier(t *testing.T) {
	cards := []model.SQCCardContribution{
		{CardID: "c1", CardName: "Reserve", DollarsPerSQC: 4, YTDSpend: 320_000, SQCEarned: 80_000},
	}
	r, err := newSQCSvc(cards, defaultTiers()).Project(context.Background(), "sess", SQCFlightInputs{FlightSpendCAD: 12_000})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// $12K clears the 75K floor ($9K); 80K SQC clears 75K → qualified 75K.
	if r.QualifiedTier != "75K" {
		t.Fatalf("expected QualifiedTier 75K (floor met), got %q", r.QualifiedTier)
	}
	if r.FlightSpendCAD != 12_000 {
		t.Fatalf("expected FlightSpendCAD echoed 12000, got %.0f", r.FlightSpendCAD)
	}
	// Next tier Super Elite floor is $20K; $12K leaves an $8K gap.
	if r.RevenueFloorCAD != 20_000 || r.RevenueFloorMet || r.RevenueFloorGapCAD != 8_000 {
		t.Fatalf("expected floor 20000/unmet/gap 8000, got floor=%.0f met=%v gap=%.0f", r.RevenueFloorCAD, r.RevenueFloorMet, r.RevenueFloorGapCAD)
	}
}

// Flight SQC adds into the running total and can lift the current tier.
func TestSQC_FlightSQCAddsToTotal(t *testing.T) {
	cards := []model.SQCCardContribution{
		{CardID: "c1", CardName: "Reserve", DollarsPerSQC: 4, YTDSpend: 80_000, SQCEarned: 20_000},
	}
	// 20K card SQC alone → below the 25K floor (no current tier). Adding 10K
	// flight SQC lifts the total to 30K → clears the 25K tier.
	r, err := newSQCSvc(cards, defaultTiers()).Project(context.Background(), "sess", SQCFlightInputs{FlightSQC: 10_000})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r.TotalSQCEarned != 30_000 {
		t.Fatalf("expected TotalSQCEarned 30000 (20K card + 10K flight), got %d", r.TotalSQCEarned)
	}
	if r.FlightSQC != 10_000 {
		t.Fatalf("expected FlightSQC echoed 10000, got %d", r.FlightSQC)
	}
	if r.CurrentTier != "25K" {
		t.Fatalf("expected CurrentTier 25K after flight SQC, got %q", r.CurrentTier)
	}
	if r.NextTier != "35K" {
		t.Fatalf("expected NextTier 35K, got %q", r.NextTier)
	}
	// 25K cleared with no floor + $0 flight revenue → qualified 25K.
	if r.QualifiedTier != "25K" {
		t.Fatalf("expected QualifiedTier 25K, got %q", r.QualifiedTier)
	}
}
