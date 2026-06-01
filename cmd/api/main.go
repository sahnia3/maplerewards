package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"

	"maplerewards/internal/cache"
	"maplerewards/internal/handler"
	"maplerewards/internal/health"
	"maplerewards/internal/knowledge"
	mw "maplerewards/internal/middleware"
	"maplerewards/internal/observability"
	"maplerewards/internal/quota"
	"maplerewards/internal/repo"
	"maplerewards/internal/service"
)

// jwtSecret is loaded from the JWT_SECRET environment variable.
// It's used for signing and validating access tokens.
var jwtSecret string

// devJWTFallback is the in-tree dev secret. The startup check fails fast if
// this leaks into production (APP_ENV=production with JWT_SECRET unset/equal
// to this value).
const devJWTFallback = "dev-jwt-secret-change-me-in-production"

func main() {
	_ = godotenv.Load()

	// Log to stdout only. File logging on a fixed path was a disk-fill DoS
	// vector (mode 0644, no rotation, potential PII) and broke under container
	// orchestrators that expect logs on stdout. Operators who want a file sink
	// should capture stdout via systemd/journald/k8s/docker logging drivers.
	//
	// The slog handler is tee'd through observability.SentryHandler so any
	// ERROR-level record also ships to Sentry (no-op when SENTRY_DSN unset).
	baseHandler := slog.NewJSONHandler(os.Stdout, nil)
	observability.SetDefault(observability.NewReporter(observability.Config{
		DSN:         os.Getenv("SENTRY_DSN"),
		Environment: getEnv("APP_ENV", "development"),
		Release:     getEnv("GIT_COMMIT", "dev"),
		ServerName:  getEnv("HOSTNAME", "maple-api"),
	}))
	log := slog.New(observability.NewSentryHandler(baseHandler))
	slog.SetDefault(log)

	// ── Postgres ──────────────────────────────────────────────────────────
	// Explicit pool sizing — pgxpool defaults to GREATEST(4, NumCPU) which
	// saturates instantly under even modest concurrency. Tunable via env so
	// we can pin per-environment without recompile.
	pgxCfg, err := pgxpool.ParseConfig(mustEnv("DATABASE_URL"))
	if err != nil {
		log.Error("postgres parse config failed", "err", err)
		os.Exit(1)
	}
	pgxCfg.MaxConns = int32(getEnvInt("DB_MAX_CONNS", 25))
	pgxCfg.MinConns = int32(getEnvInt("DB_MIN_CONNS", 2))
	pgxCfg.MaxConnLifetime = time.Duration(getEnvInt("DB_MAX_CONN_LIFETIME_SEC", 3600)) * time.Second
	pgxCfg.MaxConnIdleTime = time.Duration(getEnvInt("DB_MAX_CONN_IDLE_SEC", 1800)) * time.Second
	pgxCfg.HealthCheckPeriod = 60 * time.Second
	pool, err := pgxpool.NewWithConfig(context.Background(), pgxCfg)
	if err != nil {
		log.Error("postgres connect failed", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	if err := pool.Ping(context.Background()); err != nil {
		log.Error("postgres ping failed", "err", err)
		os.Exit(1)
	}
	log.Info("postgres connected")

	// Schema guard: surface the migration state at boot and refuse to serve on
	// a dirty (half-applied) schema. Migrations are applied out-of-band
	// (make migrate-up / a release step), so this catches the operator error of
	// deploying new code against an un-migrated or partially-migrated database.
	{
		var schemaVersion uint
		var schemaDirty bool
		err := pool.QueryRow(context.Background(),
			"SELECT version, dirty FROM schema_migrations LIMIT 1").Scan(&schemaVersion, &schemaDirty)
		switch {
		case err != nil:
			// No schema_migrations row/table = migrations have never run.
			log.Error("schema_migrations not found — run migrations before starting (make migrate-up)", "err", err)
			os.Exit(1)
		case schemaDirty:
			log.Error("database schema is DIRTY (a migration failed partway) — fix the migration and clear the dirty flag before serving", "version", schemaVersion)
			os.Exit(1)
		default:
			log.Info("schema migrations applied", "version", schemaVersion)
		}
	}

	// ── Redis ─────────────────────────────────────────────────────────────
	// Prefer REDIS_URL (Railway/Upstash/etc.) over discrete ADDR/PASSWORD so a
	// managed Redis connection string just works instead of silently falling
	// back to localhost.
	redisOpt, redisErr := cache.OptionsFromEnv()
	if redisErr != nil {
		log.Error("invalid redis configuration", "err", redisErr)
		os.Exit(1)
	}
	rdb := redis.NewClient(redisOpt)
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		log.Error("redis ping failed", "err", err)
		os.Exit(1)
	}
	log.Info("redis connected")

	redisCache := cache.New(rdb)
	quotaClient := quota.New(rdb)

	// ── Repos ─────────────────────────────────────────────────────────────
	cardRepo := repo.NewCardRepo(pool)
	walletRepo := repo.NewWalletRepo(pool)
	valuationRepo := repo.NewValuationRepo(pool)
	transferRepo := repo.NewTransferRepo(pool)
	spendRepo := repo.NewSpendRepo(pool)
	authRepo := repo.NewAuthRepo(pool)
	bonusRepo := repo.NewBonusRepo(pool)
	creditRepo := repo.NewCreditRepo(pool)
	sqcRepo := repo.NewSQCRepo(pool)
	awardWatchRepo := repo.NewAwardWatchRepo(pool)
	buyPromoRepo := repo.NewBuyPromoRepo(pool)
	devalRepo := repo.NewDevaluationRepo(pool)
	stackRepo := repo.NewStackRepo(pool)
	cardValueRepo := repo.NewCardValueRepo(pool)
	tangerineRepo := repo.NewTangerineRepo(pool)
	issuerPageRepo := repo.NewIssuerPageRepo(pool)
	loyaltyAccountRepo := repo.NewLoyaltyAccountRepo(pool)
	cardOfferRepo := repo.NewCardOfferRepo(pool)
	affiliateRepo := repo.NewAffiliateRepo(pool)
	applicationRepo := repo.NewApplicationRepo(pool)

	// ── Services ──────────────────────────────────────────────────────────
	// JWT_SECRET length floor: 32 chars (HS256 best-practice). A 10-char
	// password-style secret is brute-forceable; require operators to use
	// `openssl rand -hex 32` (64 chars) or equivalent. Boot fails fast in
	// production rather than silently accepting weak secrets.
	const minJWTSecretLen = 32
	appEnv := getEnv("APP_ENV", "development")
	jwtSecret = getEnv("JWT_SECRET", "")
	if appEnv == "production" {
		if jwtSecret == "" || jwtSecret == devJWTFallback {
			log.Error("JWT_SECRET must be set to a non-default value when APP_ENV=production")
			os.Exit(1)
		}
		if len(jwtSecret) < minJWTSecretLen {
			log.Error("JWT_SECRET too short for production",
				"len", len(jwtSecret), "min", minJWTSecretLen,
				"hint", "generate with `openssl rand -hex 32`")
			os.Exit(1)
		}
	} else if jwtSecret == "" {
		log.Warn("JWT_SECRET unset; using dev fallback (DO NOT USE IN PRODUCTION)")
		jwtSecret = devJWTFallback
	} else if len(jwtSecret) < minJWTSecretLen {
		log.Warn("JWT_SECRET shorter than recommended minimum",
			"len", len(jwtSecret), "min", minJWTSecretLen)
	}

	// STRIPE_WEBHOOK_SECRET must be present in production. Without it the
	// webhook handler cannot verify Stripe's signature, and an
	// unauthenticated POST of a forged checkout.session.completed would
	// grant arbitrary users Pro. Fail fast rather than launch an open
	// free-Pro endpoint (same posture as the JWT/CORS gates above).
	if appEnv == "production" && getEnv("STRIPE_WEBHOOK_SECRET", "") == "" {
		log.Error("STRIPE_WEBHOOK_SECRET must be set when APP_ENV=production (webhook signature verification cannot be skipped in prod)")
		os.Exit(1)
	}

	// Redis auth must be present in production. Redis caches full wallets
	// (point balances, card IDs, nicknames) and valuations; an
	// unauthenticated Redis on a shared network is a PII disclosure / cache
	// poisoning vector. Fail fast rather than run with an open cache. The
	// password may come from REDIS_PASSWORD or be embedded in REDIS_URL.
	if appEnv == "production" && !cache.HasRedisAuth() {
		log.Error("Redis auth required when APP_ENV=production: set REDIS_PASSWORD or a password in REDIS_URL (cache holds wallet PII; unauthenticated Redis is a disclosure vector)")
		os.Exit(1)
	}

	walletSvc := service.NewWalletService(walletRepo, cardRepo, spendRepo, bonusRepo, redisCache)
	optimizerSvc := service.NewOptimizerService(cardRepo, walletRepo, valuationRepo, transferRepo, spendRepo, redisCache)
	tavilySvc := service.NewTavilyService(getEnv("TAVILY_API_KEY", ""), quotaClient)

	// Load YAML knowledge base; fall back to hardcoded data on error.
	// KB_DIR overrides the default location so the binary can run outside
	// the repo root (e.g. inside a container at /app/internal/knowledge).
	kbDir := getEnv("KB_DIR", "internal/knowledge")
	kb, kbErr := knowledge.Load(filepath.Join(kbDir, "rewards.yaml"))
	if kbErr != nil {
		log.Warn("could not load knowledge base, using hardcoded fallback",
			"err", kbErr, "kb_dir", kbDir)
	}
	// Load supplementary credit card strategies knowledge base.
	if kb != nil {
		if err := kb.LoadSupplementary(filepath.Join(kbDir, "credit_card_strategies.yaml")); err != nil {
			log.Warn("could not load credit card strategies KB", "err", err)
		}
	}

	recommenderSvc := service.NewRecommenderService(cardRepo)
	authSvc := service.NewAuthService(authRepo, walletRepo, jwtSecret)
	missedRewardsSvc := service.NewMissedRewardsService(walletRepo, spendRepo, optimizerSvc)
	creditsSvc := service.NewCreditsService(walletRepo, creditRepo)
	renewalSvc := service.NewRenewalService(walletRepo, spendRepo, creditRepo, cardRepo)
	transferSweetSpotSvc := service.NewTransferSweetSpotService(walletRepo, loyaltyAccountRepo, cardRepo, transferRepo)
	sqcSvc := service.NewSQCService(walletRepo, sqcRepo)
	awardWatchSvc := service.NewAwardWatchService(walletRepo, awardWatchRepo)
	buyPointsSvc := service.NewBuyPointsService(buyPromoRepo)
	devalSvc := service.NewDevaluationService(walletRepo, devalRepo)
	feedSvc := service.NewFeedAggregatorService(redisCache, log)
	stackSvc := service.NewStackService(walletRepo, stackRepo, optimizerSvc)
	cardValueSvc := service.NewCardValueService(walletRepo, cardValueRepo)
	tangerineSvc := service.NewTangerineService(tangerineRepo)
	loyaltyAccountSvc := service.NewLoyaltyAccountService(walletRepo, loyaltyAccountRepo)
	expiryGuardianSvc := service.NewExpiryGuardianService(walletRepo, loyaltyAccountRepo, loyaltyAccountRepo, cardRepo)
	csvImportSvc := service.NewCSVImportService(walletSvc)
	cardOfferSvc := service.NewCardOfferService(walletRepo, cardOfferRepo)
	emailVerifyRepo := repo.NewEmailVerifyRepo(pool)
	// Single project-wide Mailer. Picks ResendMailer when RESEND_API_KEY is
	// set, else falls back to LogMailer (logs preview to stdout). All future
	// notification-rail consumers will share this instance.
	mailer := service.NewMailerFromEnv()
	emailVerifySvc := service.NewEmailVerifyService(emailVerifyRepo, mailer)

	// Flight data services: Apify (live awards), SerpAPI (cash prices), Seats.aero (awards, optional)
	apifySvc := service.NewApifyAwardService(getEnv("APIFY_TOKEN", ""), quotaClient)
	serpSvc := service.NewSerpAPIService(getEnv("SERPAPI_KEY", ""), quotaClient)
	seatsAeroSvc := service.NewSeatsAeroService(getEnv("SEATSAERO_API_KEY", ""))

	tripSvc := service.NewTripService(walletRepo, cardRepo, transferRepo, tavilySvc, serpSvc, apifySvc, redisCache, kb)
	awardSearchSvc := service.NewAwardSearchService(apifySvc, seatsAeroSvc, serpSvc, walletRepo, kb, redisCache)

	aiSvc := service.NewAIService(
		getEnv("ANTHROPIC_API_KEY", ""),
		walletRepo, cardRepo, transferRepo, valuationRepo,
		optimizerSvc, tavilySvc, kb, awardSearchSvc, serpSvc,
		service.ProServices{
			BuyPoints:     buyPointsSvc,
			Stack:         stackSvc,
			MissedRewards: missedRewardsSvc,
			SQC:           sqcSvc,
			Devaluation:   devalSvc,
			AwardWatch:    awardWatchSvc,
		},
	)

	// Apify smoke-test goroutine. Fires every 24h against a known query
	// (YYZ→LHR business) and warns if the Apify schema drifts again. Catches
	// the next totalDuration-style breakage before users do. Cadence was 6h
	// (~120 paid scrapes/mo just for monitoring); 24h still catches drift
	// well within a day while cutting that fixed cost ~75%.
	// Uses Background() — the goroutine runs for the full process lifetime and
	// is killed cleanly when the OS terminates the process on shutdown.
	if apifySvc.IsAvailable() {
		smoke := health.NewApifySmokeChecker(awardSearchSvc, 24*time.Hour)
		// Admin alert path: when a smoke run fails, email ADMIN_EMAIL (24h
		// throttle) and ERROR-log so Sentry picks it up. No-op when either
		// is unset — the slog.Error path still runs.
		if adminEmail := strings.TrimSpace(os.Getenv("ADMIN_EMAIL")); adminEmail != "" {
			smoke = smoke.WithAlerts(mailer, adminEmail)
		}
		smoke.Start(context.Background())
	}

	// ── Repos that depend on services being wired ────────────────────────
	chatRepo := repo.NewChatRepo(pool)

	// ── Admin allow-list ─────────────────────────────────────────────────
	// ADMIN_EMAILS is a comma-separated list of emails that may hit the
	// /api/v1/admin/* routes. Empty list = admin routes deny every request.
	adminEmails := splitCSV(getEnv("ADMIN_EMAILS", ""))

	// ── Handlers ──────────────────────────────────────────────────────────
	cardH := handler.NewCardHandler(cardRepo)
	affiliateH := handler.NewAffiliateHandler(affiliateRepo, getEnv("FRONTEND_URL", ""))
	applicationSvc := service.NewApplicationService(applicationRepo, walletRepo, cardRepo)
	applicationH := handler.NewApplicationHandler(applicationSvc)
	// Welcome-bonus / churn planner — best next card to apply for. Reuses
	// applicationSvc.CheckEligibility for the cooldown verdict rather than
	// reimplementing issuer rules.
	churnSvc := service.NewChurnPlannerService(walletRepo, cardRepo, spendRepo, applicationSvc)
	churnH := handler.NewChurnPlannerHandler(churnSvc)
	// Pro: wallet simulator — net annual-value impact of adding and/or dropping
	// cards, re-pricing logged spend per category against a hypothetical wallet.
	simulatorSvc := service.NewSimulatorService(walletRepo, spendRepo, cardRepo)
	simulatorH := handler.NewSimulatorHandler(simulatorSvc)
	walletH := handler.NewWalletHandler(walletSvc)
	optimizerH := handler.NewOptimizerHandler(optimizerSvc, walletRepo)
	spendH := handler.NewSpendHandler(walletSvc)
	// Daily per-user Claude token budget. Free 50K/day, Pro 500K/day. Gates
	// /chat with a 429 + Retry-After header when exceeded. Without this any
	// authenticated user can burn through our Anthropic budget in hours.
	aiBudget := service.NewAIBudget(rdb)
	chatH := handler.NewChatHandlerWithRepo(aiSvc, rdb, walletRepo, chatRepo).WithBudget(aiBudget)

	// DSAR / right-of-access export (PIPEDA + GDPR Art. 15).
	dataExportSvc := service.NewDataExportService(pool, walletRepo, authRepo)
	accountExportH := handler.NewAccountExportHandler(dataExportSvc)
	adminValuationH := handler.NewAdminValuationHandler(valuationRepo, redisCache)
	adminQuotaH := handler.NewAdminQuotaHandler(quotaClient)
	adminMetricsH := handler.NewAdminMetricsHandler()
	adminUsersH := handler.NewAdminUsersHandler(authRepo, dataExportSvc)
	summaryH := handler.NewSummaryHandler(walletRepo, transferRepo)
	programH := handler.NewProgramHandler(cardRepo, transferRepo)
	cardDetailH := handler.NewCardDetailHandler(cardRepo, transferRepo)
	recommendH := handler.NewRecommendHandler(recommenderSvc)
	authH := handler.NewAuthHandler(authSvc)
	emailVerifyH := handler.NewEmailVerifyHandler(emailVerifySvc)
	tripH := handler.NewTripHandler(tripSvc, walletRepo)
	awardH := handler.NewAwardSearchHandler(awardSearchSvc, walletRepo)
	bonusH := handler.NewBonusHandler(walletRepo, bonusRepo)
	portfolioH := handler.NewPortfolioHandler(walletRepo, cardRepo, spendRepo, transferRepo, optimizerSvc)
	missedH := handler.NewMissedRewardsHandler(missedRewardsSvc)
	creditsH := handler.NewCreditsHandler(creditsSvc)
	renewalH := handler.NewRenewalHandler(renewalSvc)
	transferSweetSpotH := handler.NewTransferSweetSpotHandler(transferSweetSpotSvc)
	sqcH := handler.NewSQCHandler(sqcSvc)
	awardWatchH := handler.NewAwardWatchHandler(awardWatchSvc)
	buyPointsH := handler.NewBuyPointsHandler(buyPointsSvc)
	devalH := handler.NewDevaluationHandler(devalSvc)
	feedH := handler.NewFeedHandler(feedSvc)
	stackH := handler.NewStackHandler(stackSvc, walletRepo)
	cardValueH := handler.NewCardValueHandler(cardValueSvc)
	tangerineH := handler.NewTangerineHandler(tangerineSvc)
	issuerChangesH := handler.NewIssuerChangesHandler(issuerPageRepo)
	loyaltyAccountH := handler.NewLoyaltyAccountHandler(loyaltyAccountSvc)
	expiryGuardianH := handler.NewExpiryGuardianHandler(expiryGuardianSvc)
	csvImportH := handler.NewCSVImportHandler(csvImportSvc)
	cardOfferH := handler.NewCardOfferHandler(cardOfferSvc)
	compareH := handler.NewCompareHandler(cardRepo, transferRepo)

	// Welcome-bonus Mission Control. Enriches the raw bonus tracker with
	// velocity, miss-risk projection, and per-card recommendations.
	wbMissionSvc := service.NewWelcomeBonusMissionService(walletRepo, bonusRepo)
	wbMissionH := handler.NewWelcomeBonusMissionHandler(wbMissionSvc)

	// Transfer-promo log. Worker populates via the Promo Sentinel sweep;
	// the public endpoint just reads the latest active rows.
	transferBonusRepo := repo.NewTransferBonusRepo(pool)
	transferPromoH := handler.NewTransferPromoHandler(transferBonusRepo)

	// Web push: shared Pusher (WebPushSender when VAPID keys set, else stub),
	// repo for subscriptions, handler exposing subscribe / unsubscribe / test
	// / public-key endpoints. Worker reuses the same Pusher to fan out alerts
	// alongside the email rail.
	pushRepo := repo.NewPushRepo(pool)
	pusher := service.NewPusherFromEnv()
	if !pusher.IsAvailable() {
		log.Warn("VAPID keys not set — push notifications will be logged only, not delivered")
	}
	pushH := handler.NewPushHandler(pushRepo, pusher)

	billingSvc := service.NewBillingService(authRepo, mailer)
	billingH := handler.NewBillingHandler(billingSvc)
	emailH := handler.NewEmailHandler(authRepo)

	// ── Router ────────────────────────────────────────────────────────────
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	// Trusted-proxy CIDR list — comma-separated. Empty means XFF is never
	// trusted (correct for direct-to-internet). Behind Cloudflare/ALB/Nginx
	// set TRUSTED_PROXIES to the proxy's IP ranges.
	trustedProxies := strings.Split(getEnv("TRUSTED_PROXIES", ""), ",")
	r.Use(mw.TrustedProxyRealIP(trustedProxies))
	// Structured request log: one slog JSON record per request, tagged with
	// request_id + user_id + status + bytes. Replaces chi's human-readable
	// Logger so log aggregation (Loki/Cloudwatch) can parse cleanly.
	r.Use(mw.HTTPRequestLogger())
	r.Use(middleware.Recoverer)
	r.Use(mw.LatencyRecorder)
	r.Use(corsMiddleware)

	// Rate limit per IP per minute. This is a GLOBAL, coarse anti-flood gate
	// applied to every route (incl. GETs). It is NOT the precise abuse control
	// — that is the per-authenticated-user limiter below (150 free / 600 Pro).
	// 60/min in prod (LAUNCH-ISSUES.md P0.6) tripped during ORDINARY
	// navigation: a single multi-widget SPA page fires ~10 parallel reads, so
	// ~6 page loads exhausted the 60-token burst, and shared NAT/corporate
	// IPs hit it collectively. Raised to a navigation-realistic 180/min
	// (3 req/s sustained, 180 burst) — still bounds anonymous flooding while
	// the per-user limiter handles authenticated abuse. Override via
	// RATE_LIMIT_PER_MINUTE.
	defaultRPM := 300
	if appEnv == "production" {
		defaultRPM = 180
	}
	rpm := getEnvInt("RATE_LIMIT_PER_MINUTE", defaultRPM)
	rl := mw.NewRateLimiter(rpm, time.Minute)
	r.Use(rl.Handler)

	// Liveness: process is up.
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`)) //nolint:errcheck
	})

	// Readiness: dependencies are reachable. Used by load balancers, k8s
	// readinessProbe, and Dockerfile HEALTHCHECK.
	r.Get("/ready", func(w http.ResponseWriter, req *http.Request) {
		ctx, cancel := context.WithTimeout(req.Context(), 2*time.Second)
		defer cancel()
		if err := pool.Ping(ctx); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			w.Write([]byte(`{"status":"unready","error":"postgres"}`)) //nolint:errcheck
			return
		}
		if err := rdb.Ping(ctx).Err(); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			w.Write([]byte(`{"status":"unready","error":"redis"}`)) //nolint:errcheck
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ready"}`)) //nolint:errcheck
	})

	// Per-user rate limit — applied inside /api/v1 so it sees JWT context.
	// Tighter than per-IP because each authenticated request often triggers
	// expensive downstream calls (LLM, Apify, SerpAPI). Pro users get 4×
	// the budget free users do.
	//
	// These are anti-hammering limits, NOT the LLM cost ceiling — that is
	// enforced independently per user/day by the AI token budget
	// (service/ai_budget.go) plus a per-request token cap. So this limiter
	// can be generous: the old 60/240 tripped real humans because
	// data-dense pages fire 6–8 XHRs each and React StrictMode double-
	// invokes effects in dev, so ordinary browsing blew past 240/min and
	// surfaced USER_RATE_LIMITED mid-navigation. 150/600 still stops a
	// runaway script while leaving headroom for a human using the app.
	freeUserRPM := getEnvInt("FREE_USER_RPM", 150)
	proUserRPM := getEnvInt("PRO_USER_RPM", 600)
	userRL := mw.NewUserRateLimiter(freeUserRPM, proUserRPM, time.Minute)

	r.Route("/api/v1", func(r chi.Router) {
		// Apply optional JWT middleware to all routes — sets user context if a
		// token is present, but doesn't reject anonymous requests. Routes that
		// require auth or session ownership opt in via sub-groups below.
		r.Use(mw.JWTOptional(authSvc))
		// Per-user rate limit (no-op for anonymous requests; per-IP limit at
		// the global level still applies to those).
		r.Use(userRL.Handler)
		// Cap request bodies at 1 MB by default — generous for JSON payloads,
		// tight enough that an attacker can't burn memory by uploading 1 GB
		// to /chat or /optimize. Routes that legitimately need more (CSV
		// import) override via per-group BodyLimit further down.
		r.Use(mw.BodyLimit(mw.BodyLimitJSON))

		// ── Public read-only catalog (anonymous OK) ─────────────────────
		r.Get("/cards", cardH.List)
		r.Get("/cards/{id}", cardH.Get)
		r.Get("/cards/{id}/detail", cardDetailH.GetDetail)
		r.Get("/categories", cardH.ListCategories)
		r.Get("/programs", programH.List)
		r.Get("/programs/{slug}/detail", programH.GetDetail)
		r.Get("/devaluations", devalH.List)
		r.Get("/feed/articles", feedH.List)
		r.Get("/issuer-changes", issuerChangesH.List)
		r.Get("/merchants", stackH.ListMerchants)
		r.Get("/tangerine-categories", tangerineH.List)
		r.Get("/buy-points/promos", buyPointsH.ListPromos)

		// Web push: VAPID public key is genuinely public — the browser
		// fetches it before calling PushManager.subscribe(). No auth.
		r.Get("/push/vapid-public-key", pushH.PublicVAPIDKey)

		// Affiliate redirect — public, logs click + 302s to the affiliate URL.
		r.Get("/affiliate/click/{cardID}", affiliateH.Click)

		// Aeroplan June 1 2026 lock-in calculator — public utility tool.
		// Pure read-only filter over a static chart of pre/post-hike routings.
		r.Get("/tools/aeroplan-june-1", handler.NewAeroplanJune1Handler().Query)

		// Side-by-side card comparison. Powers SSG pages at
		// /compare/[a]/[b]. Both params accept either UUID or slug.
		r.Get("/compare/{a}/{b}", compareH.Compare)

		// Transfer-bonus promo log (Promo Sentinel output). Public read.
		r.Get("/transfer-promos/active", transferPromoH.ListActive)

		// ── Anonymous-friendly mutation endpoints (fast — ≤30s) ─────────
		// These are cheap, in-memory or single-query compute. Wrapped in a
		// 30s request-context timeout so a slowloris write can't pin the
		// process for the global 5-min server WriteTimeout.
		r.Group(func(r chi.Router) {
			r.Use(middleware.Timeout(30 * time.Second))
			// These cookie-auth-capable mutations carry no CSRF token; the
			// application/json gate (+ strict CORS) blocks cross-origin forgery.
			r.Use(mw.RequireJSONContentType)
			r.Post("/wallet", walletH.Create)
			r.Post("/optimize", optimizerH.GetBestCard)
			r.Post("/recommend", recommendH.Recommend)
		})

		// ── Long-running compute (chat tool-loop + trip planner) ────────
		// These legitimately run 60-180s (Apify polling, multi-round LLM
		// tool calls). They inherit the server WriteTimeout of 5 minutes.
		// IDOR for these is enforced by requireBodySessionOwner in the
		// handlers themselves; rate limit + body-size limit still apply.
		// application/json gate (+ strict CORS) is the CSRF defense for these
		// cookie-auth-capable, cost-incurring mutations that carry no CSRF token.
		r.Group(func(r chi.Router) {
			r.Use(mw.RequireJSONContentType)
			r.Post("/trip/evaluate", tripH.Evaluate)
			r.Post("/trip/award-search", awardH.Search)
			r.Post("/chat", chatH.Chat)
			r.Post("/chat/stream", chatH.ChatStream) // SSE — tool status pills + progressive events
		})

		// ── CSRF token issuer ───────────────────────────────────────────
		// The SPA hits this on first load (or whenever its cookie is gone)
		// to seed `mr_csrf`. Subsequent state-changing requests on the
		// CSRF-protected routes echo the cookie value back in the X-CSRF-
		// Token header — double-submit pattern.
		r.Get("/csrf", mw.IssueCSRFTokenHandler)

		// Email verification: token arrives from the user's inbox and is
		// posted back here. Anonymous endpoint — the user may not be
		// signed-in at the moment they click the link.
		r.Group(func(r chi.Router) {
			r.Use(mw.CSRFProtect)
			r.Post("/auth/verify-email", emailVerifyH.Verify)
		})

		// ── Auth (no JWT required to register/login/refresh) ─────────────
		// CSRF-protected: cross-origin attackers can't forge a login that
		// would set our cookies, can't bind a victim's account to their own
		// email, and can't burn a victim's refresh token through replay.
		// Stripe webhook is intentionally outside this group — it has its
		// own signature verification and would never have a CSRF cookie.
		r.Group(func(r chi.Router) {
			r.Use(mw.CSRFProtect)
			r.Post("/auth/register", authH.Register)
			r.Post("/auth/login", authH.Login)
			r.Post("/auth/google", authH.GoogleAuth)
			r.Post("/auth/refresh", authH.Refresh)
		})

		// Stripe webhook — public, signed by Stripe (verified in handler).
		r.Post("/billing/webhook", billingH.Webhook)

		// Email unsubscribe — public, HMAC-token-authenticated from the
		// one-click footer link (no JWT/CSRF by design; CASL low-friction).
		r.Post("/email/unsubscribe", emailH.Unsubscribe)

		// ── Authenticated user routes (JWT required + CSRF) ─────────────
		// Account-mutating routes get CSRF on top of JWT so a malicious site
		// embedded in a logged-in user's session can't escalate or destroy
		// the account behind their back. 30s request-context timeout — auth
		// flows (bcrypt + DB write) run in ~200ms; anything longer is bad.
		r.Group(func(r chi.Router) {
			r.Use(mw.JWTRequired(authSvc))
			r.Use(mw.CSRFProtect)
			r.Use(middleware.Timeout(30 * time.Second))
			r.Post("/auth/logout", authH.Logout)
			r.Get("/auth/me", authH.GetMe)
			r.Put("/auth/me", authH.UpdateMe)
			r.Delete("/auth/me", authH.DeleteMe)
			r.Post("/auth/change-password", authH.ChangePassword)
			r.Post("/auth/verify-email/send", emailVerifyH.SendVerification)
			r.Post("/billing/checkout", billingH.CreateCheckout)
			r.Post("/billing/portal", billingH.CreatePortal)

			// PIPEDA + GDPR Art. 15 right-of-access — full JSON dump of all
			// data we hold about this user. Behind JWT only (not CSRF) so it
			// can be hit as a plain GET from the browser.
			r.Get("/account/export", accountExportH.Export)

			// Web push subscription management — any authenticated user can
			// register/unregister a browser. The Test endpoint is gated to
			// Pro further down to avoid free-tier abuse.
			r.Post("/push/subscribe", pushH.Subscribe)
			r.Delete("/push/subscribe", pushH.Unsubscribe)
		})

		// ── Wallet-owner routes ─────────────────────────────────────────
		// RequireSessionOwner permits anonymous wallets (sessionID is the
		// bearer token) but requires JWT-matching ownership for any wallet
		// that has been claimed by an authenticated user. Closes the IDOR
		// class on every {sessionID} path-param route. 30s timeout because
		// wallet CRUD is fast — anything slower is a query-plan regression.
		r.Group(func(r chi.Router) {
			r.Use(mw.RequireSessionOwner(walletRepo))
			// CSRF on these wallet mutations: the JWT cookie is SameSite=None in
			// the cross-site prod profile, so without this a cross-origin page
			// could forge wallet/spend/balance writes (the SPA already sends the
			// X-CSRF-Token header). Safe methods pass through.
			r.Use(mw.CSRFProtect)
			r.Use(middleware.Timeout(30 * time.Second))

			// Wallet read + mutate
			r.Get("/wallet/{sessionID}", walletH.Get)
			r.Get("/wallet/{sessionID}/summary", summaryH.GetWalletSummary)
			r.Post("/wallet/{sessionID}/cards", walletH.AddCard)
			r.Delete("/wallet/{sessionID}/cards/{cardID}", walletH.RemoveCard)
			r.Put("/wallet/{sessionID}/cards/{cardID}/balance", walletH.UpdateBalance)
			r.Put("/wallet/{sessionID}/cards/{cardID}/details", walletH.UpdateCardDetails)

			// Spend tracking
			r.Post("/wallet/{sessionID}/spend", spendH.RecordSpend)
			r.Get("/wallet/{sessionID}/spend", spendH.ListSpendHistory)
			r.Get("/wallet/{sessionID}/spend/stats", spendH.GetSpendStats)
			// PIPEDA data-portability: CSV export of full spend history.
			r.Get("/wallet/{sessionID}/spend/export", spendH.ExportSpend)

			// Bulk CSV statement import (Plaid/Flinks substitute until partner
			// contract is in place). CSV uploads are bigger than ordinary JSON
			// payloads, so swap the body limit to the CSV ceiling for these
			// two routes only.
			r.Group(func(r chi.Router) {
				r.Use(mw.BodyLimit(mw.BodyLimitCSV))
				r.Post("/wallet/{sessionID}/spend/import/preview", csvImportH.Preview)
				r.Post("/wallet/{sessionID}/spend/import/commit", csvImportH.Commit)
			})

			// Bonus tracking (milestones)
			r.Get("/wallet/{sessionID}/bonuses", bonusH.ListBonuses)
			r.Post("/wallet/{sessionID}/bonuses/{cardID}/activate", bonusH.ActivateBonus)

			// Portfolio analysis
			r.Get("/wallet/{sessionID}/portfolio/analysis", portfolioH.GetAnalysis)

			// Devaluation list with personalized "your wallet" flag
			r.Get("/wallet/{sessionID}/devaluations", devalH.List)

			// Card application tracker + per-card eligibility.
			// Warns when applying again within an issuer's cooldown window
			// (RBC 90d, TD 365d, BMO 90d, etc. — see issuer_rules table).
			r.Get("/wallet/{sessionID}/applications", applicationH.List)
			r.Post("/wallet/{sessionID}/applications", applicationH.Create)
			r.Delete("/wallet/{sessionID}/applications/{applicationID}", applicationH.Delete)
			r.Get("/wallet/{sessionID}/cards/{cardID}/eligibility", applicationH.Eligibility)
		})

		// ── Pro-tier routes (JWT + Pro required + session ownership) ────
		// Free users that hit these by URL get 402 (Payment Required).
		r.Group(func(r chi.Router) {
			r.Use(mw.JWTRequired(authSvc))
			r.Use(mw.RequirePro())
			r.Use(mw.RequireSessionOwner(walletRepo))
			r.Use(mw.CSRFProtect)
			r.Use(middleware.Timeout(30 * time.Second))

			// Missed-rewards forensics
			r.Get("/wallet/{sessionID}/missed-rewards", missedH.GetMissedRewards)

			// Card credits + renewal countdown
			r.Get("/wallet/{sessionID}/credits", creditsH.ListCredits)
			r.Post("/wallet/{sessionID}/credits", creditsH.AddCredit)
			r.Post("/wallet/{sessionID}/credits/{creditDefID}/redeem", creditsH.RecordRedemption)

			// Pro: renewal optimizer — keep / use-credits / downgrade-or-cancel per card
			r.Get("/wallet/{sessionID}/renewal-optimizer", renewalH.GetRenewal)

			// Pro: transfer sweet-spot finder — best value-increasing transfer-
			// partner move per program the user holds points in
			r.Get("/wallet/{sessionID}/transfer-sweet-spots", transferSweetSpotH.GetSweetSpots)

			// Pro: welcome-bonus / churn planner — best next card to apply for,
			// gated by issuer cooldown eligibility + min-spend feasibility
			r.Get("/wallet/{sessionID}/churn-planner", churnH.GetPlan)

			// Pro: wallet simulator — net annual-value impact of adding and/or
			// dropping cards (re-prices logged spend per category, nets fees)
			r.Post("/wallet/{sessionID}/simulator", simulatorH.Simulate)

			// 2026 Aeroplan SQC projector
			r.Get("/wallet/{sessionID}/sqc-projection", sqcH.GetProjection)

			// June 1 2026 Aeroplan long-haul-business chart hike — per-user
			// dollar exposure projection. Drives the urgency banner.
			r.Get("/wallet/{sessionID}/devaluation/aeroplan-june-2026", devalH.ProjectAeroplan)

			// Welcome-Bonus Mission Control — velocity + miss-risk report.
			r.Get("/wallet/{sessionID}/welcome-bonus-mission", wbMissionH.Get)

			// Aeroplan availability watcher CRUD. The 4-hour sweep that probes
			// each active watch and emails/pushes when availability opens
			// lives in cmd/worker — run `make worker` alongside `make dev`.
			r.Get("/wallet/{sessionID}/award-watches", awardWatchH.List)
			r.Post("/wallet/{sessionID}/award-watches", awardWatchH.Create)
			r.Delete("/wallet/{sessionID}/award-watches/{watchID}", awardWatchH.Delete)

			// Annual card-value scorecard
			r.Get("/wallet/{sessionID}/card-value", cardValueH.Summary)

			// Loyalty-account aggregation (track programs without a co-branded card)
			r.Get("/wallet/{sessionID}/loyalty-accounts", loyaltyAccountH.List)
			r.Post("/wallet/{sessionID}/loyalty-accounts", loyaltyAccountH.Create)
			r.Put("/wallet/{sessionID}/loyalty-accounts/{accountID}", loyaltyAccountH.Update)
			r.Delete("/wallet/{sessionID}/loyalty-accounts/{accountID}", loyaltyAccountH.Delete)

			// Pro: points-expiry guardian — when balances lapse + how to reset the clock
			r.Get("/wallet/{sessionID}/expiry-guardian", expiryGuardianH.GetGuardian)

			// Card-linked offer tracker (Amex Offers / RBC Offers / Scene+)
			r.Get("/wallet/{sessionID}/offers", cardOfferH.List)
			r.Post("/wallet/{sessionID}/offers", cardOfferH.Create)
			r.Post("/wallet/{sessionID}/offers/{offerID}/used", cardOfferH.MarkUsed)
			r.Delete("/wallet/{sessionID}/offers/{offerID}", cardOfferH.Delete)
		})

		// ── Pro-tier compute endpoints (JWT + Pro, session_id in body) ──
		// These take session_id in the request body so RequireSessionOwner
		// can't enforce ownership at the middleware layer; handlers must
		// validate body session_id against JWT user. Until then, gating to
		// Pro at least restricts who can call them.
		r.Group(func(r chi.Router) {
			r.Use(mw.JWTRequired(authSvc))
			r.Use(mw.RequirePro())
			r.Use(mw.CSRFProtect)
			r.Use(middleware.Timeout(30 * time.Second))
			r.Post("/buy-points/evaluate", buyPointsH.Evaluate)
			r.Post("/stack-recommend", stackH.Recommend)

			// Self-send a synthetic push to every subscription belonging to
			// the calling user. Pro-gated so free users can't burn the
			// VAPID quota or use it as a probe surface.
			r.Post("/push/test", pushH.Test)
		})

		// ── Chat conversation history (JWT required) ─────────────────────
		// Server-side persistence of /chat replies for signed-in users.
		// Anonymous users have no history — sessions are stateless.
		r.Group(func(r chi.Router) {
			r.Use(mw.JWTRequired(authSvc))
			r.Get("/chat/conversations", chatH.ListConversations)
			r.Get("/chat/conversations/{id}/messages", chatH.GetMessages)
		})

		// ── Admin routes (JWT + admin allow-list + CSRF) ─────────────────
		// Empty ADMIN_EMAILS makes RequireAdmin deny every request, so
		// these endpoints are effectively disabled until explicitly
		// configured.
		r.Group(func(r chi.Router) {
			r.Use(mw.JWTRequired(authSvc))
			r.Use(mw.RequireAdmin(adminEmails))
			r.Use(mw.CSRFProtect)
			r.Use(middleware.Timeout(30 * time.Second))
			r.Post("/admin/valuations", adminValuationH.Push)
			r.Get("/admin/quota", adminQuotaH.Get)
			r.Get("/admin/metrics", adminMetricsH.Get)
			r.Get("/admin/users", adminUsersH.List)
			r.Get("/admin/users/{id}", adminUsersH.Get)
		})
	})

	// ── Server ────────────────────────────────────────────────────────────
	srv := &http.Server{
		Addr:    ":" + getEnv("PORT", "8080"),
		Handler: r,
		// ReadHeaderTimeout is the slowloris defense. It must be short and
		// independent of ReadTimeout/WriteTimeout — those are tuned for
		// legitimate slow bodies (large CSV uploads) and slow responses (SSE
		// chat streaming Apify polls for up to 5 minutes), respectively.
		ReadHeaderTimeout: 10 * time.Second,
		// ReadTimeout covers reading the full request body (generous for large bodies)
		ReadTimeout: 30 * time.Second,
		// WriteTimeout: the SSE chat stream legitimately writes for 60-180s on
		// flight+hotel prompts (parallel Apify polling 30-90s each + round 2 LLM
		// synthesis 30-60s). 5min handles the slowest realistic chat without
		// exposing the server to long-hold DoS, because ReadHeaderTimeout above
		// already kills slowloris at the header stage.
		WriteTimeout: 5 * time.Minute,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		log.Info("server starting", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Error("server error", "err", err)
			os.Exit(1)
		}
	}()

	// ── Graceful shutdown ─────────────────────────────────────────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Info("shutting down...")

	// Stop the cleanup goroutines so the process can exit cleanly without
	// orphaned tickers. Safe to call after Shutdown — the limiters refuse
	// no requests once the server has closed.
	rl.Stop()
	userRL.Stop()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	srv.Shutdown(ctx) //nolint:errcheck
}

