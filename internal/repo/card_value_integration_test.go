package repo

import (
	"context"
	"testing"
)

const cobaltCardID = "20000000-0000-0000-0000-000000000001"

// TestCardValue_CobaltCategoryAware proves the founder-reported "Amex Cobalt
// ≈ $17" defect is fixed: the no-curated-components baseline must now value a
// card by its REAL per-category multipliers (Cobalt = 5x groceries/dining/
// streaming @ 1.65¢ MR), not the everything-else 1x rate. Skipped unless
// MAPLEREWARDS_TEST_DB is set (mirrors the repo integration convention).
func TestCardValue_CobaltCategoryAware(t *testing.T) {
	pool := chatTestDB(t) // skips if MAPLEREWARDS_TEST_DB unset
	userID := seedTestUser(t, pool)
	ctx := context.Background()

	if _, err := pool.Exec(ctx,
		`INSERT INTO user_cards (user_id, card_id) VALUES ($1, $2)`,
		userID, cobaltCardID); err != nil {
		t.Fatalf("seed Cobalt into wallet: %v", err)
	}

	summaries, err := NewCardValueRepo(pool).SummaryForUserCards(ctx, userID)
	if err != nil {
		t.Fatalf("SummaryForUserCards: %v", err)
	}
	if len(summaries) != 1 {
		t.Fatalf("expected 1 card summary, got %d", len(summaries))
	}
	s := summaries[0]

	// Standard basket: 6000 groc + 3600 dining @5x + 600 streaming @5x +
	// 2400 travel + 2400 gas @2x + ~9000 rest @1x, all × 1.65¢ ≈ $1,148.
	// The OLD everything-else-only bug produced a tiny value (founder saw
	// ~$17). Assert we're firmly in category-aware territory.
	if s.TotalEVCAD < 800 {
		t.Fatalf("Cobalt TotalEVCAD = $%.2f — still under-valued (category multipliers not applied; the $17 bug)", s.TotalEVCAD)
	}
	if s.TotalEVCAD > 2500 {
		t.Fatalf("Cobalt TotalEVCAD = $%.2f — implausibly high, check the basket/cpp math", s.TotalEVCAD)
	}
	if len(s.Components) == 0 {
		t.Fatal("expected a synthesised earning component, got none")
	}
	if s.NetEVCAD != s.TotalEVCAD-s.AnnualFee {
		t.Fatalf("NetEVCAD %.2f != TotalEV %.2f - fee %.2f", s.NetEVCAD, s.TotalEVCAD, s.AnnualFee)
	}
	t.Logf("Cobalt category-aware value: TotalEV=$%.2f NetEV=$%.2f (fee $%.2f) — was ~$17 before the fix",
		s.TotalEVCAD, s.NetEVCAD, s.AnnualFee)
}
