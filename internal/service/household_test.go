package service

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5"

	"maplerewards/internal/model"
)

// ── Mocks (interface-with-function-fields per .claude/rules/go-tests.md) ──────

type mockHHWallet struct {
	user  *model.User
	cards []model.UserCard
}

func (m *mockHHWallet) GetUserBySession(_ context.Context, _ string) (*model.User, error) {
	return m.user, nil
}
func (m *mockHHWallet) GetUserCards(_ context.Context, _ string) ([]model.UserCard, error) {
	return m.cards, nil
}

type mockHHSpend struct{ stats *model.SpendStats }

func (m *mockHHSpend) GetSpendStats(_ context.Context, _ string) (*model.SpendStats, error) {
	return m.stats, nil
}

// mockHHCard backs a tiny in-memory catalog: cards by id, categories, programs,
// and a per-(cardID,categoryID) multiplier table. Missing category multiplier →
// pgx.ErrNoRows (so the service falls back to everything-else), mirroring the
// real CardRepo.
type mockHHCard struct {
	cards      map[string]*model.Card
	categories []model.Category
	programs   []model.LoyaltyProgram
	mults      map[string]map[string]*model.CardMultiplier // cardID → categoryID → mult
	everyElse  map[string]*model.CardMultiplier            // cardID → everything-else mult
}

