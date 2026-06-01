package service

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5"

	"maplerewards/internal/model"
)

// ── Mocks (interface-with-function-fields per .claude/rules/go-tests.md) ──────

type mockSimWallet struct {
	user  *model.User
	cards []model.UserCard
}

func (m *mockSimWallet) GetUserBySession(_ context.Context, _ string) (*model.User, error) {
	return m.user, nil
}
func (m *mockSimWallet) GetUserCards(_ context.Context, _ string) ([]model.UserCard, error) {
	return m.cards, nil
}

type mockSimSpend struct{ stats *model.SpendStats }

func (m *mockSimSpend) GetSpendStats(_ context.Context, _ string) (*model.SpendStats, error) {
	return m.stats, nil
}

// mockSimCard backs a tiny in-memory catalog: cards by id, categories, programs,
// and a per-(cardID,categoryID) multiplier table. ListMultipliersForCard
// synthesises the batched rows the service now consumes (see below), mirroring
// the real CardRepo.
type mockSimCard struct {
	cards      map[string]*model.Card
	categories []model.Category
	programs   []model.LoyaltyProgram
	mults      map[string]map[string]*model.CardMultiplier // cardID → categoryID → mult
	everyElse  map[string]*model.CardMultiplier            // cardID → everything-else mult
}

func (m *mockSimCard) GetCard(_ context.Context, id string) (*model.Card, error) {
	c, ok := m.cards[id]
	if !ok {
		return nil, pgx.ErrNoRows
	}
	return c, nil
}
func (m *mockSimCard) ListCategories(_ context.Context) ([]model.Category, error) {
	return m.categories, nil
}
func (m *mockSimCard) ListPrograms(_ context.Context) ([]model.LoyaltyProgram, error) {
	return m.programs, nil
}

