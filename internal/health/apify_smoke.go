// Package health provides background health checks for external integrations.
//
// Apify's flight-award-scraper actor schema has drifted twice in one week
// (totalDuration and segments[].duration both flipped from JSON string to
// JSON number). Each drift broke parsing silently — we noticed only when a
// user got bad data. This smoke test runs a fixed query every 6 hours and
// validates the shape of the response so the next drift is caught by us,
// not the user.
package health

import (
	"context"
	"fmt"
	"log/slog"
	"sync/atomic"
	"time"

	"maplerewards/internal/model"
	"maplerewards/internal/service"
)

// ApifySmokeChecker periodically fires a known award-search query and asserts
// the result satisfies basic shape invariants. Designed to run as a goroutine
// for the lifetime of the process.
type ApifySmokeChecker struct {
	awardSvc *service.AwardSearchService
	interval time.Duration

	// lastResult is updated atomically after each run for debug introspection.
	// Stored as JSON-marshalable struct rather than the live value to avoid
	// race conditions on slog reads.
	lastResult atomic.Value // *SmokeResult
}

// SmokeResult captures the outcome of one smoke run.
type SmokeResult struct {
	StartedAt   time.Time `json:"started_at"`
	OK          bool      `json:"ok"`
	ResultCount int       `json:"result_count"`
	Reason      string    `json:"reason,omitempty"` // populated when OK=false
	Elapsed     string    `json:"elapsed"`
}

// NewApifySmokeChecker constructs a checker. Pass interval=0 to use the default
// 6 hours — production-friendly cadence that's frequent enough to catch
// schema drift before users see it but light enough not to burn Apify credits.
func NewApifySmokeChecker(awardSvc *service.AwardSearchService, interval time.Duration) *ApifySmokeChecker {
	if interval <= 0 {
		interval = 6 * time.Hour
	}
	return &ApifySmokeChecker{
		awardSvc: awardSvc,
		interval: interval,
	}
}

// Start runs the smoke checker until ctx is cancelled. First run fires after
// 90 seconds so it doesn't compete with cold-start traffic. Subsequent runs
// fire on the configured interval.
func (c *ApifySmokeChecker) Start(ctx context.Context) {
	go c.loop(ctx)
}

func (c *ApifySmokeChecker) loop(ctx context.Context) {
	// Recover at the loop level — a panic in runOnce (e.g., a downstream
	// nil-deref in the award search path) would otherwise terminate the
	// entire API process, which we saw happen ~1 minute after each restart.
	defer func() {
		if rec := recover(); rec != nil {
			slog.Error("[apify-smoke] loop panic recovered, checker disabled",
				"panic", rec,
			)
		}
	}()

	// Initial delay so the smoke check doesn't fire during application startup
	// while the rest of the system is still warming caches.
	timer := time.NewTimer(90 * time.Second)
	defer timer.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
		}

		// Wrap each tick in its own recover so one bad run doesn't kill the
		// loop — we want continuous monitoring even if one search panics.
		func() {
			defer func() {
				if rec := recover(); rec != nil {
					slog.Error("[apify-smoke] runOnce panic recovered",
						"panic", rec,
					)
				}
			}()
			c.runOnce(ctx)
		}()
		timer.Reset(c.interval)
	}
}

// LastResult returns the most recent smoke run outcome, or nil if no run has
// completed yet. Useful for surfacing a /status endpoint later.
func (c *ApifySmokeChecker) LastResult() *SmokeResult {
	v := c.lastResult.Load()
	if v == nil {
		return nil
	}
	return v.(*SmokeResult)
}

// runOnce fires the smoke query and validates the response. The query is
// fixed and cheap: YYZ→LHR business class 30 days from today, +7 day flex.
// This is a high-traffic transatlantic route that always has Apify results,
// so a zero-result response is a valid signal of drift.
func (c *ApifySmokeChecker) runOnce(parent context.Context) {
	start := time.Now()

	// Hard cap of 3 minutes so a stuck Apify run can't hang the goroutine.
	ctx, cancel := context.WithTimeout(parent, 3*time.Minute)
	defer cancel()

	req := model.AwardSearchRequest{
		Origin:      "YYZ",
		Destination: "LHR",
		Date:        time.Now().AddDate(0, 0, 30).Format("2006-01-02"),
		FlexDays:    7,
		Cabin:       "business",
		Passengers:  1,
	}

	results, err := c.awardSvc.Search(ctx, req)
	elapsed := time.Since(start)

	res := &SmokeResult{
		StartedAt:   start.UTC(),
		ResultCount: len(results),
		Elapsed:     elapsed.String(),
	}

	switch {
	case err != nil:
		res.OK = false
		res.Reason = fmt.Sprintf("award search returned error: %v", err)
	case len(results) == 0:
		res.OK = false
		res.Reason = "award search returned 0 results — likely Apify schema drift or quota exhausted"
	case !c.allResultsHavePoints(results):
		res.OK = false
		res.Reason = "one or more results had zero PointsCost — Apify field mapping likely broke"
	default:
		res.OK = true
	}

	c.lastResult.Store(res)

	if res.OK {
		slog.Info("[apify-smoke] OK",
			"results", res.ResultCount,
			"elapsed", elapsed,
		)
	} else {
		slog.Warn("[apify-smoke] FAILED",
			"reason", res.Reason,
			"results", res.ResultCount,
			"elapsed", elapsed,
		)
	}
}

// allResultsHavePoints returns true if every result has a non-zero PointsCost.
// A zero PointsCost means Apify's response was parsed but a critical field was
// silently dropped — exactly the failure mode we hit twice last week.
func (c *ApifySmokeChecker) allResultsHavePoints(results []model.AwardSearchResult) bool {
	for _, r := range results {
		if r.PointsCost <= 0 {
			return false
		}
	}
	return true
}
