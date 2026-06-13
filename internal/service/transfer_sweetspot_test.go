package service

import (
	"context"
	"testing"
	"time"

	"maplerewards/internal/model"
	"maplerewards/internal/repo"
)

type mockSSWallet struct {
	user  *model.User
	cards []model.UserCard
}

func (m *mockSSWallet) GetUserBySession(_ context.Context, _ string) (*model.User, error) {
	return m.user, nil
}
func (m *mockSSWallet) GetUserCards(_ context.Context, _ string) ([]model.UserCard, error) {
	return m.cards, nil
}

type mockSSLoyalty struct{ accounts []model.LoyaltyAccount }

func (m *mockSSLoyalty) ListByUser(_ context.Context, _ string) ([]model.LoyaltyAccount, error) {
	return m.accounts, nil
}

type mockSSProgram struct{ programs []model.LoyaltyProgram }

func (m *mockSSProgram) ListPrograms(_ context.Context) ([]model.LoyaltyProgram, error) {
	return m.programs, nil
}

// mockSSTransfer returns routes keyed by source program id.
type mockSSTransfer struct{ routes map[string][]model.TransferPartner }

func (m *mockSSTransfer) GetTransferRoutes(_ context.Context, fromProgramID string) ([]model.TransferPartner, error) {
	return m.routes[fromProgramID], nil
}

func ssProgram(id, slug, name string, cpp float64) model.LoyaltyProgram {
	return model.LoyaltyProgram{ID: id, Slug: slug, Name: name, BaseCPP: cpp}
}

func ssUCard(programID, slug, name string, cpp float64, balance int64) model.UserCard {
	return model.UserCard{
		PointBalance: balance,
		Card: &model.Card{
			LoyaltyProgramID: programID,
			LoyaltyProgram:   &model.LoyaltyProgram{ID: programID, Slug: slug, Name: name, BaseCPP: cpp},
		},
	}
}

func ssRoute(fromID, toID, toSlug, toName string, toCPP, ratio float64, minTransfer int) model.TransferPartner {
	return model.TransferPartner{
		FromProgramID:   fromID,
		ToProgramID:     toID,
		TransferRatio:   ratio,
		MinimumTransfer: minTransfer,
		IsActive:        true,
		ToProgram:       &model.LoyaltyProgram{ID: toID, Slug: toSlug, Name: toName, BaseCPP: toCPP},
	}
}

// A bank program at 1.0 cpp transferring 1:1 into an airline at 2.0 cpp doubles
// value: that edge must surface as best_transfer with positive uplift.
func TestTransferSweetSpot_PositiveUpliftSurfacedAsBest(t *testing.T) {
	wallet := &mockSSWallet{
		user:  &model.User{ID: "u1"},
		cards: []model.UserCard{ssUCard("bank", "amex-mr-canada", "Amex MR", 1.0, 100_000)},
	}
	transfer := &mockSSTransfer{routes: map[string][]model.TransferPartner{
		"bank": {ssRoute("bank", "air", "aeroplan", "Aeroplan", 2.0, 1.0, 1000)},
	}}
	svc := NewTransferSweetSpotService(wallet, &mockSSLoyalty{}, &mockSSProgram{}, transfer)

	rep, err := svc.Find(context.Background(), "sess")
	if err != nil {
		t.Fatalf("find: %v", err)
	}
	if len(rep.Sources) != 1 {
		t.Fatalf("expected 1 source program, got %d", len(rep.Sources))
	}
	src := rep.Sources[0]
	if src.KeepValueCAD != 1000 { // 100k * 1.0 / 100
		t.Errorf("keep value: got %.2f want 1000", src.KeepValueCAD)
	}
	if src.BestTransfer == nil {
		t.Fatalf("expected a best transfer, got nil")
	}
	if src.BestTransfer.ToProgramSlug != "aeroplan" {
		t.Errorf("best to-program: got %q want aeroplan", src.BestTransfer.ToProgramSlug)
	}
	if src.BestTransfer.TransferValueCAD != 2000 { // 100k * 1.0 ratio -> 100k * 2.0 / 100
		t.Errorf("transfer value: got %.2f want 2000", src.BestTransfer.TransferValueCAD)
	}
	if src.BestTransfer.UpliftCAD != 1000 {
		t.Errorf("uplift: got %.2f want 1000", src.BestTransfer.UpliftCAD)
	}
	if !src.BestTransfer.Eligible {
		t.Errorf("expected eligible (100k >= 1000 min)")
	}
	if rep.TotalPotentialUpliftCAD != 1000 {
		t.Errorf("total potential uplift: got %.2f want 1000", rep.TotalPotentialUpliftCAD)
	}
	if rep.Note == "" {
		t.Errorf("expected a directional-estimate note")
	}
}

