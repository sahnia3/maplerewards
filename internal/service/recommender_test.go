package service

import (
	"context"
	"testing"

	"maplerewards/internal/model"
)

// recMockRepo is a minimal CardRepository for the recommender DoS/batching test.
// It records how many times the per-card multiplier query runs so we can assert
// the amplification fix: one ListMultipliersForCard call per card, regardless of
// how many spend keys the caller sends.
type recMockRepo struct {
	cards         []model.Card
	categories    []model.Category
	multByCard    map[string][]model.MultiplierRow
	listMultCalls int
	perCatCalls   int
}

func (m *recMockRepo) ListCards(ctx context.Context) ([]model.Card, error)         { return m.cards, nil }
func (m *recMockRepo) GetCard(ctx context.Context, id string) (*model.Card, error) { return nil, nil }
func (m *recMockRepo) ListCategories(ctx context.Context) ([]model.Category, error) {
	return m.categories, nil
}
func (m *recMockRepo) GetCategoryBySlug(ctx context.Context, slug string) (*model.Category, error) {
	return nil, nil
}
func (m *recMockRepo) GetCategoryByMCC(ctx context.Context, mcc int) (*model.Category, error) {
	return nil, nil
}
func (m *recMockRepo) GetMultiplierForCard(ctx context.Context, cardID, categoryID string) (*model.CardMultiplier, error) {
	m.perCatCalls++ // should NEVER be called by the batched recommender
	return nil, nil
}
func (m *recMockRepo) GetEverythingElseMultiplier(ctx context.Context, cardID string) (*model.CardMultiplier, error) {
	m.perCatCalls++
	return nil, nil
}
func (m *recMockRepo) ListMultipliersForCard(ctx context.Context, cardID string) ([]model.MultiplierRow, error) {
	m.listMultCalls++
	return m.multByCard[cardID], nil
}
func (m *recMockRepo) GetProgramBySlug(ctx context.Context, slug string) (*model.LoyaltyProgram, error) {
	return nil, nil
}

func TestRecommend_BatchesAndDropsJunkSlugs(t *testing.T) {
	prog := &model.LoyaltyProgram{Name: "Test", BaseCPP: 1.0}
	repo := &recMockRepo{
		cards: []model.Card{
			{ID: "card-1", Name: "A", IsActive: true, LoyaltyProgram: prog},
			{ID: "card-2", Name: "B", IsActive: true, LoyaltyProgram: prog},
		},
		categories: []model.Category{
			{ID: "g", Slug: "groceries", Name: "Groceries"},
			{ID: "d", Slug: "dining", Name: "Dining"},
			{ID: "e", Slug: "everything-else", Name: "Everything Else"},
		},
		multByCard: map[string][]model.MultiplierRow{
			"card-1": {{CategorySlug: "groceries", EarnRate: 4, EarnType: "cashback_pct"}, {CategorySlug: "everything-else", EarnRate: 1, EarnType: "cashback_pct"}},
			"card-2": {{CategorySlug: "everything-else", EarnRate: 2, EarnType: "cashback_pct"}},
		},
	}
	svc := NewRecommenderService(repo)

	// Caller sends a real category, AND a junk/unknown slug (attacker padding).
	req := RecommendRequest{MonthlySpend: map[string]float64{
		"groceries": 1000,
		"junk-slug": 999999, // must be ignored — no per-category fallback query
	}}
	scores, err := svc.Recommend(context.Background(), req)
	if err != nil {
		t.Fatalf("Recommend: %v", err)
	}
	if len(scores) != 2 {
		t.Fatalf("want 2 scored cards, got %d", len(scores))
	}
	// One ListMultipliersForCard per card; the old per-(card,category) path must
	// not be hit at all.
	if repo.listMultCalls != 2 {
		t.Errorf("want 2 ListMultipliersForCard calls (one per card), got %d", repo.listMultCalls)
	}
	if repo.perCatCalls != 0 {
		t.Errorf("per-category query path must not be used; got %d calls", repo.perCatCalls)
	}
	// card-1 wins: 1000 * 4% * 12 = $480 gross; card-2 junk dropped so it only
	// scores groceries at the everything-else 2% = $240.
	if scores[0].CardName != "A" {
		t.Errorf("want card A ranked first, got %s", scores[0].CardName)
	}
	if got := scores[0].GrossAnnualValue; got < 479 || got > 481 {
		t.Errorf("card A gross want ~480, got %.2f", got)
	}
	// The junk slug must not have produced a CategoryReturn on either card.
	for _, s := range scores {
		for _, c := range s.TopCategories {
			if c.CategorySlug == "junk-slug" {
				t.Errorf("junk slug leaked into results for %s", s.CardName)
			}
		}
	}
}

