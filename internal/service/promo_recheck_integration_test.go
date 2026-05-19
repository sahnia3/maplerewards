package service

import (
	"context"
	"log/slog"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"maplerewards/internal/repo"
)

// TestRecheckSources_Integration runs the real source-health re-check against
// a live DB + the live internet. Skipped unless MAPLEREWARDS_TEST_DB is set
// (mirrors the repo integration-test convention) so `go test ./...` stays
// green on CI without Postgres. This is the deliberate, honest verification
// for the founder-reported "every promo Source link 404s" defect: it proves
// the mechanism on the actual rows, not a mock.
func TestRecheckSources_Integration(t *testing.T) {
	dsn := os.Getenv("MAPLEREWARDS_TEST_DB")
	if dsn == "" {
		t.Skip("MAPLEREWARDS_TEST_DB not set — skipping promo recheck integration test")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("pgxpool connect: %v", err)
	}
	t.Cleanup(pool.Close)

	bonusRepo := repo.NewTransferBonusRepo(pool)
	svc := NewPromoSentinelService(nil, bonusRepo, "")
	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

	before, err := bonusRepo.ListActive(ctx, 50)
	if err != nil {
		t.Fatalf("ListActive before: %v", err)
	}

	svc.RecheckSources(ctx, log)

	after, err := bonusRepo.ListActive(ctx, 50)
	if err != nil {
		t.Fatalf("ListActive after: %v", err)
	}

	t.Logf("ListActive: %d before recheck → %d after (rows with a dead/unverifiable citation are now hidden)",
		len(before), len(after))

	// Every promo the user can still see must have a source that resolved
	// just now under the same standard ingest uses.
	for _, p := range after {
		if !sourceURLLive(ctx, svc.httpClient, p.SourceURL) {
			t.Errorf("ListActive still surfaces a promo whose source does not resolve: %s (%s→%s)",
				p.SourceURL, p.FromProgram, p.ToProgram)
		}
	}
}
