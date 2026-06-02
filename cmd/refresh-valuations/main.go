// Package main implements the refresh-valuations CLI.
//
// Today's job: scan point_valuations, write one history row per active
// valuation, and bump recorded_at on the active row so the freshness chip
// in the UI doesn't claim every program is 2+ months stale. The output is
// a single JSON line so cron / GitHub Actions can grep it for alerts.
//
// Future work: when award_search_log lands (one row per AwardSearchResult
// with source='live'), compute the median CPP per (program, cabin) and
// push that as the new active value instead of just re-anchoring. The
// service already has UpsertValuation + InsertHistory; the only missing
// piece is the source table.
//
// Run with:    go run ./cmd/refresh-valuations
// Env:
//
//	DATABASE_URL — required
//	REDIS_ADDR   — optional, default localhost:6379
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"

	"maplerewards/internal/cache"
	"maplerewards/internal/repo"
)

type summary struct {
	StartedAt   time.Time `json:"started_at"`
	FinishedAt  time.Time `json:"finished_at"`
	ElapsedMS   int64     `json:"elapsed_ms"`
	Rescanned   int       `json:"rescanned"`
	HistoryRows int       `json:"history_rows"`
	Failures    []string  `json:"failures,omitempty"`
}

func main() {
	_ = godotenv.Load()
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(log)

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Error("DATABASE_URL required")
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// Cap the pool. This CLI is serial and short-lived, so it needs only a
	// couple of connections — but it may run (cron / GitHub Actions) while the
	// API and worker are live against the same Postgres, and pgxpool's default
	// of GREATEST(4, NumCPU) on a many-core CI runner would open far more than
	// this task ever uses. A small fixed cap keeps it from contributing to
	// max_connections pressure.
	pgxCfg, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		log.Error("postgres parse config failed", "err", err)
		os.Exit(1)
	}
	pgxCfg.MaxConns = 4
	pgxCfg.MinConns = 1
	pool, err := pgxpool.NewWithConfig(ctx, pgxCfg)
	if err != nil {
		log.Error("postgres connect failed", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	// Redis is optional — we just use it to nuke the warm-cache CPPs so a
	// rescanned valuation reflects immediately on the API side.
	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "localhost:6379"
	}
	redisClient := redis.NewClient(&redis.Options{
		Addr:     redisAddr,
		Password: os.Getenv("REDIS_PASSWORD"),
	})
	var redisCache *cache.Cache
	if err := redisClient.Ping(ctx).Err(); err != nil {
		log.Warn("redis ping failed; continuing without cache invalidation", "err", err)
	} else {
		redisCache = cache.New(redisClient)
	}

	valRepo := repo.NewValuationRepo(pool)

	out := summary{StartedAt: time.Now().UTC()}

	// Snapshot every active valuation. cmd/refresh-valuations is read-mostly
	// — we only write back via the repo's Upsert/Insert so the path is
	// identical to the admin push handler.
	rows, err := pool.Query(ctx, `
		SELECT lp.slug, pv.segment, pv.cpp, COALESCE(pv.source, 'manual')
		FROM point_valuations pv
		JOIN loyalty_programs lp ON lp.id = pv.loyalty_program_id
		ORDER BY lp.slug, pv.segment, pv.effective_date DESC
	`)
	if err != nil {
		log.Error("query point_valuations failed", "err", err)
		os.Exit(1)
	}

	type vrow struct {
		Slug    string
		Segment string
		CPP     float64
		Source  string
	}
	var snapshot []vrow
	for rows.Next() {
		var r vrow
		if err := rows.Scan(&r.Slug, &r.Segment, &r.CPP, &r.Source); err != nil {
			out.Failures = append(out.Failures, fmt.Sprintf("scan: %v", err))
			continue
		}
		snapshot = append(snapshot, r)
	}
	rows.Close()

	// Dedupe to most recent (slug, segment) — query is ORDER BY effective_date DESC.
	seen := map[string]bool{}
	for _, r := range snapshot {
		key := r.Slug + "|" + r.Segment
		if seen[key] {
			continue
		}
		seen[key] = true

		// Upsert re-anchors recorded_at to now() and bumps the same row so the
		// UI staleness chip resets. Source carried forward unchanged.
		if err := valRepo.UpsertValuation(ctx, r.Slug, r.Segment, r.CPP, r.Source); err != nil {
			out.Failures = append(out.Failures, fmt.Sprintf("upsert %s/%s: %v", r.Slug, r.Segment, err))
			continue
		}
		if err := valRepo.InsertHistory(ctx, r.Slug, r.Segment, r.CPP, r.Source); err != nil {
			out.Failures = append(out.Failures, fmt.Sprintf("history %s/%s: %v", r.Slug, r.Segment, err))
		} else {
			out.HistoryRows++
		}
		if redisCache != nil {
			_ = redisCache.InvalidateValuation(ctx, r.Slug, r.Segment)
		}
		out.Rescanned++
	}

	out.FinishedAt = time.Now().UTC()
	out.ElapsedMS = out.FinishedAt.Sub(out.StartedAt).Milliseconds()

	b, _ := json.Marshal(out)
	fmt.Println(string(b))
}
