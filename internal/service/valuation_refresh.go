package service

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"maplerewards/internal/cache"
	"maplerewards/internal/repo"
)

// ValuationRefreshService re-anchors point_valuations.recorded_at for every
// active row weekly. Without this the UI's "freshness chip" reports every
// program as months-stale because the CLI binary that performs this work
// (cmd/refresh-valuations) was never wired into a scheduler.
//
// Migration 38 included a one-off Aeroplan CPP bump from 1.5 → 2.0¢; this
// service ensures the same kind of staleness doesn't accumulate again. The
// actual CPP values are NOT changed here — that's still a manual / admin
// action — but the timestamp bump signals "we re-confirmed today".
//
// Mirrors cmd/refresh-valuations/main.go but as a service callable from the
// worker tick. The CLI binary remains for one-off ops.
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

// RunOnce performs one full sweep. Safe to call from a goroutine. Logs at
// INFO on success and WARN on partial failure; never panics (caller can
// safeGo if it's running in a request-scoped context).
func (s *ValuationRefreshService) RunOnce(ctx context.Context) (*ValuationRefreshResult, error) {
	start := time.Now()
	res := &ValuationRefreshResult{}

	rows, err := s.pool.Query(ctx, `
		SELECT lp.slug, pv.segment, pv.cpp, COALESCE(pv.source, 'manual')
		FROM point_valuations pv
		JOIN loyalty_programs lp ON lp.id = pv.loyalty_program_id
		ORDER BY lp.slug, pv.segment, pv.effective_date DESC
	`)
	if err != nil {
		return res, fmt.Errorf("query point_valuations: %w", err)
	}
	defer rows.Close()

	type vrow struct {
		Slug, Segment, Source string
		CPP                   float64
	}
	var snap []vrow
	for rows.Next() {
		var r vrow
		if err := rows.Scan(&r.Slug, &r.Segment, &r.CPP, &r.Source); err != nil {
			res.Failures = append(res.Failures, fmt.Sprintf("scan: %v", err))
			continue
		}
		snap = append(snap, r)
	}

	// Dedupe to most-recent (slug, segment) — query is ORDER BY effective_date DESC.
	seen := map[string]bool{}
	for _, r := range snap {
		key := r.Slug + "|" + r.Segment
		if seen[key] {
			continue
		}
		seen[key] = true

		if err := s.valRepo.UpsertValuation(ctx, r.Slug, r.Segment, r.CPP, r.Source); err != nil {
			res.Failures = append(res.Failures, fmt.Sprintf("upsert %s/%s: %v", r.Slug, r.Segment, err))
			continue
		}
		if err := s.valRepo.InsertHistory(ctx, r.Slug, r.Segment, r.CPP, r.Source); err != nil {
			res.Failures = append(res.Failures, fmt.Sprintf("history %s/%s: %v", r.Slug, r.Segment, err))
		} else {
			res.HistoryRows++
		}
		if s.cache != nil {
			_ = s.cache.InvalidateValuation(ctx, r.Slug, r.Segment)
		}
		res.Rescanned++
	}
	res.Elapsed = time.Since(start)
	return res, nil
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
