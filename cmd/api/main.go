package main

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
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

	// Dual-writer log: stdout (so terminal still shows live output) plus a
	// rotating-style file so dump-ai-trace.sh can grep recent activity even
	// when the process is detached. Path overridable via LOG_FILE — default
	// /tmp/maple-api.log so it survives reboots only on macOS where /tmp
	// isn't tmpfs by default.
	logPath := getEnv("LOG_FILE", "/tmp/maple-api.log")
	logSinks := []io.Writer{os.Stdout}
	if f, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644); err == nil {
		logSinks = append(logSinks, f)
	}
	log := slog.New(slog.NewJSONHandler(io.MultiWriter(logSinks...), nil))
	slog.SetDefault(log)

	// ── Postgres ──────────────────────────────────────────────────────────
	pool, err := pgxpool.New(context.Background(), mustEnv("DATABASE_URL"))
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

	// ── Redis ─────────────────────────────────────────────────────────────
	rdb := redis.NewClient(&redis.Options{
		Addr:     getEnv("REDIS_ADDR", "localhost:6379"),
		Password: getEnv("REDIS_PASSWORD", ""),
	})
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		log.Error("redis ping failed", "err", err)
		os.Exit(1)
	}
	log.Info("redis connected")

	redisCache := cache.New(rdb)

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
	indiaArbRepo := repo.NewIndiaArbRepo(pool)
	tangerineRepo := repo.NewTangerineRepo(pool)

	// ── Services ──────────────────────────────────────────────────────────
	appEnv := getEnv("APP_ENV", "development")
	jwtSecret = getEnv("JWT_SECRET", "")
	if appEnv == "production" {
		if jwtSecret == "" || jwtSecret == devJWTFallback {
			log.Error("JWT_SECRET must be set to a non-default value when APP_ENV=production")
			os.Exit(1)
		}
	} else if jwtSecret == "" {
		log.Warn("JWT_SECRET unset; using dev fallback (DO NOT USE IN PRODUCTION)")
		jwtSecret = devJWTFallback
	}
	walletSvc := service.NewWalletService(walletRepo, cardRepo, spendRepo, bonusRepo, redisCache)
	optimizerSvc := service.NewOptimizerService(cardRepo, walletRepo, valuationRepo, transferRepo, spendRepo, redisCache)
	tavilySvc := service.NewTavilyService(getEnv("TAVILY_API_KEY", ""))

	// Load YAML knowledge base; fall back to hardcoded data on error.
	kb, kbErr := knowledge.Load("internal/knowledge/rewards.yaml")
	if kbErr != nil {
		log.Warn("could not load knowledge base, using hardcoded fallback", "err", kbErr)
	}
	// Load supplementary credit card strategies knowledge base.
	if kb != nil {
		if err := kb.LoadSupplementary("internal/knowledge/credit_card_strategies.yaml"); err != nil {
			log.Warn("could not load credit card strategies KB", "err", err)
		}
	}

	recommenderSvc := service.NewRecommenderService(cardRepo)
	authSvc := service.NewAuthService(authRepo, walletRepo, jwtSecret)
	missedRewardsSvc := service.NewMissedRewardsService(walletRepo, spendRepo, optimizerSvc)
	creditsSvc := service.NewCreditsService(walletRepo, creditRepo)
	sqcSvc := service.NewSQCService(walletRepo, sqcRepo)
	awardWatchSvc := service.NewAwardWatchService(walletRepo, awardWatchRepo)
	buyPointsSvc := service.NewBuyPointsService(buyPromoRepo)
	devalSvc := service.NewDevaluationService(walletRepo, devalRepo)
	stackSvc := service.NewStackService(walletRepo, stackRepo, optimizerSvc)
	cardValueSvc := service.NewCardValueService(walletRepo, cardValueRepo)
	indiaArbSvc := service.NewIndiaArbService(walletRepo, indiaArbRepo)
	tangerineSvc := service.NewTangerineService(tangerineRepo)

	// Flight data services: Apify (live awards), SerpAPI (cash prices), Seats.aero (awards, optional)
	apifySvc := service.NewApifyAwardService(getEnv("APIFY_TOKEN", ""))
	serpSvc := service.NewSerpAPIService(getEnv("SERPAPI_KEY", ""))
	seatsAeroSvc := service.NewSeatsAeroService(getEnv("SEATSAERO_API_KEY", ""))

	tripSvc := service.NewTripService(walletRepo, cardRepo, transferRepo, tavilySvc, serpSvc, kb)
	awardSearchSvc := service.NewAwardSearchService(apifySvc, seatsAeroSvc, serpSvc, walletRepo, kb)

	aiSvc := service.NewAIService(
		getEnv("ANTHROPIC_API_KEY", ""),
		walletRepo, cardRepo, transferRepo, valuationRepo,
		optimizerSvc, tavilySvc, kb, awardSearchSvc, serpSvc,
		service.ProServices{
			BuyPoints:     buyPointsSvc,
			Stack:         stackSvc,
			MissedRewards: missedRewardsSvc,
			SQC:           sqcSvc,
		},
	)

	// Apify smoke-test goroutine. Fires every 6 hours against a known query
	// (YYZ→LHR business) and warns if the Apify schema drifts again. Catches
	// the next totalDuration-style breakage before users do.
	// Uses Background() — the goroutine runs for the full process lifetime and
	// is killed cleanly when the OS terminates the process on shutdown.
	if apifySvc.IsAvailable() {
		health.NewApifySmokeChecker(awardSearchSvc, 6*time.Hour).Start(context.Background())
	}

	// ── Handlers ──────────────────────────────────────────────────────────
	cardH := handler.NewCardHandler(cardRepo)
	walletH := handler.NewWalletHandler(walletSvc)
	optimizerH := handler.NewOptimizerHandler(optimizerSvc)
	spendH := handler.NewSpendHandler(walletSvc)
	chatH := handler.NewChatHandler(aiSvc, rdb)
	summaryH := handler.NewSummaryHandler(walletRepo, transferRepo)
	programH := handler.NewProgramHandler(cardRepo, transferRepo)
	cardDetailH := handler.NewCardDetailHandler(cardRepo, transferRepo)
	recommendH := handler.NewRecommendHandler(recommenderSvc)
	authH := handler.NewAuthHandler(authSvc)
	tripH := handler.NewTripHandler(tripSvc)
	awardH := handler.NewAwardSearchHandler(awardSearchSvc)
	bonusH := handler.NewBonusHandler(walletRepo, bonusRepo)
	portfolioH := handler.NewPortfolioHandler(walletRepo, cardRepo, spendRepo, transferRepo)
	missedH := handler.NewMissedRewardsHandler(missedRewardsSvc)
	creditsH := handler.NewCreditsHandler(creditsSvc)
	sqcH := handler.NewSQCHandler(sqcSvc)
	awardWatchH := handler.NewAwardWatchHandler(awardWatchSvc)
	buyPointsH := handler.NewBuyPointsHandler(buyPointsSvc)
	devalH := handler.NewDevaluationHandler(devalSvc)
	stackH := handler.NewStackHandler(stackSvc)
	cardValueH := handler.NewCardValueHandler(cardValueSvc)
	indiaArbH := handler.NewIndiaArbHandler(indiaArbSvc)
	tangerineH := handler.NewTangerineHandler(tangerineSvc)
	billingSvc := service.NewBillingService(authRepo)
	billingH := handler.NewBillingHandler(billingSvc)

	// ── Router ────────────────────────────────────────────────────────────
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(corsMiddleware)

	// Rate limit per IP per minute. Default 300 in dev, 60 in prod; override
	// with RATE_LIMIT_PER_MINUTE for load testing or paid tiers.
	defaultRPM := 300
	if appEnv == "production" {
		defaultRPM = 60
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

	r.Route("/api/v1", func(r chi.Router) {
		// Apply optional JWT middleware to all routes (sets user context if token present)
		r.Use(mw.JWTOptional(authSvc))

		// Cards catalogue (read-only)
		r.Get("/cards", cardH.List)
		r.Get("/cards/{id}", cardH.Get)
		r.Get("/cards/{id}/detail", cardDetailH.GetDetail)
		r.Get("/categories", cardH.ListCategories)

		// Loyalty programs
		r.Get("/programs", programH.List)
		r.Get("/programs/{slug}/detail", programH.GetDetail)

		// Anonymous wallet
		r.Post("/wallet", walletH.Create)
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

		// Bonus tracking (milestones)
		r.Get("/wallet/{sessionID}/bonuses", bonusH.ListBonuses)
		r.Post("/wallet/{sessionID}/bonuses/{cardID}/activate", bonusH.ActivateBonus)

		// Portfolio analysis
		r.Get("/wallet/{sessionID}/portfolio/analysis", portfolioH.GetAnalysis)

		// Missed-rewards report ("you should have used X instead of Y")
		r.Get("/wallet/{sessionID}/missed-rewards", missedH.GetMissedRewards)

		// Card credits + annual-fee renewal countdown
		r.Get("/wallet/{sessionID}/credits", creditsH.ListCredits)
		r.Post("/wallet/{sessionID}/credits/{creditDefID}/redeem", creditsH.RecordRedemption)

		// 2026 Aeroplan SQC elite-status projector
		r.Get("/wallet/{sessionID}/sqc-projection", sqcH.GetProjection)

		// Aeroplan availability watcher (CRUD only — cron worker deferred)
		r.Get("/wallet/{sessionID}/award-watches", awardWatchH.List)
		r.Post("/wallet/{sessionID}/award-watches", awardWatchH.Create)
		r.Delete("/wallet/{sessionID}/award-watches/{watchID}", awardWatchH.Delete)

		// Buy-points break-even calculator
		r.Get("/buy-points/promos", buyPointsH.ListPromos)
		r.Post("/buy-points/evaluate", buyPointsH.Evaluate)

		// Devaluation alarms (with optional user-context flagging)
		r.Get("/devaluations", devalH.List)
		r.Get("/wallet/{sessionID}/devaluations", devalH.List)

		// Triple-stack calculator (portal × card × network offer)
		r.Get("/merchants", stackH.ListMerchants)
		r.Post("/stack-recommend", stackH.Recommend)

		// Annual card value comparison (insurance + lounge + multipliers)
		r.Get("/wallet/{sessionID}/card-value", cardValueH.Summary)

		// India-outbound hotel arbitrage (diaspora wedge)
		r.Get("/wallet/{sessionID}/india-arbitrage", indiaArbH.List)

		// Tangerine 2% rotating-category resolver
		r.Get("/tangerine-categories", tangerineH.List)

		// Spend optimizer
		r.Post("/optimize", optimizerH.GetBestCard)

		// AI chat assistant
		r.Post("/chat", chatH.Chat)
		r.Post("/chat/stream", chatH.ChatStream) // SSE — tool status pills + progressive events

		// Card recommender
		r.Post("/recommend", recommendH.Recommend)

		// Trip planner
		r.Post("/trip/evaluate", tripH.Evaluate)
		r.Post("/trip/award-search", awardH.Search)

		// ── Auth routes ──────────────────────────────────────────────────
		r.Post("/auth/register", authH.Register)
		r.Post("/auth/login", authH.Login)
		r.Post("/auth/google", authH.GoogleAuth)
		r.Post("/auth/refresh", authH.Refresh)

		// Stripe webhook (public — Stripe signs the payload)
		r.Post("/billing/webhook", billingH.Webhook)

		// Protected auth routes (require valid JWT)
		r.Group(func(r chi.Router) {
			r.Use(mw.JWTRequired(authSvc))
			r.Post("/auth/logout", authH.Logout)
			r.Get("/auth/me", authH.GetMe)
			r.Put("/auth/me", authH.UpdateMe)
			r.Delete("/auth/me", authH.DeleteMe)

			// Billing (authenticated)
			r.Post("/billing/checkout", billingH.CreateCheckout)
		})
	})

	// ── Server ────────────────────────────────────────────────────────────
	srv := &http.Server{
		Addr:    ":" + getEnv("PORT", "8080"),
		Handler: r,
		// ReadTimeout covers reading the full request body (generous for large bodies)
		ReadTimeout: 30 * time.Second,
		// WriteTimeout MUST be longer than the slowest handler.
		// The AI chat endpoint calls Claude + award search (~30-60s).
		// Award search uses SerpAPI + Seats.aero (~3-5s total).
		WriteTimeout: 90 * time.Second,
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

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	srv.Shutdown(ctx) //nolint:errcheck
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", getEnv("CORS_ORIGIN", "http://localhost:3000"))
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
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