// Below the partner's minimum_transfer: the edge is still listed (transparency)
// but flagged not-eligible and NOT chosen as best, so there's no sweet spot.
func TestTransferSweetSpot_BelowMinimumFlaggedNotEligible(t *testing.T) {
	wallet := &mockSSWallet{
		user:  &model.User{ID: "u1"},
		cards: []model.UserCard{ssUCard("bank", "amex-mr-canada", "Amex MR", 1.0, 500)},
	}
	transfer := &mockSSTransfer{routes: map[string][]model.TransferPartner{
		"bank": {ssRoute("bank", "air", "aeroplan", "Aeroplan", 2.0, 1.0, 1000)}, // min 1000 > 500 held
	}}
	svc := NewTransferSweetSpotService(wallet, &mockSSLoyalty{}, &mockSSProgram{}, transfer)

	rep, err := svc.Find(context.Background(), "sess")
	if err != nil {
		t.Fatalf("find: %v", err)
	}
	if len(rep.Sources) != 1 {
		t.Fatalf("expected 1 source, got %d", len(rep.Sources))
	}
	src := rep.Sources[0]
	if len(src.AllTransfers) != 1 {
		t.Fatalf("expected the edge listed for transparency, got %d", len(src.AllTransfers))
	}
	if src.AllTransfers[0].Eligible {
		t.Errorf("expected edge flagged not-eligible (500 < 1000 min)")
	}
	if src.BestTransfer != nil {
		t.Errorf("expected no best transfer (below minimum), got %+v", *src.BestTransfer)
	}
	if rep.TotalPotentialUpliftCAD != 0 {
		t.Errorf("total uplift should be 0 with no eligible move, got %.2f", rep.TotalPotentialUpliftCAD)
	}
}

// A program with points but NO transfer partners must be excluded entirely.
func TestTransferSweetSpot_ProgramWithNoPartnersExcluded(t *testing.T) {
	wallet := &mockSSWallet{
		user: &model.User{ID: "u1"},
		cards: []model.UserCard{
			ssUCard("bank", "amex-mr-canada", "Amex MR", 1.0, 100_000),
			ssUCard("orphan", "scene-plus", "Scene+", 1.0, 50_000), // no routes
		},
	}
	transfer := &mockSSTransfer{routes: map[string][]model.TransferPartner{
		"bank": {ssRoute("bank", "air", "aeroplan", "Aeroplan", 2.0, 1.0, 1000)},
		// "orphan" intentionally absent → GetTransferRoutes returns nil
	}}
	svc := NewTransferSweetSpotService(wallet, &mockSSLoyalty{}, &mockSSProgram{}, transfer)

	rep, err := svc.Find(context.Background(), "sess")
	if err != nil {
		t.Fatalf("find: %v", err)
	}
	if len(rep.Sources) != 1 {
		t.Fatalf("expected only the program with partners, got %d sources", len(rep.Sources))
	}
	if rep.Sources[0].ProgramSlug != "amex-mr-canada" {
		t.Errorf("got %q, expected the partnered program amex-mr-canada", rep.Sources[0].ProgramSlug)
	}
}

