// Package main implements the MapleRewards background worker. Today its
// only job is the award-watch cron — every active watch in award_watch is
// re-probed against the live award data sources (Apify, Seats.aero) on a
// fixed interval. When a probe finds a price within the user's max_points
// (or materially better than the previous probe) the worker stamps an alert
// the frontend will surface in /pro-tools.
//
// The worker is intentionally separate from the API process so that:
//   - long Apify runs (60-120s) don't compete with API request latency,
//   - API restarts don't drop in-flight checks,
//   - it can be horizontally scaled or paused independently.
//
// Run with:    go run ./cmd/worker
// Configure via env:
//   DATABASE_URL                — required
//   REDIS_ADDR                  — default localhost:6379
//   APIFY_TOKEN                 — required for live probes; empty disables
//   SEATSAERO_API_KEY           — optional secondary source
//   SERPAPI_KEY                 — optional cash-price enrichment
//   AWARD_WATCH_TICK_HOURS      — default 24 hours between sweeps
//   AWARD_WATCH_BATCH_SIZE      — default 50 watches per sweep
//   AWARD_WATCH_GAP_THRESHOLD   — default 5000; alert when last_min_points
//                                 drops by at least this many points.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"

	"maplerewards/internal/cache"
	"maplerewards/internal/knowledge"
	"maplerewards/internal/model"
	"maplerewards/internal/quota"
	"maplerewards/internal/repo"
	"maplerewards/internal/service"
)

