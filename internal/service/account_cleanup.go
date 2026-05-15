package service

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// AccountCleanupService hard-deletes user rows whose soft-delete window has
// expired (default: 30 days). PIPEDA + the user's own privacy policy promise
// "fully purged within 30 days of a deletion request" — without this cron
// the promise is rhetorical only.
//
// The retention rationale: 30 days gives users time to email support and
// recover from an accidental delete (legitimate use case), and lines up with
// the "deletion audit log retained 12 months" obligation in the privacy
// policy.
//
// Strategy: cascade through tables that have FKs to users(id). The schema
// already has ON DELETE CASCADE on the major ones (user_cards, spend_entries,
// refresh_tokens, etc.) so deleting the user row is enough — Postgres will
// propagate.
type AccountCleanupService struct {
	pool          *pgxpool.Pool
	retentionDays int
}

// NewAccountCleanupService constructs the service with a custom retention
// window. Pass 0 for the default 30 days.
func NewAccountCleanupService(pool *pgxpool.Pool, retentionDays int) *AccountCleanupService {
	if retentionDays <= 0 {
		retentionDays = 30
	}
	return &AccountCleanupService{pool: pool, retentionDays: retentionDays}
}

// HardDeleteExpired purges users whose deleted_at is older than the retention
// window. Returns the number of rows hard-deleted plus any error. Safe to
// run repeatedly — idempotent on already-purged rows.
func (s *AccountCleanupService) HardDeleteExpired(ctx context.Context) (int, error) {
	cutoff := time.Now().UTC().AddDate(0, 0, -s.retentionDays)
	tag, err := s.pool.Exec(ctx, `
		DELETE FROM users
		WHERE deleted_at IS NOT NULL
		  AND deleted_at < $1
	`, cutoff)
	if err != nil {
		return 0, fmt.Errorf("hard delete expired users: %w", err)
	}
	return int(tag.RowsAffected()), nil
}

// RunSweep is the worker entry point. Logs the rollup. Best-effort:
// any error is logged but does not propagate (the worker should keep
// running its other ticks).
func (s *AccountCleanupService) RunSweep(ctx context.Context, log *slog.Logger) {
	n, err := s.HardDeleteExpired(ctx)
	if err != nil {
		log.Error("account cleanup sweep failed", "err", err)
		return
	}
	if n > 0 {
		log.Info("account cleanup hard-deleted expired users", "count", n, "retention_days", s.retentionDays)
	}
}