// ListMultipliersForCard synthesises the batched multiplier set (one query per
// card) from the per-(cardID,categoryID) table plus the everything-else map,
// mirroring the real CardRepo. Rows are keyed by category SLUG (the batched
// scorer keys on slug), so we map category id → slug via the catalog.
func (m *mockSimCard) ListMultipliersForCard(_ context.Context, cardID string) ([]model.MultiplierRow, error) {
	slugByCatID := make(map[string]string, len(m.categories))
	for _, c := range m.categories {
		slugByCatID[c.ID] = c.Slug
	}
	var rows []model.MultiplierRow
	for catID, mult := range m.mults[cardID] {
		rows = append(rows, model.MultiplierRow{
			CategorySlug: slugByCatID[catID],
			EarnRate:     mult.EarnRate,
			EarnType:     mult.EarnType,
		})
	}
	if ee, ok := m.everyElse[cardID]; ok {
		rows = append(rows, model.MultiplierRow{
			CategorySlug: "everything-else",
			EarnRate:     ee.EarnRate,
			EarnType:     ee.EarnType,
		})
	}
	return rows, nil
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const (
	catGroceriesID = "cat-groceries"
	catEEID        = "cat-ee"
	progCashID     = "prog-cash"
)

func simCard(id, name string, fee float64) *model.Card {
	return &model.Card{
		ID:               id,
		Name:             name,
		Issuer:           "TestBank",
		LoyaltyProgramID: progCashID,
		AnnualFee:        fee,
		IsActive:         true,
		LoyaltyProgram:   &model.LoyaltyProgram{ID: progCashID, Name: "Cashback", BaseCPP: 100},
	}
}

func cashMult(pct float64) *model.CardMultiplier {
	return &model.CardMultiplier{EarnRate: pct, EarnType: "cashback_pct"}
}

// baseFixtures builds a catalog with a weak base card (1% everywhere) and a
// strong grocery card (4% groceries, 1% else, $120 fee), $10k of logged grocery
// spend, and a held set the caller supplies.
func baseFixtures(held []model.UserCard) (*mockSimWallet, *mockSimSpend, *mockSimCard) {
	base := simCard("c-base", "Base 1% Card", 0)
	groc := simCard("c-groc", "Grocery Hero", 120)

	cards := &mockSimCard{
		cards: map[string]*model.Card{"c-base": base, "c-groc": groc},
		categories: []model.Category{
			{ID: catGroceriesID, Name: "Groceries", Slug: "groceries"},
			{ID: catEEID, Name: "Everything Else", Slug: "everything-else"},
		},
		programs: []model.LoyaltyProgram{{ID: progCashID, Name: "Cashback", BaseCPP: 100}},
		mults: map[string]map[string]*model.CardMultiplier{
			"c-base": {catGroceriesID: cashMult(1)},
			"c-groc": {catGroceriesID: cashMult(4)},
		},
		everyElse: map[string]*model.CardMultiplier{
			"c-base": cashMult(1),
			"c-groc": cashMult(1),
		},
	}

	wallet := &mockSimWallet{user: &model.User{ID: "u1"}, cards: held}
	spend := &mockSimSpend{stats: &model.SpendStats{
		TotalSpend: 10000,
		ByCategory: []model.CategoryStat{
			{CategoryName: "Groceries", TotalSpend: 10000},
		},
	}}
	return wallet, spend, cards
}

func heldCard(c *model.Card) model.UserCard {
	return model.UserCard{CardID: c.ID, Card: c}
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// Adding a strong grocery card to a wallet that only holds a 1% card should
// raise grocery value (100 → 400), set fee_delta to the new card's fee, and
// produce the correct net-after-fees delta.
func TestSimulator_AddStrongGroceryCard(t *testing.T) {
	base := simCard("c-base", "Base 1% Card", 0)
	wallet, spend, cards := baseFixtures([]model.UserCard{heldCard(base)})
	svc := NewSimulatorService(wallet, spend, cards)

	res, err := svc.Simulate(context.Background(), "sess", []string{"c-groc"}, nil)
	if err != nil {
		t.Fatalf("simulate: %v", err)
	}

	if res.BaselineAnnualValue != 100 {
		t.Errorf("baseline: got %.2f want 100 (10k groceries @ 1%%)", res.BaselineAnnualValue)
	}
	if res.SimulatedAnnualValue != 400 {
		t.Errorf("simulated: got %.2f want 400 (10k groceries @ 4%%)", res.SimulatedAnnualValue)
	}
	if res.ValueDeltaCAD != 300 {
		t.Errorf("value_delta: got %.2f want 300", res.ValueDeltaCAD)
	}
	if res.FeeDeltaCAD != 120 {
		t.Errorf("fee_delta: got %.2f want 120", res.FeeDeltaCAD)
	}
	if res.NetDeltaAfterFeesCAD != 180 {
		t.Errorf("net_delta_after_fees: got %.2f want 180 (300 value − 120 fee)", res.NetDeltaAfterFeesCAD)
	}

	if len(res.Added) != 1 || res.Added[0].CardID != "c-groc" {
		t.Fatalf("expected c-groc echoed in added, got %+v", res.Added)
	}
	if len(res.CategoryChanges) != 1 {
		t.Fatalf("expected 1 category change, got %d (%+v)", len(res.CategoryChanges), res.CategoryChanges)
	}
	cc := res.CategoryChanges[0]
	if cc.BeforeCard != "Base 1% Card" || cc.AfterCard != "Grocery Hero" {
		t.Errorf("category change cards: before=%q after=%q", cc.BeforeCard, cc.AfterCard)
	}
	if cc.DeltaCAD != 300 {
		t.Errorf("category change delta: got %.2f want 300", cc.DeltaCAD)
	}
	if res.Note == "" {
		t.Errorf("expected a non-empty estimate note")
	}
}

// Dropping the strong grocery card from a wallet that holds both cards should
// lower simulated value back to the base card's rate and credit the dropped
// fee (negative fee_delta).
func TestSimulator_DropCardLowersValue(t *testing.T) {
	base := simCard("c-base", "Base 1% Card", 0)
	groc := simCard("c-groc", "Grocery Hero", 120)
	wallet, spend, cards := baseFixtures([]model.UserCard{heldCard(base), heldCard(groc)})
	svc := NewSimulatorService(wallet, spend, cards)

	res, err := svc.Simulate(context.Background(), "sess", nil, []string{"c-groc"})
	if err != nil {
		t.Fatalf("simulate: %v", err)
	}

	if res.BaselineAnnualValue != 400 {
		t.Errorf("baseline: got %.2f want 400 (grocery card present)", res.BaselineAnnualValue)
	}
	if res.SimulatedAnnualValue != 100 {
		t.Errorf("simulated: got %.2f want 100 (back to 1%% base)", res.SimulatedAnnualValue)
	}
	if res.ValueDeltaCAD != -300 {
		t.Errorf("value_delta: got %.2f want -300", res.ValueDeltaCAD)
	}
	// Dropped a $120 card, added none → fee_delta = 0 − 120 = -120.
	if res.FeeDeltaCAD != -120 {
		t.Errorf("fee_delta: got %.2f want -120 (dropped a $120 card)", res.FeeDeltaCAD)
	}
	// net = value_delta − fee_delta = -300 − (-120) = -180.
	if res.NetDeltaAfterFeesCAD != -180 {
		t.Errorf("net_delta_after_fees: got %.2f want -180", res.NetDeltaAfterFeesCAD)
	}
	if len(res.Dropped) != 1 || res.Dropped[0].CardID != "c-groc" {
		t.Fatalf("expected c-groc echoed in dropped, got %+v", res.Dropped)
	}
}

// fee_delta must net added fees against dropped fees: add the $120 grocery card
// and drop the $0 base card simultaneously.
func TestSimulator_FeeDeltaNetsAddAndDrop(t *testing.T) {
	base := simCard("c-base", "Base 1% Card", 0)
	wallet, spend, cards := baseFixtures([]model.UserCard{heldCard(base)})
	svc := NewSimulatorService(wallet, spend, cards)

	res, err := svc.Simulate(context.Background(), "sess", []string{"c-groc"}, []string{"c-base"})
	if err != nil {
		t.Fatalf("simulate: %v", err)
	}
	// Added $120, dropped $0 → fee_delta = 120 − 0 = 120.
	if res.FeeDeltaCAD != 120 {
		t.Errorf("fee_delta: got %.2f want 120 (added $120, dropped $0)", res.FeeDeltaCAD)
	}
	// Simulated wallet = only the grocery card → 10k @ 4% = 400.
	if res.SimulatedAnnualValue != 400 {
		t.Errorf("simulated: got %.2f want 400", res.SimulatedAnnualValue)
	}
	if len(res.Added) != 1 || len(res.Dropped) != 1 {
		t.Errorf("expected 1 add + 1 drop echoed, got added=%d dropped=%d", len(res.Added), len(res.Dropped))
	}
}

// Adding a card the user already holds is a flagged no-op: it must appear in
// ignored_already_held, NOT in added, and must not change value or fees.
func TestSimulator_AddAlreadyHeldFlagged(t *testing.T) {
	base := simCard("c-base", "Base 1% Card", 0)
	groc := simCard("c-groc", "Grocery Hero", 120)
	wallet, spend, cards := baseFixtures([]model.UserCard{heldCard(base), heldCard(groc)})
	svc := NewSimulatorService(wallet, spend, cards)

	res, err := svc.Simulate(context.Background(), "sess", []string{"c-groc"}, nil)
	if err != nil {
		t.Fatalf("simulate: %v", err)
	}

	if len(res.Added) != 0 {
		t.Errorf("expected no real adds, got %+v", res.Added)
	}
	if len(res.IgnoredAlreadyHeld) != 1 || res.IgnoredAlreadyHeld[0] != "c-groc" {
		t.Fatalf("expected c-groc in ignored_already_held, got %+v", res.IgnoredAlreadyHeld)
	}
	// Wallet unchanged → no value or fee movement.
	if res.ValueDeltaCAD != 0 || res.FeeDeltaCAD != 0 || res.NetDeltaAfterFeesCAD != 0 {
		t.Errorf("expected zero deltas for a held-card add, got value=%.2f fee=%.2f net=%.2f",
			res.ValueDeltaCAD, res.FeeDeltaCAD, res.NetDeltaAfterFeesCAD)
	}
	if len(res.CategoryChanges) != 0 {
		t.Errorf("expected no category changes, got %+v", res.CategoryChanges)
	}
}

// Dropping a card the user does not hold is a flagged no-op, and the array
// bound is enforced.
func TestSimulator_DropNotHeldAndBounds(t *testing.T) {
	base := simCard("c-base", "Base 1% Card", 0)
	wallet, spend, cards := baseFixtures([]model.UserCard{heldCard(base)})
	svc := NewSimulatorService(wallet, spend, cards)

	res, err := svc.Simulate(context.Background(), "sess", nil, []string{"c-groc"})
	if err != nil {
		t.Fatalf("simulate: %v", err)
	}
	if len(res.IgnoredNotHeld) != 1 || res.IgnoredNotHeld[0] != "c-groc" {
		t.Fatalf("expected c-groc in ignored_not_held, got %+v", res.IgnoredNotHeld)
	}
	if len(res.Dropped) != 0 {
		t.Errorf("expected no real drops, got %+v", res.Dropped)
	}

	// Bound: 11 add ids must be rejected.
	tooMany := make([]string, simulatorMaxCards+1)
	for i := range tooMany {
		tooMany[i] = "id-" + string(rune('a'+i))
	}
	if _, err := svc.Simulate(context.Background(), "sess", tooMany, nil); err == nil {
		t.Errorf("expected error when add_card_ids exceeds %d", simulatorMaxCards)
	}
}