func main() {
	_ = godotenv.Load()
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(log)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pool, err := pgxpool.New(ctx, mustEnv("DATABASE_URL"))
	if err != nil {
		log.Error("postgres connect failed", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	rdb := redis.NewClient(&redis.Options{
		Addr:     getEnv("REDIS_ADDR", "localhost:6379"),
		Password: getEnv("REDIS_PASSWORD", ""),
	})
	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Warn("redis ping failed (continuing without cache)", "err", err)
	}

	// Build the minimum service graph the worker needs.
	walletRepo := repo.NewWalletRepo(pool)
	cardRepo := repo.NewCardRepo(pool)
	watchRepo := repo.NewAwardWatchRepo(pool)
	issuerPageRepo := repo.NewIssuerPageRepo(pool)
	authRepo := repo.NewAuthRepo(pool)
	pushRepo := repo.NewPushRepo(pool)
	transferBonusRepo := repo.NewTransferBonusRepo(pool)
	spendRepo := repo.NewSpendRepo(pool)
	valuationRepo := repo.NewValuationRepo(pool)
	transferRepo := repo.NewTransferRepo(pool)
	redisCache := cache.New(rdb)
	// Honor KB_DIR like the API does, so the worker can run outside the repo
	// root, and log (don't silently swallow) a load failure — a nil KB silently
	// disables the award-watch static-chart fallback otherwise.
	kbDir := os.Getenv("KB_DIR")
	if kbDir == "" {
		kbDir = "internal/knowledge"
	}
	kb, kbErr := knowledge.Load(filepath.Join(kbDir, "rewards.yaml"))
	if kbErr != nil {
		log.Warn("could not load knowledge base — award-watch static fallback disabled", "err", kbErr, "kb_dir", kbDir)
	}

	// Worker shares the same monthly free-tier budgets as the API; using the
	// same Redis-backed quota counter keeps both processes honest (the Apify
	// monthly cap is enforced across API + worker combined).
	workerQuota := quota.New(rdb)
	apify := service.NewApifyAwardService(getEnv("APIFY_TOKEN", ""), workerQuota)
	serp := service.NewSerpAPIService(getEnv("SERPAPI_KEY", ""), workerQuota)
	seatsAero := service.NewSeatsAeroService(getEnv("SEATSAERO_API_KEY", ""))
	awardSearch := service.NewAwardSearchService(apify, seatsAero, serp, walletRepo, kb, redisCache)
	issuerWatch := service.NewIssuerWatchService(issuerPageRepo, getEnv("ANTHROPIC_API_KEY", ""))

	// Shared notification rail. Picks ResendMailer when RESEND_API_KEY is set,
	// otherwise LogMailer (logs preview to stdout). Worker reuses the same
	// abstraction as cmd/api so the verify path and the alert path stay
	// consistent across providers.
	mailer := service.NewMailerFromEnv()
	if os.Getenv("RESEND_API_KEY") == "" {
		log.Warn("RESEND_API_KEY not set — award-watch alert emails will be logged only, not delivered")
	}

	// Web push fan-out. When VAPID keys are wired the worker delivers the
	// same award alerts as push notifications alongside the email rail.
	pusher := service.NewPusherFromEnv()
	if !pusher.IsAvailable() {
		log.Warn("VAPID keys not set — push notifications will be logged only, not delivered")
	}

	// Per-Pro-user issuer-change digest. Runs every DIGEST_TICK_HOURS (default
	// 24) but the service only sends to recipients whose last digest is >6
	// days old AND who have new issuer-page changes affecting their wallet.
	// Empty digests are not sent, so daily ticks are cheap.
	digestSvc := service.NewIssuerDigestService(authRepo, issuerPageRepo, mailer)

	// Per-Pro-user missed-rewards digest. Same cadence + skip-empty contract
	// as the issuer digest but tracks its own last-sent stamp so the two
	// channels don't suppress each other on weeks where only one has content.
	optimizerSvc := service.NewOptimizerService(cardRepo, walletRepo, valuationRepo, transferRepo, spendRepo, redisCache)
	missedRewardsSvc := service.NewMissedRewardsService(walletRepo, spendRepo, optimizerSvc)
	missedRewardsDigestSvc := service.NewMissedRewardsDigestService(authRepo, missedRewardsSvc, mailer)

	// Pre-expiry reminders for offers the user clipped (card_offers). Runs in
	// the daily digest slot; exactly-once via expiry_notified_at; CASL footer
	// + opt-out enforced. Without this the "track what you clipped" tracker is
	// inert (LAUNCH-ISSUES.md P4.2).
	cardOfferRepo := repo.NewCardOfferRepo(pool)
	offerExpirySvc := service.NewOfferExpiryService(cardOfferRepo, mailer)

	// Promo Sentinel — scans Tavily-curated rewards-blog domains every 12h
	// for active transfer-bonus promotions, extracts (from, to, %, expires)
	// via Claude, upserts into transfer_bonus_events. No-op when either
	// TAVILY_API_KEY or ANTHROPIC_API_KEY is absent.
	tavilySvc := service.NewTavilyService(getEnv("TAVILY_API_KEY", ""), workerQuota)
	promoSvc := service.NewPromoSentinelService(tavilySvc, transferBonusRepo, getEnv("ANTHROPIC_API_KEY", ""))

	// Account cleanup — hard-deletes users whose deleted_at is older than the
	// 30-day retention window. PIPEDA promise: data fully purged within 30
	// days of deletion request. Runs daily at the same cadence as digests.
	accountCleanupSvc := service.NewAccountCleanupService(pool, 30)

	// Weekly valuation refresh — re-anchors point_valuations.recorded_at so
	// the UI's freshness chip stops claiming every program is months-stale.
	// Mirrors cmd/refresh-valuations/main.go but on a schedule.
	valuationRefreshSvc := service.NewValuationRefreshService(pool, valuationRepo, redisCache)

	awardWatchEnabled := apify.IsAvailable() || seatsAero.IsAvailable()
	if !awardWatchEnabled {
		log.Warn("no live award data source configured — award-watch sweeps disabled (set APIFY_TOKEN or SEATSAERO_API_KEY to enable)")
	}

	// Default raised 4h → 24h: every sweep re-runs paid Apify scrapes for
	// saved trips. Daily re-probe is plenty for award-availability alerts
	// and cuts this fixed background cost ~6x. Override via env if needed.
	awardTickHours := getEnvInt("AWARD_WATCH_TICK_HOURS", 24)
	awardBatchSize := getEnvInt("AWARD_WATCH_BATCH_SIZE", 50)
	gapThreshold := getEnvInt("AWARD_WATCH_GAP_THRESHOLD", 5000)
	issuerTickHours := getEnvInt("ISSUER_WATCH_TICK_HOURS", 24)
	issuerBatchSize := getEnvInt("ISSUER_WATCH_BATCH_SIZE", 50)
	digestTickHours := getEnvInt("DIGEST_TICK_HOURS", 24)
	promoTickHours := getEnvInt("PROMO_TICK_HOURS", 12)

	log.Info("worker starting",
		"award_tick_hours", awardTickHours,
		"award_batch_size", awardBatchSize,
		"gap_threshold", gapThreshold,
		"issuer_tick_hours", issuerTickHours,
		"issuer_batch_size", issuerBatchSize,
		"digest_tick_hours", digestTickHours,
		"apify", apify.IsAvailable(),
		"seatsaero", seatsAero.IsAvailable(),
		"anthropic_summarize", os.Getenv("ANTHROPIC_API_KEY") != "",
	)

	// Run an immediate sweep on boot, then enter the steady-state tickers.
	// Every sweep is panic-isolated: a panic in one (e.g. a nil deref on a
	// scrubbed recipient) must not take down award-watch + digests +
	// cleanup together and stop all crons until a manual restart.
	if awardWatchEnabled && awardSweepAllowed(ctx, log, workerQuota) {
		safely(log, "award", func() {
			runAwardSweep(ctx, log, watchRepo, pushRepo, cardRepo, awardSearch, mailer, pusher, awardBatchSize, gapThreshold)
		})
	}
	safely(log, "issuer", func() { runIssuerSweep(ctx, log, issuerWatch, issuerBatchSize) })
	safely(log, "issuer-digest", func() { digestSvc.RunSweep(ctx, log, time.Now()) })
	safely(log, "missed-rewards-digest", func() { missedRewardsDigestSvc.RunSweep(ctx, log, time.Now()) })
	safely(log, "offer-expiry", func() { offerExpirySvc.RunSweep(ctx, log, time.Now()) })
	safely(log, "promo-sentinel", func() { promoSvc.RunSweep(ctx, log) })
	safely(log, "promo-source-recheck", func() { promoSvc.RecheckSources(ctx, log) })
	safely(log, "account-cleanup", func() { accountCleanupSvc.RunSweep(ctx, log) })

	awardTicker := time.NewTicker(time.Duration(awardTickHours) * time.Hour)
	defer awardTicker.Stop()
	issuerTicker := time.NewTicker(time.Duration(issuerTickHours) * time.Hour)
	defer issuerTicker.Stop()
	digestTicker := time.NewTicker(time.Duration(digestTickHours) * time.Hour)
	defer digestTicker.Stop()
	promoTicker := time.NewTicker(time.Duration(promoTickHours) * time.Hour)
	defer promoTicker.Stop()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	for {
		select {
		case <-stop:
			log.Info("shutdown signal received, stopping worker")
			return
		case <-awardTicker.C:
			if awardWatchEnabled && awardSweepAllowed(ctx, log, workerQuota) {
				safely(log, "award", func() {
					runAwardSweep(ctx, log, watchRepo, pushRepo, cardRepo, awardSearch, mailer, pusher, awardBatchSize, gapThreshold)
				})
			}
		case <-issuerTicker.C:
			safely(log, "issuer", func() { runIssuerSweep(ctx, log, issuerWatch, issuerBatchSize) })
		case <-digestTicker.C:
			safely(log, "issuer-digest", func() { digestSvc.RunSweep(ctx, log, time.Now()) })
			safely(log, "missed-rewards-digest", func() { missedRewardsDigestSvc.RunSweep(ctx, log, time.Now()) })
			safely(log, "offer-expiry", func() { offerExpirySvc.RunSweep(ctx, log, time.Now()) })
			safely(log, "account-cleanup", func() { accountCleanupSvc.RunSweep(ctx, log) })
			// Valuation refresh runs in the same daily slot. The 7-day staleness
			// threshold is honored by checking the freshness chip in the UI
			// rather than gating here — running daily costs ~0 since the
			// rescan is a bounded ~27-row sweep.
			safely(log, "valuation-refresh", func() { valuationRefreshSvc.RunSweep(ctx, log) })
		case <-promoTicker.C:
			safely(log, "promo-sentinel", func() { promoSvc.RunSweep(ctx, log) })
			safely(log, "promo-source-recheck", func() { promoSvc.RecheckSources(ctx, log) })
		}
	}
}

// safely runs one sweep with panic isolation. A panic in any sweep is
// logged and contained so the worker process keeps running and the other
// crons (award-watch, digests, cleanup, valuation) are unaffected.
func safely(log *slog.Logger, name string, fn func()) {
	defer func() {
		if r := recover(); r != nil {
			log.Error("sweep panicked — isolated; other sweeps unaffected",
				"sweep", name, "panic", r)
		}
	}()
	fn()
}

// workerApifyReservePct of the monthly Apify budget is reserved for
// interactive user-facing searches; the worker's bulk award sweep yields when
// remaining quota drops to/below it, so a large award_watch table can't
// black out live availability for paying users.
const workerApifyReservePct = 30

// awardSweepAllowed reports whether the worker may run its paid award sweep
// this cycle. Unlike the user-facing path (which fails OPEN on a Redis error to
// keep chat/search available), this BACKGROUND sweep fails CLOSED when the
// quota is unreadable: with no way to verify remaining budget, skipping is the
// safe choice — it protects against blind paid spend during a Redis outage,
// and the sweep simply resumes next cycle once Redis recovers (alerts are
// delayed, never lost). Unlimited (-1) is allowed.
func awardSweepAllowed(ctx context.Context, log *slog.Logger, q *quota.Client) bool {
	rem, err := q.Remaining(ctx, "apify")
	if err != nil {
		log.Warn("award sweep skipped — quota unreadable; failing closed to protect paid spend", "err", err)
		return false
	}
	if rem < 0 {
		return true // unlimited provider
	}
	reserve := quota.FreeTierLimits["apify"] * workerApifyReservePct / 100
	if rem <= reserve {
		log.Warn("award sweep skipped — reserving Apify quota for interactive users",
			"remaining", rem, "reserve", reserve)
		return false
	}
	return true
}

// runIssuerSweep delegates to the IssuerWatchService and logs the rollup.
// Failures of one page never poison the whole sweep — the service handles
// per-page failures internally.
func runIssuerSweep(ctx context.Context, log *slog.Logger, svc *service.IssuerWatchService, batchSize int) {
	res, err := svc.SweepAll(ctx, batchSize)
	if err != nil {
		log.Error("issuer sweep failed", "err", err)
		return
	}
	log.Info("issuer sweep done",
		"checked", res.PagesChecked,
		"changed", res.PagesChanged,
		"unchanged", res.PagesUnchanged,
		"failed", res.PagesFailed,
	)
}

// runAwardSweep pulls the next batch of stalest watches and probes each one.
func runAwardSweep(
	ctx context.Context,
	log *slog.Logger,
	watchRepo *repo.AwardWatchRepo,
	pushRepo *repo.PushRepo,
	cardRepo *repo.CardRepo,
	awardSearch *service.AwardSearchService,
	mailer service.Mailer,
	pusher service.Pusher,
	batchSize int,
	gapThreshold int,
) {
	_ = cardRepo // reserved for richer alert messages (issuer/program names)

	watches, err := watchRepo.ListActive(ctx, batchSize)
	if err != nil {
		log.Error("list active watches failed", "err", err)
		return
	}
	log.Info("sweep starting", "count", len(watches))

	for _, w := range watches {
		// Each probe is wrapped in its own timeout to keep one stuck Apify
		// run from blocking the whole sweep.
		probeCtx, probeCancel := context.WithTimeout(ctx, 3*time.Minute)
		probeOne(probeCtx, log, watchRepo, pushRepo, awardSearch, mailer, pusher, w, gapThreshold)
		probeCancel()
	}
	log.Info("sweep done")
}

func probeOne(
	ctx context.Context,
	log *slog.Logger,
	watchRepo *repo.AwardWatchRepo,
	pushRepo *repo.PushRepo,
	awardSearch *service.AwardSearchService,
	mailer service.Mailer,
	pusher service.Pusher,
	w model.AwardWatch,
	gapThreshold int,
) {
	results, err := awardSearch.Search(ctx, model.AwardSearchRequest{
		Origin:      w.Origin,
		Destination: w.Destination,
		Date:        w.DepartDate,
		FlexDays:    w.FlexDays,
		Cabin:       w.Cabin,
		Passengers:  1,
		// Award watches are a Pro feature; the probe MUST run as Pro so the
		// Apify live-award source (Pro-gated inside Search) actually executes.
		// Without this every probe skipped Apify, found no availability, and no
		// alert ever fired — the entire watch feature was silently inert on an
		// Apify-only worker deployment.
		IsPro: true,
		// Worker queries are wallet-agnostic — pass empty SessionID.
	})
	if err != nil {
		log.Warn("probe failed", "watch_id", w.ID, "err", err)
		_ = watchRepo.RecordCheckFailure(ctx, w.ID)
		return
	}

	// Find the cheapest result for this watch's program. If none, this is a
	// "no availability" probe — record it as such.
	var minPoints *int
	for _, r := range results {
		if r.Program != w.ProgramSlug {
			continue
		}
		if minPoints == nil || r.PointsCost < *minPoints {
			p := r.PointsCost
			minPoints = &p
		}
	}

	if err := watchRepo.RecordCheck(ctx, w.ID, minPoints); err != nil {
		log.Warn("record check failed", "watch_id", w.ID, "err", err)
		return
	}

	if minPoints == nil {
		log.Info("no availability", "watch_id", w.ID, "route", w.Origin+"→"+w.Destination, "cabin", w.Cabin)
		return
	}

	// Decide whether this probe is alert-worthy:
	//   1. A user-supplied max_points threshold has been beaten.
	//   2. The price has dropped by at least `gapThreshold` points since the
	//      last probe — even if no max was set, a big drop is interesting.
	alertMessage := ""
	if w.MaxPoints != nil && *minPoints <= *w.MaxPoints {
		alertMessage = fmt.Sprintf(
			"%s→%s %s: %d pts is at or under your %d max — book now.",
			w.Origin, w.Destination, w.Cabin, *minPoints, *w.MaxPoints,
		)
	} else if w.LastMinPoints != nil && *w.LastMinPoints-*minPoints >= gapThreshold {
		alertMessage = fmt.Sprintf(
			"%s→%s %s dropped %d → %d pts (saved %d).",
			w.Origin, w.Destination, w.Cabin, *w.LastMinPoints, *minPoints, *w.LastMinPoints-*minPoints,
		)
	}

	if alertMessage != "" {
		// Capture the previous alert timestamp BEFORE RecordAlert overwrites
		// it so the cooldown check sees the right value. Without this, every
		// sweep would email the user.
		prevAlertAt := w.LastAlertAt
		if err := watchRepo.RecordAlert(ctx, w.ID, alertMessage); err != nil {
			log.Warn("record alert failed", "watch_id", w.ID, "err", err)
			return
		}
		log.Info("alert", "watch_id", w.ID, "msg", alertMessage)

		if shouldEmailForAlert(prevAlertAt, time.Now()) {
			sendAwardAlertEmail(ctx, log, watchRepo, mailer, w, alertMessage)
			sendAwardAlertPush(ctx, log, pushRepo, pusher, w, alertMessage)
		} else {
			log.Info("alert delivery skipped: cooldown", "watch_id", w.ID, "prev_alert_at", *prevAlertAt)
		}
	}
}

// ── env helpers (kept local to avoid pulling in cmd/api's package) ──────────

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		slog.Error("required env var not set", "key", key)
		os.Exit(1)
	}
	return v
}
