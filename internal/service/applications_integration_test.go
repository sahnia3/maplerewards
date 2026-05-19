package service

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"maplerewards/internal/repo"
)

// TestApplications_RecordingChangesEligibility proves recording an application
// is NOT inert (founder: "I record an application… what is the point?"). It
// directly powers the issuer-cooldown verdict: a fresh Amex card reads "clear"
// before, then "within cooldown — wait" after a recorded Amex application.
// Skipped unless MAPLEREWARDS_TEST_DB is set (repo integration convention).
func TestApplications_RecordingChangesEligibility(t *testing.T) {
	dsn := os.Getenv("MAPLEREWARDS_TEST_DB")
	if dsn == "" {
		t.Skip("MAPLEREWARDS_TEST_DB not set — skipping applications integration test")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("pgxpool connect: %v", err)
	}
	t.Cleanup(pool.Close)

	// Throwaway user (cascade cleans card_applications on delete).
	sessionID := "test-apps-" + time.Now().UTC().Format("20060102T150405.000000")
	var userID string
	if err := pool.QueryRow(ctx,
		`INSERT INTO users (session_id) VALUES ($1) RETURNING id::text`, sessionID,
	).Scan(&userID); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	t.Cleanup(func() { _, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID) })

	appRepo := repo.NewApplicationRepo(pool)
	svc := NewApplicationService(appRepo, repo.NewWalletRepo(pool), repo.NewCardRepo(pool))
	const amexCobalt = "20000000-0000-0000-0000-000000000001" // issuer "American Express", 60-day rule

	before, err := svc.CheckEligibility(ctx, sessionID, amexCobalt)
	if err != nil {
		t.Fatalf("CheckEligibility before: %v", err)
	}
	if before.Severity == "warn" {
		t.Fatalf("expected no cooldown before any recorded application, got warn: %s", before.Reason)
	}

	// Record an Amex application TODAY.
	if _, err := appRepo.Create(ctx, userID, amexCobalt,
		time.Now().Format("2006-01-02"), "approved", "integration test"); err != nil {
		t.Fatalf("record application: %v", err)
	}

	after, err := svc.CheckEligibility(ctx, sessionID, amexCobalt)
	if err != nil {
		t.Fatalf("CheckEligibility after: %v", err)
	}
	if after.Severity != "warn" {
		t.Fatalf("recording an application had NO effect on eligibility (severity=%q reason=%q) — the founder's 'what is the point' bug",
			after.Severity, after.Reason)
	}
	if after.EligibleAt == nil {
		t.Fatal("expected an EligibleAt date after entering cooldown, got nil")
	}
	t.Logf("PROVEN recording is not inert: before=%q → after=%q (clear until %s)",
		before.Severity, after.Severity, after.EligibleAt.Format("2006-01-02"))
}
