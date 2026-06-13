package service

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"maplerewards/internal/cache"
	"maplerewards/internal/repo"
)

// ValuationRefreshService previously re-UPSERTed every active point_valuations
// row weekly, bumping recorded_at = now() each sweep so the UI "freshness chip"
// reset to "reconfirmed today". But the sweep never CHANGES a CPP (its own
// docstring admitted this) — it re-wrote the same hand-entered value, so the
// chip claimed a re-confirmation that never happened on a months-stale number.
// That manufactured-freshness signal is exactly the kind of cynical data
// behavior a churner screenshots (AU-3).
//
// The sweep is now neutered: RunOnce no longer touches recorded_at and does not
// re-write valuations, so the freshness signal reflects the true effective_date
// of each valuation rather than the last sweep tick. The worker no longer calls
// it. A real CPP update remains a deliberate manual / admin / CLI action via
// repo.UpsertValuation (which legitimately stamps recorded_at when a value
// actually changes).
type ValuationRefreshService struct {
	pool       *pgxpool.Pool
	valRepo    *repo.ValuationRepo
	cache      *cache.Cache // nullable; cache invalidation is best-effort
}

func NewValuationRefreshService(pool *pgxpool.Pool, valRepo *repo.ValuationRepo, c *cache.Cache) *ValuationRefreshService {
	return &ValuationRefreshService{pool: pool, valRepo: valRepo, cache: c}
}

// ValuationRefreshResult is the post-run summary used in worker logs.
type ValuationRefreshResult struct {
	Rescanned   int
	HistoryRows int
	Failures    []string
	Elapsed     time.Duration
}

// RunOnce is intentionally a no-op (AU-3). It used to re-UPSERT every
// point_valuations row with its unchanged CPP and bump recorded_at = now(),
// manufacturing a "reconfirmed today" freshness signal on stale hand-entered
// values. We no longer touch recorded_at on a no-op refresh; the freshness
// signal must reflect each valuation's true effective_date. A genuine CPP
// change is still applied deliberately via repo.UpsertValuation (admin / CLI),
// which stamps recorded_at only when a value actually changes.
//
// Kept (returning an empty result) so the worker / CLI call sites remain valid
// and a future real refresh source can re-enable a sweep that only writes when
// the underlying CPP differs.
func (s *ValuationRefreshService) RunOnce(ctx context.Context) (*ValuationRefreshResult, error) {
	_ = ctx
	return &ValuationRefreshResult{}, nil
}

// RunSweep is the worker entry point. Logs the rollup. Errors logged but
// not propagated — the worker should keep ticking even if a partial failure
// occurs.
func (s *ValuationRefreshService) RunSweep(ctx context.Context, log *slog.Logger) {
	res, err := s.RunOnce(ctx)
	if err != nil {
		log.Error("valuation refresh failed", "err", err)
		return
	}
	if len(res.Failures) > 0 {
		log.Warn("valuation refresh partial",
			"rescanned", res.Rescanned, "history_rows", res.HistoryRows,
			"failures", len(res.Failures), "elapsed", res.Elapsed)
		return
	}
	log.Info("valuation refresh done",
		"rescanned", res.Rescanned, "history_rows", res.HistoryRows, "elapsed", res.Elapsed)
}
