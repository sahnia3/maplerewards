package repo

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Seeded fixture UUIDs (see migrations/000002_seed.up.sql).
const (
	mergeCardCobalt   = "20000000-0000-0000-0000-000000000001"
	mergeCatGroceries = "30000000-0000-0000-0000-000000000001"
	mergeCatDining    = "30000000-0000-0000-0000-000000000002"
)

// insertSpendEntry inserts one spend_entries row for the given user. Mirrors
// the idx_spend_entries_dedup key columns so the test can craft deliberate
// collisions.
func insertSpendEntry(t *testing.T, pool *pgxpool.Pool, userID, categoryID, spentAt string, amount float64, note string) {
	t.Helper()
	_, err := pool.Exec(context.Background(), `
		INSERT INTO spend_entries (user_id, card_id, category_id, amount, spent_at, note)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, userID, mergeCardCobalt, categoryID, amount, spentAt, note)
	if err != nil {
		t.Fatalf("insert spend_entry (cat=%s amt=%.2f note=%q): %v", categoryID, amount, note, err)
	}
}

// insertMonthlySpend inserts one user_monthly_spend bucket.
func insertMonthlySpend(t *testing.T, pool *pgxpool.Pool, userID, categoryID, month string, total float64) {
	t.Helper()
	_, err := pool.Exec(context.Background(), `
		INSERT INTO user_monthly_spend (user_id, card_id, category_id, month, total_spend)
		VALUES ($1, $2, $3, $4, $5)
	`, userID, mergeCardCobalt, categoryID, month, total)
	if err != nil {
		t.Fatalf("insert monthly_spend (cat=%s total=%.2f): %v", categoryID, total, err)
	}
}

// insertCardBonus inserts one user_card_bonuses progress row.
func insertCardBonus(t *testing.T, pool *pgxpool.Pool, userID string, minSpend, currentSpend float64, completed bool) {
	t.Helper()
	_, err := pool.Exec(context.Background(), `
		INSERT INTO user_card_bonuses (user_id, card_id, deadline_at, min_spend, current_spend, is_completed)
		VALUES ($1, $2, CURRENT_DATE + 30, $3, $4, $5)
	`, userID, mergeCardCobalt, minSpend, currentSpend, completed)
	if err != nil {
		t.Fatalf("insert card_bonus (min=%.2f cur=%.2f): %v", minSpend, currentSpend, err)
	}
}

// TestMergeAnonymousUser_OverlappingData proves the two MergeAnonymousUser bugs
// are fixed:
//
//	#2 (data loss): a spend_entries row that collides with one the auth user
//	    already has must NOT abort the whole merge tx. Pre-fix the unconditional
//	    UPDATE hit idx_spend_entries_dedup and rolled back the entire merge,
//	    silently losing the guest's wallet after signup.
//
//	#4 (data integrity): an overlapping user_monthly_spend bucket must be
//	    *folded* (summed) into the auth user's bucket, not dropped — otherwise
//	    total_spend reads lower than the sum of its own (fully transferred)
//	    spend entries, under-counting caps/EV. Welcome-bonus progress folds via
//	    GREATEST.
//
// Skipped unless MAPLEREWARDS_TEST_DB is set (repo integration convention).
func TestMergeAnonymousUser_OverlappingData(t *testing.T) {
	pool := chatTestDB(t) // skips if MAPLEREWARDS_TEST_DB unset
	ctx := context.Background()
	repo := NewAuthRepo(pool)

	authUser := seedTestUser(t, pool)
	anonUser := seedTestUser(t, pool)

	const day = "2026-03-15"
	const month = "2026-03-01"

	// ── spend_entries ────────────────────────────────────────────────────
	// Identical row on both users → collides on idx_spend_entries_dedup.
	insertSpendEntry(t, pool, authUser, mergeCatGroceries, day, 50.00, "costco")
	insertSpendEntry(t, pool, anonUser, mergeCatGroceries, day, 50.00, "costco")
	// Anon-only, non-colliding row → must transfer to the auth user.
	insertSpendEntry(t, pool, anonUser, mergeCatDining, day, 22.50, "lunch")

	// ── user_monthly_spend ───────────────────────────────────────────────
	// Overlapping bucket (groceries, March): auth $50 + anon $50 → fold to $100.
	insertMonthlySpend(t, pool, authUser, mergeCatGroceries, month, 50.00)
	insertMonthlySpend(t, pool, anonUser, mergeCatGroceries, month, 50.00)
	// Anon-only bucket (dining, March): transfers as-is.
	insertMonthlySpend(t, pool, anonUser, mergeCatDining, month, 22.50)

	// ── user_card_bonuses ────────────────────────────────────────────────
	// Same card on both: auth progress $200, anon progress $500, threshold
	// $3000 → fold to GREATEST = $500, still not completed.
	insertCardBonus(t, pool, authUser, 3000.00, 200.00, false)
	insertCardBonus(t, pool, anonUser, 3000.00, 500.00, false)

	// ── merge ────────────────────────────────────────────────────────────
	if err := repo.MergeAnonymousUser(ctx, authUser, anonUser); err != nil {
		t.Fatalf("bug #2: merge with overlapping spend entry must NOT roll back, got error: %v", err)
	}

	// Anon user fully removed.
	var anonExists bool
	if err := pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)`, anonUser).Scan(&anonExists); err != nil {
		t.Fatalf("check anon user existence: %v", err)
	}
	if anonExists {
		t.Error("anon user should be deleted after merge")
	}

	// spend_entries: auth user keeps the original groceries row + the migrated
	// dining row = 2; no duplicate of the colliding row.
	var entryCount int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM spend_entries WHERE user_id = $1`, authUser).Scan(&entryCount); err != nil {
		t.Fatalf("count spend_entries: %v", err)
	}
	if entryCount != 2 {
		t.Errorf("expected 2 spend entries on auth user (1 original + 1 migrated, no dup), got %d", entryCount)
	}

	// No anon spend_entries leak through.
	var anonEntries int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM spend_entries WHERE user_id = $1`, anonUser).Scan(&anonEntries); err != nil {
		t.Fatalf("count anon spend_entries: %v", err)
	}
	if anonEntries != 0 {
		t.Errorf("expected 0 leftover anon spend entries, got %d", anonEntries)
	}

	// The non-colliding dining entry must have transferred.
	var diningEntries int
	if err := pool.QueryRow(ctx, `
		SELECT count(*) FROM spend_entries
		WHERE user_id = $1 AND category_id = $2 AND note = 'lunch'
	`, authUser, mergeCatDining).Scan(&diningEntries); err != nil {
		t.Fatalf("count dining entry: %v", err)
	}
	if diningEntries != 1 {
		t.Errorf("non-colliding anon dining entry should have transferred, got %d", diningEntries)
	}

	// bug #4: overlapping monthly bucket folded ($50 + $50 = $100), not dropped.
	var groceriesTotal float64
	if err := pool.QueryRow(ctx, `
		SELECT total_spend FROM user_monthly_spend
		WHERE user_id = $1 AND category_id = $2 AND month = $3
	`, authUser, mergeCatGroceries, month).Scan(&groceriesTotal); err != nil {
		t.Fatalf("read folded groceries bucket: %v", err)
	}
	if groceriesTotal != 100.00 {
		t.Errorf("bug #4: overlapping monthly_spend must fold to 100.00 (50+50), got %.2f", groceriesTotal)
	}

	// Non-colliding dining bucket transferred at its original value.
	var diningTotal float64
	if err := pool.QueryRow(ctx, `
		SELECT total_spend FROM user_monthly_spend
		WHERE user_id = $1 AND category_id = $2 AND month = $3
	`, authUser, mergeCatDining, month).Scan(&diningTotal); err != nil {
		t.Fatalf("read dining bucket: %v", err)
	}
	if diningTotal != 22.50 {
		t.Errorf("anon dining bucket should transfer at 22.50, got %.2f", diningTotal)
	}

	// Exactly two buckets total — no anon rows orphaned.
	var bucketCount int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM user_monthly_spend WHERE user_id = $1`, authUser).Scan(&bucketCount); err != nil {
		t.Fatalf("count monthly buckets: %v", err)
	}
	if bucketCount != 2 {
		t.Errorf("expected 2 monthly buckets (groceries folded + dining migrated), got %d", bucketCount)
	}

	// bug #4: welcome-bonus progress folded via GREATEST(200, 500) = 500.
	var bonusSpend float64
	var bonusCompleted bool
	if err := pool.QueryRow(ctx, `
		SELECT current_spend, is_completed FROM user_card_bonuses WHERE user_id = $1
	`, authUser).Scan(&bonusSpend, &bonusCompleted); err != nil {
		t.Fatalf("read folded card bonus: %v", err)
	}
	if bonusSpend != 500.00 {
		t.Errorf("bug #4: welcome-bonus progress must fold to GREATEST = 500.00, got %.2f", bonusSpend)
	}
	if bonusCompleted {
		t.Error("500 < 3000 threshold — bonus must remain not-completed")
	}
}

// TestMergeAnonymousUser_BonusCompletionRecomputed verifies the folded
// welcome-bonus row flips to completed when the GREATEST progress crosses the
// auth user's threshold, and stamps completed_at.
func TestMergeAnonymousUser_BonusCompletionRecomputed(t *testing.T) {
	pool := chatTestDB(t)
	ctx := context.Background()
	repo := NewAuthRepo(pool)

	authUser := seedTestUser(t, pool)
	anonUser := seedTestUser(t, pool)

	// Auth at $100, anon at $3200, threshold $3000 → fold to $3200 ⇒ completed.
	insertCardBonus(t, pool, authUser, 3000.00, 100.00, false)
	insertCardBonus(t, pool, anonUser, 3000.00, 3200.00, true)

	if err := repo.MergeAnonymousUser(ctx, authUser, anonUser); err != nil {
		t.Fatalf("merge: %v", err)
	}

	var spend float64
	var completed bool
	var completedAt *time.Time
	if err := pool.QueryRow(ctx, `
		SELECT current_spend, is_completed, completed_at
		FROM user_card_bonuses WHERE user_id = $1
	`, authUser).Scan(&spend, &completed, &completedAt); err != nil {
		t.Fatalf("read bonus: %v", err)
	}
	if spend != 3200.00 {
		t.Errorf("expected folded progress 3200.00, got %.2f", spend)
	}
	if !completed {
		t.Error("folded progress crossed the $3000 threshold — bonus must read completed")
	}
	if completedAt == nil {
		t.Error("completed bonus must have a completed_at date")
	}
}