// When keeping points is worth more than transferring (source CPP > dest after
// ratio), the edge is listed but uplift is negative → no best transfer surfaced.
func TestTransferSweetSpot_KeepBeatsTransferNoSweetSpot(t *testing.T) {
	wallet := &mockSSWallet{
		user:  &model.User{ID: "u1"},
		cards: []model.UserCard{ssUCard("rich", "rich-bank", "Rich Bank", 2.0, 100_000)},
	}
	transfer := &mockSSTransfer{routes: map[string][]model.TransferPartner{
		// dest worth 1.0 cpp at 1:1 ⇒ value halves vs keeping at 2.0 cpp.
		"rich": {ssRoute("rich", "weak", "weak-prog", "Weak Program", 1.0, 1.0, 1000)},
	}}
	svc := NewTransferSweetSpotService(wallet, &mockSSLoyalty{}, &mockSSProgram{}, transfer)

	rep, err := svc.Find(context.Background(), "sess")
	if err != nil {
		t.Fatalf("find: %v", err)
	}
	if len(rep.Sources) != 1 {
		t.Fatalf("expected 1 source, got %d", len(rep.Sources))
	}
	src := rep.Sources[0]
	if src.BestTransfer != nil {
		t.Errorf("expected no sweet spot when keep beats transfer, got %+v", *src.BestTransfer)
	}
	if len(src.AllTransfers) != 1 || src.AllTransfers[0].UpliftCAD >= 0 {
		t.Errorf("expected the negative-uplift edge listed, got %+v", src.AllTransfers)
	}
	if rep.TotalPotentialUpliftCAD != 0 {
		t.Errorf("total uplift should be 0, got %.2f", rep.TotalPotentialUpliftCAD)
	}
}

// loyalty_accounts (keyed by program_slug) must aggregate with card balances of
// the same program before the transfer math runs.
func TestTransferSweetSpot_AggregatesCardsAndLoyaltyAccounts(t *testing.T) {
	wallet := &mockSSWallet{
		user:  &model.User{ID: "u1"},
		cards: []model.UserCard{ssUCard("bank", "amex-mr-canada", "Amex MR", 1.0, 60_000)},
	}
	loyalty := &mockSSLoyalty{accounts: []model.LoyaltyAccount{
		{ProgramSlug: "amex-mr-canada", Balance: 40_000},
	}}
	programs := &mockSSProgram{programs: []model.LoyaltyProgram{
		ssProgram("bank", "amex-mr-canada", "Amex MR", 1.0),
	}}
	transfer := &mockSSTransfer{routes: map[string][]model.TransferPartner{
		"bank": {ssRoute("bank", "air", "aeroplan", "Aeroplan", 2.0, 1.0, 1000)},
	}}
	svc := NewTransferSweetSpotService(wallet, loyalty, programs, transfer)

	rep, err := svc.Find(context.Background(), "sess")
	if err != nil {
		t.Fatalf("find: %v", err)
	}
	if len(rep.Sources) != 1 {
		t.Fatalf("expected 1 source, got %d", len(rep.Sources))
	}
	if got := rep.Sources[0].Points; got != 100_000 { // 60k card + 40k account
		t.Errorf("aggregated points: got %d want 100000", got)
	}
}

// mockSSBonus returns an active bonus keyed by "from→to" slug pair, matching the
// ActiveBonusForRoute read on transfer_bonus_events.
type mockSSBonus struct {
	byRoute map[string]*repo.TransferBonusEvent
	err     error
}

func (m *mockSSBonus) ActiveBonusForRoute(_ context.Context, fromSlug, toSlug string) (*repo.TransferBonusEvent, error) {
	if m.err != nil {
		return nil, m.err
	}
	return m.byRoute[fromSlug+"→"+toSlug], nil
}