func (m *mockHHCard) GetCard(_ context.Context, id string) (*model.Card, error) {
	c, ok := m.cards[id]
	if !ok {
		return nil, pgx.ErrNoRows
	}
	return c, nil
}
func (m *mockHHCard) ListCategories(_ context.Context) ([]model.Category, error) {
	return m.categories, nil
}
func (m *mockHHCard) ListPrograms(_ context.Context) ([]model.LoyaltyProgram, error) {
	return m.programs, nil
}
func (m *mockHHCard) GetMultiplierForCard(_ context.Context, cardID, categoryID string) (*model.CardMultiplier, error) {
	if byCat, ok := m.mults[cardID]; ok {
		if mult, ok := byCat[categoryID]; ok {
			return mult, nil
		}
	}
	return nil, pgx.ErrNoRows
}
func (m *mockHHCard) GetEverythingElseMultiplier(_ context.Context, cardID string) (*model.CardMultiplier, error) {
	if mult, ok := m.everyElse[cardID]; ok {
		return mult, nil
	}
	return &model.CardMultiplier{EarnRate: 1.0, EarnType: "points", FallbackEarnRate: 1.0}, nil
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const (
	hhCatGroceriesID = "cat-groceries"
	hhCatGasID       = "cat-gas"
	hhProgCashID     = "prog-cash"
)

func hhCard(id, name string, fee float64) *model.Card {
	return &model.Card{
		ID:               id,
		Name:             name,
		Issuer:           "TestBank",
		LoyaltyProgramID: hhProgCashID,
		AnnualFee:        fee,
		IsActive:         true,
		LoyaltyProgram:   &model.LoyaltyProgram{ID: hhProgCashID, Name: "Cashback", BaseCPP: 100},
	}
}

func hhCashMult(pct float64) *model.CardMultiplier {
	return &model.CardMultiplier{EarnRate: pct, EarnType: "cashback_pct"}
}

func hhHeldCard(c *model.Card) model.UserCard {
	return model.UserCard{CardID: c.ID, Card: c}
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// A partner's strong grocery card (4%) should win the Groceries category over
// the user's weak 1% card, and be tagged owner "partner".
func TestHousehold_PartnerCardBecomesBestForCategory(t *testing.T) {
	youBase := hhCard("c-you-base", "Your Base 1% Card", 0)          // 1% groceries
	partnerGroc := hhCard("c-prt-groc", "Partner Grocery Hero", 120) // 4% groceries

	cards := &mockHHCard{
		cards: map[string]*model.Card{
			"c-you-base": youBase,
			"c-prt-groc": partnerGroc,
		},
		categories: []model.Category{
			{ID: hhCatGroceriesID, Name: "Groceries", Slug: "groceries"},
		},
		programs: []model.LoyaltyProgram{{ID: hhProgCashID, Name: "Cashback", BaseCPP: 100}},
		mults: map[string]map[string]*model.CardMultiplier{
			"c-you-base": {hhCatGroceriesID: hhCashMult(1)},
			"c-prt-groc": {hhCatGroceriesID: hhCashMult(4)},
		},
		everyElse: map[string]*model.CardMultiplier{
			"c-you-base": hhCashMult(1),
			"c-prt-groc": hhCashMult(1),
		},
	}
	wallet := &mockHHWallet{user: &model.User{ID: "u1"}, cards: []model.UserCard{hhHeldCard(youBase)}}
	spend := &mockHHSpend{stats: &model.SpendStats{
		TotalSpend: 10000,
		ByCategory: []model.CategoryStat{{CategoryName: "Groceries", TotalSpend: 10000}},
	}}
	svc := NewHouseholdService(wallet, spend, cards)

	res, err := svc.Analyze(context.Background(), "sess", []string{"c-prt-groc"})
	if err != nil {
		t.Fatalf("analyze: %v", err)
	}

	if res.YouCardCount != 1 || res.PartnerCardCount != 1 {
		t.Errorf("card counts: you=%d partner=%d want 1/1", res.YouCardCount, res.PartnerCardCount)
	}
	if len(res.CategoryCoverage) != 1 {
		t.Fatalf("expected 1 covered category, got %d (%+v)", len(res.CategoryCoverage), res.CategoryCoverage)
	}
	cov := res.CategoryCoverage[0]
	if cov.BestCardID != "c-prt-groc" {
		t.Errorf("best card: got %q want c-prt-groc", cov.BestCardID)
	}
	if cov.Owner != "partner" {
		t.Errorf("owner: got %q want partner", cov.Owner)
	}
	if cov.EffectiveValue != 400 {
		t.Errorf("effective value: got %.2f want 400 (10k @ 4%%)", cov.EffectiveValue)
	}
	if res.Note == "" {
		t.Errorf("expected a non-empty estimate note")
	}
}

// A duplicate, lower-value fee-carrying card that wins nothing must be flagged
// as a cancel candidate with its fee surfaced as the saving — and the partner's
// stronger card that DOES win Groceries must NOT be flagged (sole best).
func TestHousehold_DuplicateLowValueCardFlaggedRedundant(t *testing.T) {
	youGroc := hhCard("c-you-groc", "Your Grocery 4%", 0)        // 4% groceries, sole best
	youDup := hhCard("c-you-dup", "Your Redundant 1% (fee)", 90) // 1% everywhere, fee, wins nothing
	partnerGas := hhCard("c-prt-gas", "Partner Gas 5%", 60)      // 5% gas, sole best for gas

	cards := &mockHHCard{
		cards: map[string]*model.Card{
			"c-you-groc": youGroc,
			"c-you-dup":  youDup,
			"c-prt-gas":  partnerGas,
		},
		categories: []model.Category{
			{ID: hhCatGroceriesID, Name: "Groceries", Slug: "groceries"},
			{ID: hhCatGasID, Name: "Gas", Slug: "gas"},
		},
		programs: []model.LoyaltyProgram{{ID: hhProgCashID, Name: "Cashback", BaseCPP: 100}},
		mults: map[string]map[string]*model.CardMultiplier{
			"c-you-groc": {hhCatGroceriesID: hhCashMult(4), hhCatGasID: hhCashMult(1)},
			"c-you-dup":  {hhCatGroceriesID: hhCashMult(1), hhCatGasID: hhCashMult(1)},
			"c-prt-gas":  {hhCatGroceriesID: hhCashMult(1), hhCatGasID: hhCashMult(5)},
		},
		everyElse: map[string]*model.CardMultiplier{
			"c-you-groc": hhCashMult(1),
			"c-you-dup":  hhCashMult(1),
			"c-prt-gas":  hhCashMult(1),
		},
	}
	wallet := &mockHHWallet{user: &model.User{ID: "u1"}, cards: []model.UserCard{
		hhHeldCard(youGroc), hhHeldCard(youDup),
	}}
	spend := &mockHHSpend{stats: &model.SpendStats{
		TotalSpend: 16000,
		ByCategory: []model.CategoryStat{
			{CategoryName: "Groceries", TotalSpend: 10000},
			{CategoryName: "Gas", TotalSpend: 6000},
		},
	}}
	svc := NewHouseholdService(wallet, spend, cards)

	res, err := svc.Analyze(context.Background(), "sess", []string{"c-prt-gas"})
	if err != nil {
		t.Fatalf("analyze: %v", err)
	}

	// Exactly the redundant fee card should be a cancel candidate.
	if len(res.CancelCandidates) != 1 {
		t.Fatalf("expected 1 cancel candidate, got %d (%+v)", len(res.CancelCandidates), res.CancelCandidates)
	}
	cc := res.CancelCandidates[0]
	if cc.CardID != "c-you-dup" {
		t.Errorf("cancel candidate: got %q want c-you-dup", cc.CardID)
	}
	if cc.Owner != "you" {
		t.Errorf("cancel candidate owner: got %q want you", cc.Owner)
	}
	if cc.AnnualFee != 90 {
		t.Errorf("cancel candidate fee: got %.2f want 90", cc.AnnualFee)
	}
	if res.TotalFeeSavingsOpportunityCAD != 90 {
		t.Errorf("total fee savings: got %.2f want 90", res.TotalFeeSavingsOpportunityCAD)
	}

	// The sole-best cards (your grocery card, partner's gas card) must NOT be
	// flagged even though the partner's gas card also carries a fee.
	for _, c := range res.CancelCandidates {
		if c.CardID == "c-you-groc" || c.CardID == "c-prt-gas" {
			t.Errorf("sole-best card %q was wrongly flagged redundant", c.CardID)
		}
	}
}

// A fee-carrying card that is the sole best for a category the user spends in
// must never be a cancel candidate, even when it's the only fee card present.
func TestHousehold_SoleBestCardNotFlagged(t *testing.T) {
	youGroc := hhCard("c-you-groc", "Your Grocery Hero", 120) // 4% groceries, fee, sole best
	partnerBase := hhCard("c-prt-base", "Partner Base 1%", 0) // 1% everywhere, no fee

	cards := &mockHHCard{
		cards: map[string]*model.Card{
			"c-you-groc": youGroc,
			"c-prt-base": partnerBase,
		},
		categories: []model.Category{
			{ID: hhCatGroceriesID, Name: "Groceries", Slug: "groceries"},
		},
		programs: []model.LoyaltyProgram{{ID: hhProgCashID, Name: "Cashback", BaseCPP: 100}},
		mults: map[string]map[string]*model.CardMultiplier{
			"c-you-groc": {hhCatGroceriesID: hhCashMult(4)},
			"c-prt-base": {hhCatGroceriesID: hhCashMult(1)},
		},
		everyElse: map[string]*model.CardMultiplier{
			"c-you-groc": hhCashMult(1),
			"c-prt-base": hhCashMult(1),
		},
	}
	wallet := &mockHHWallet{user: &model.User{ID: "u1"}, cards: []model.UserCard{hhHeldCard(youGroc)}}
	spend := &mockHHSpend{stats: &model.SpendStats{
		TotalSpend: 10000,
		ByCategory: []model.CategoryStat{{CategoryName: "Groceries", TotalSpend: 10000}},
	}}
	svc := NewHouseholdService(wallet, spend, cards)

	res, err := svc.Analyze(context.Background(), "sess", []string{"c-prt-base"})
	if err != nil {
		t.Fatalf("analyze: %v", err)
	}

	if len(res.CancelCandidates) != 0 {
		t.Fatalf("expected no cancel candidates (the only fee card is sole best), got %+v", res.CancelCandidates)
	}
	if res.TotalFeeSavingsOpportunityCAD != 0 {
		t.Errorf("total fee savings: got %.2f want 0", res.TotalFeeSavingsOpportunityCAD)
	}
	if len(res.CategoryCoverage) != 1 || res.CategoryCoverage[0].BestCardID != "c-you-groc" {
		t.Fatalf("expected your grocery card to cover Groceries, got %+v", res.CategoryCoverage)
	}
	if res.CategoryCoverage[0].Owner != "you" {
		t.Errorf("owner: got %q want you", res.CategoryCoverage[0].Owner)
	}
}

// The partner-card array bound must be enforced.
func TestHousehold_PartnerBoundEnforced(t *testing.T) {
	youBase := hhCard("c-you-base", "Your Base 1% Card", 0)
	cards := &mockHHCard{
		cards:      map[string]*model.Card{"c-you-base": youBase},
		categories: []model.Category{{ID: hhCatGroceriesID, Name: "Groceries", Slug: "groceries"}},
		programs:   []model.LoyaltyProgram{{ID: hhProgCashID, Name: "Cashback", BaseCPP: 100}},
		mults:      map[string]map[string]*model.CardMultiplier{"c-you-base": {hhCatGroceriesID: hhCashMult(1)}},
		everyElse:  map[string]*model.CardMultiplier{"c-you-base": hhCashMult(1)},
	}
	wallet := &mockHHWallet{user: &model.User{ID: "u1"}, cards: []model.UserCard{hhHeldCard(youBase)}}
	spend := &mockHHSpend{stats: &model.SpendStats{
		TotalSpend: 10000,
		ByCategory: []model.CategoryStat{{CategoryName: "Groceries", TotalSpend: 10000}},
	}}
	svc := NewHouseholdService(wallet, spend, cards)

	tooMany := make([]string, householdMaxPartnerCards+1)
	for i := range tooMany {
		tooMany[i] = "id-" + string(rune('a'+i))
	}
	if _, err := svc.Analyze(context.Background(), "sess", tooMany); err == nil {
		t.Errorf("expected error when partner_card_ids exceeds %d", householdMaxPartnerCards)
	}
}