// A capped bonus category must be projected as a blend of the bonus rate (up to
// the cap) and the everything-else fallback (beyond it), not the full bonus
// rate on all spend — mirroring the optimizer's calculateBlendedRate. Before
// this fix the recommender over-projected capped accelerators.
func TestRecommend_CapAwareProjection(t *testing.T) {
	capAmt := 500.0
	period := "monthly"
	prog := &model.LoyaltyProgram{Name: "Test", BaseCPP: 1.0}
	repo := &recMockRepo{
		cards: []model.Card{{ID: "c1", Name: "Capped", IsActive: true, LoyaltyProgram: prog}},
		categories: []model.Category{
			{ID: "g", Slug: "groceries", Name: "Groceries"},
			{ID: "e", Slug: "everything-else", Name: "Everything Else"},
		},
		multByCard: map[string][]model.MultiplierRow{
			"c1": {
				{CategorySlug: "groceries", EarnRate: 5, EarnType: "cashback_pct", CapAmount: &capAmt, CapPeriod: &period},
				{CategorySlug: "everything-else", EarnRate: 1, EarnType: "cashback_pct"},
			},
		},
	}
	scores, err := NewRecommenderService(repo).Recommend(context.Background(),
		RecommendRequest{MonthlySpend: map[string]float64{"groceries": 1000}})
	if err != nil {
		t.Fatalf("Recommend: %v", err)
	}
	// $500 @5% + $500 @1% = $30/mo → $360/yr (the uncapped bug would give $600).
	if got := scores[0].GrossAnnualValue; got < 359 || got > 361 {
		t.Fatalf("capped gross want ~360, got %.2f (full-rate bug gives 600)", got)
	}
	var noted bool
	for _, c := range scores[0].TopCategories {
		if c.CategorySlug == "groceries" && c.Note != "" {
			noted = true
		}
	}
	if !noted {
		t.Error("expected a cap disclosure note on the capped groceries category")
	}
}

// An uncapped high-bonus multiplier (cap_amount NULL — the ~181-multiplier
// catalog gap) must be routed through the same defaultUnverifiedAnnualCap
// blanket guardrail the optimizer applies (optimizer.go:262-298), NOT projected
// at the full bonus rate × 12. Without the guardrail the recommender re-opens
// the over-projection bug for every uncapped accelerator.
func TestRecommend_UncappedBonusGuardrail(t *testing.T) {
	prog := &model.LoyaltyProgram{Name: "Test", BaseCPP: 1.0}
	repo := &recMockRepo{
		cards: []model.Card{{ID: "c1", Name: "Uncapped5x", IsActive: true, LoyaltyProgram: prog}},
		categories: []model.Category{
			{ID: "g", Slug: "groceries", Name: "Groceries"},
			{ID: "e", Slug: "everything-else", Name: "Everything Else"},
		},
		multByCard: map[string][]model.MultiplierRow{
			"c1": {
				// 5x points on groceries, NO cap_amount → must hit the blanket guardrail.
				{CategorySlug: "groceries", EarnRate: 5, EarnType: "points"},
				{CategorySlug: "everything-else", EarnRate: 1, EarnType: "points"},
			},
		},
	}
	// $3,000/mo groceries = $36k/yr — well past the $20k default annual cap.
	scores, err := NewRecommenderService(repo).Recommend(context.Background(),
		RecommendRequest{MonthlySpend: map[string]float64{"groceries": 3000}})
	if err != nil {
		t.Fatalf("Recommend: %v", err)
	}
	// Guardrail blend: $20k @5x + $16k @1x over $36k = 3.2222x effective.
	//   annual value = 36000 * 3.2222 * (1.0/100) = $1160.
	// The unguarded full-rate bug would give 36000 * 5 * 0.01 = $1800.
	got := scores[0].GrossAnnualValue
	if got < 1159 || got > 1161 {
		t.Fatalf("guardrail-limited gross want ~1160, got %.2f (uncapped bug gives 1800)", got)
	}
	if got >= 1799 {
		t.Fatalf("uncapped bonus was NOT guardrail-limited: gross %.2f (full-rate bug)", got)
	}
	// The accelerated, bound-changing projection must carry the estimate disclosure.
	var noted bool
	for _, c := range scores[0].TopCategories {
		if c.CategorySlug == "groceries" && c.Note != "" {
			noted = true
		}
	}
	if !noted {
		t.Error("expected an 'estimated, capped' disclosure note on the guardrail-limited category")
	}
}

// A flat (non-accelerated) uncapped multiplier — bonus rate == everything-else
// rate — must be UNAFFECTED by the guardrail: the blend is mathematically the
// flat rate, so a legit unlimited card keeps its full value and gets NO
// misleading "capped" note. Mirrors the optimizer's accelerated==false branch.
func TestRecommend_FlatUncappedNotGuardrailLimited(t *testing.T) {
	prog := &model.LoyaltyProgram{Name: "Test", BaseCPP: 1.0}
	repo := &recMockRepo{
		cards: []model.Card{{ID: "c1", Name: "Flat2pct", IsActive: true, LoyaltyProgram: prog}},
		categories: []model.Category{
			{ID: "g", Slug: "groceries", Name: "Groceries"},
			{ID: "e", Slug: "everything-else", Name: "Everything Else"},
		},
		multByCard: map[string][]model.MultiplierRow{
			"c1": {
				// 2% flat everywhere, uncapped — groceries rate == everything-else rate.
				{CategorySlug: "groceries", EarnRate: 2, EarnType: "cashback_pct"},
				{CategorySlug: "everything-else", EarnRate: 2, EarnType: "cashback_pct"},
			},
		},
	}
	// $5,000/mo = $60k/yr, far past the $20k bound — but flat 2% is unbounded-safe.
	scores, err := NewRecommenderService(repo).Recommend(context.Background(),
		RecommendRequest{MonthlySpend: map[string]float64{"groceries": 5000}})
	if err != nil {
		t.Fatalf("Recommend: %v", err)
	}
	// Full flat value preserved: 5000 * 2% * 12 = $1200/yr (no under-promise).
	if got := scores[0].GrossAnnualValue; got < 1199 || got > 1201 {
		t.Fatalf("flat uncapped gross want ~1200 (unaffected by guardrail), got %.2f", got)
	}
	// No "capped/estimate" note should appear for a value the bound didn't change.
	for _, c := range scores[0].TopCategories {
		if c.CategorySlug == "groceries" && c.Note != "" {
			t.Errorf("flat uncapped multiplier must carry no cap note, got %q", c.Note)
		}
	}
}