// splitCSV trims and splits a comma-separated string into a non-empty slice
// of values. Returns nil on empty input so callers can length-check.
func splitCSV(s string) []string {
	if s = strings.TrimSpace(s); s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// corsMiddleware emits a single exact-match `Access-Control-Allow-Origin`
// pulled from the CORS_ORIGIN env. Wildcards are rejected in production
// (the startup check below refuses to boot if the value is unsafe), so
// this handler may safely echo the configured value back as-is.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", getEnv("CORS_ORIGIN", "http://localhost:3000"))
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-CSRF-Token")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// init runs before main() and validates security-critical env vars. Refusing
// to boot is the right default — silent CORS misconfiguration in production
// has historically been the single most damaging misconfig in this category.
//
// Validation runs in ALL environments. Staging/dev are NOT a "free pass":
// they share infrastructure with production, share auth cookies, and a
// CORS_ORIGIN=* in staging is just as dangerous as in production. The only
// difference is that dev allows http:// origins (for localhost) whereas
// production requires https://.
func init() {
	isProd := strings.EqualFold(os.Getenv("APP_ENV"), "production")
	origin := strings.TrimSpace(os.Getenv("CORS_ORIGIN"))

	if isProd {
		switch {
		case origin == "":
			slog.Error("CORS_ORIGIN must be set when APP_ENV=production")
			os.Exit(1)
		case origin == "*":
			slog.Error("CORS_ORIGIN=* is not allowed in production (credentials would be exposed cross-origin)")
			os.Exit(1)
		case !strings.HasPrefix(origin, "https://"):
			slog.Error("CORS_ORIGIN must use https:// in production", "value", origin)
			os.Exit(1)
		}
		return
	}

	// Non-prod: only validate when explicitly set. Empty falls back to the
	// localhost default in corsMiddleware. But `*` is never acceptable
	// because the response sets Access-Control-Allow-Credentials: true.
	if origin == "*" {
		slog.Error("CORS_ORIGIN=* is not allowed (credentials would be exposed cross-origin)",
			"hint", "use http://localhost:3000 for dev or https://your-staging-domain for staging")
		os.Exit(1)
	}
	if origin != "" && !strings.HasPrefix(origin, "http://") && !strings.HasPrefix(origin, "https://") {
		slog.Error("CORS_ORIGIN must include scheme (http:// or https://)", "value", origin)
		os.Exit(1)
	}
}

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