// A live +30% bonus on MR→Aeroplan must fold into the effective ratio: 100k MR
// at 1:1 base becomes 130k Aeroplan, and the option must carry the BONUS LIVE
// label + expiry so the UI can flip the keep/transfer call.
func TestTransferSweetSpot_LiveBonusBoostsRatioAndLabels(t *testing.T) {
	wallet := &mockSSWallet{
		user:  &model.User{ID: "u1"},
		cards: []model.UserCard{ssUCard("bank", "amex-mr-canada", "Amex MR", 1.0, 100_000)},
	}
	transfer := &mockSSTransfer{routes: map[string][]model.TransferPartner{
		"bank": {ssRoute("bank", "air", "aeroplan", "Aeroplan", 2.0, 1.0, 1000)},
	}}
	exp := time.Date(2026, 7, 15, 0, 0, 0, 0, time.UTC)
	bonus := &mockSSBonus{byRoute: map[string]*repo.TransferBonusEvent{
		"amex-mr-canada→aeroplan": {BonusPercent: 30, ExpiresAt: &exp},
	}}
	svc := NewTransferSweetSpotService(wallet, &mockSSLoyalty{}, &mockSSProgram{}, transfer).WithBonusRepo(bonus)

	rep, err := svc.Find(context.Background(), "sess")
	if err != nil {
		t.Fatalf("find: %v", err)
	}
	if len(rep.Sources) != 1 || rep.Sources[0].BestTransfer == nil {
		t.Fatalf("expected one source with a best transfer, got %+v", rep.Sources)
	}
	best := rep.Sources[0].BestTransfer
	if best.BonusPercent != 30 {
		t.Errorf("bonus percent: got %g want 30", best.BonusPercent)
	}
	if best.EffectiveRatio != 1.3 { // 1.0 * (1 + 0.30)
		t.Errorf("effective ratio: got %g want 1.3", best.EffectiveRatio)
	}
	if best.TransferredPoints != 130_000 { // floor(100k * 1.3)
		t.Errorf("transferred points: got %d want 130000", best.TransferredPoints)
	}
	if best.TransferValueCAD != 2600 { // 130k * 2.0 / 100
		t.Errorf("transfer value: got %.2f want 2600", best.TransferValueCAD)
	}
	if best.UpliftCAD != 1600 { // 2600 - 1000 keep
		t.Errorf("uplift: got %.2f want 1600", best.UpliftCAD)
	}
	if best.BonusLabel != "BONUS LIVE: +30% through 2026-07-15" {
		t.Errorf("bonus label: got %q", best.BonusLabel)
	}
	if best.BonusExpiresAt != "2026-07-15" {
		t.Errorf("bonus expiry: got %q want 2026-07-15", best.BonusExpiresAt)
	}
}

// No live bonus on the route ⇒ effective ratio stays at base and no bonus
// fields are populated (identical to the pre-wiring behavior).
func TestTransferSweetSpot_NoBonusLeavesBaseRatio(t *testing.T) {
	wallet := &mockSSWallet{
		user:  &model.User{ID: "u1"},
		cards: []model.UserCard{ssUCard("bank", "amex-mr-canada", "Amex MR", 1.0, 100_000)},
	}
	transfer := &mockSSTransfer{routes: map[string][]model.TransferPartner{
		"bank": {ssRoute("bank", "air", "aeroplan", "Aeroplan", 2.0, 1.0, 1000)},
	}}
	bonus := &mockSSBonus{byRoute: map[string]*repo.TransferBonusEvent{}} // route absent
	svc := NewTransferSweetSpotService(wallet, &mockSSLoyalty{}, &mockSSProgram{}, transfer).WithBonusRepo(bonus)

	rep, err := svc.Find(context.Background(), "sess")
	if err != nil {
		t.Fatalf("find: %v", err)
	}
	best := rep.Sources[0].BestTransfer
	if best == nil {
		t.Fatalf("expected a best transfer")
	}
	if best.BonusPercent != 0 || best.BonusLabel != "" || best.EffectiveRatio != 0 {
		t.Errorf("expected no bonus fields, got %+v", *best)
	}
	if best.TransferredPoints != 100_000 || best.TransferValueCAD != 2000 {
		t.Errorf("base-ratio math changed: got %d pts, $%.2f", best.TransferredPoints, best.TransferValueCAD)
	}
}
