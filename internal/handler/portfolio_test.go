package handler

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"maplerewards/internal/model"
	"maplerewards/internal/repo"
)

// portfolioTestDB is the integration-test connection. Skipped unless
// MAPLEREWARDS_TEST_DB is set — mirrors the repo integration convention.
func portfolioTestDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("MAPLEREWARDS_TEST_DB")
	if dsn == "" {
		t.Skip("MAPLEREWARDS_TEST_DB not set — skipping handler integration test")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatalf("pgxpool connect: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

// loadUserCard builds a model.UserCard for a catalog card, with the
// LoyaltyProgram populated the way computeUtilization expects.
func loadUserCard(t *testing.T, pool *pgxpool.Pool, cardID string) model.UserCard {
	t.Helper()
	card := model.Card{ID: cardID, LoyaltyProgram: &model.LoyaltyProgram{}}
	err := pool.QueryRow(context.Background(), `
		SELECT c.name, c.loyalty_program_id, lp.base_cpp
		FROM cards c
		JOIN loyalty_programs lp ON lp.id = c.loyalty_program_id
		WHERE c.id = $1
	`, cardID).Scan(&card.Name, &card.LoyaltyProgramID, &card.LoyaltyProgram.BaseCPP)
	if err != nil {
		t.Fatalf("load card %s: %v", cardID, err)
	}
	return model.UserCard{CardID: cardID, Card: &card}
}

// TestUtilization_PointsVsCashbackParity guards the P1-7 unit-mismatch fix:
// the points branch must score in the SAME percent units as the cashback
// branch (earn rate × cpp, matching the optimizer's EffectiveReturn). Before
// the fix the points branch divided by 100, so a 1% no-fee cashback card beat
// Amex Cobalt's 5x @ 1.65¢ (= 8.25%) in every category.
func TestUtilization_PointsVsCashbackParity(t *testing.T) {
	pool := portfolioTestDB(t)

	const (
		cobaltID   = "20000000-0000-0000-0000-000000000001" // Amex Cobalt — 5x groceries, MR 1.65¢
		momentumID = "20000000-0000-0000-0000-000000000068" // Scotiabank Momentum No-Fee Visa — 1% groceries cashback
	)
	userCards := []model.UserCard{
		loadUserCard(t, pool, cobaltID),
		loadUserCard(t, pool, momentumID),
	}

	h := NewPortfolioHandler(nil, repo.NewCardRepo(pool), nil, repo.NewTransferRepo(pool), nil)
	utilization := h.computeUtilization(context.Background(), "", userCards)

	var groceries *model.CategoryGap
	for i := range utilization.Gaps {
		if utilization.Gaps[i].CategoryName == "Groceries" {
			groceries = &utilization.Gaps[i]
			break
		}
	}
	if groceries == nil {
		t.Fatalf("no Groceries row in utilization gaps: %+v", utilization.Gaps)
	}

	if groceries.BestCardInWallet != "Amex Cobalt" {
		t.Errorf("Groceries best card = %q, want Amex Cobalt (5x @ 1.65¢ = 8.25%% must beat 1%% cashback)", groceries.BestCardInWallet)
	}
	// 5 × 1.65 = 8.25% before any transfer-partner uplift; the old /100 bug
	// produced 0.0825 and made the 1% cashback card win.
	if groceries.WalletReturn < 8.25 {
		t.Errorf("Groceries wallet return = %.4f, want >= 8.25 (percent units, optimizer parity)", groceries.WalletReturn)
	}
	if !groceries.IsCovered {
		t.Errorf("Groceries IsCovered = false, want true (8.25%% >= 1.5%% threshold)")
	}
}
