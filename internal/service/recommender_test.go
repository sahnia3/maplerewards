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
