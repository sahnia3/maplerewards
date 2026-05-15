package main

import (
	"context"
	"io"
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
	indiaArbRepo := repo.NewIndiaArbRepo(pool)
	tangerineRepo := repo.NewTangerineRepo(pool)
	issuerPageRepo := repo.NewIssuerPageRepo(pool)
	loyaltyAccountRepo := repo.NewLoyaltyAccountRepo(pool)
	cardOfferRepo := repo.NewCardOfferRepo(pool)

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
	sqcSvc := service.NewSQCService(walletRepo, sqcRepo)
	awardWatchSvc := service.NewAwardWatchService(walletRepo, awardWatchRepo)
	buyPointsSvc := service.NewBuyPointsService(buyPromoRepo)
	devalSvc := service.NewDevaluationService(walletRepo, devalRepo)
	feedSvc := service.NewFeedAggregatorService(redisCache, log)
	stackSvc := service.NewStackService(walletRepo, stackRepo, optimizerSvc)
	cardValueSvc := service.NewCardValueService(walletRepo, cardValueRepo)
	indiaArbSvc := service.NewIndiaArbService(walletRepo, indiaArbRepo)
	tangerineSvc := service.NewTangerineService(tangerineRepo)
	loyaltyAccountSvc := service.NewLoyaltyAccountService(walletRepo, loyaltyAccountRepo)
	csvImportSvc := service.NewCSVImportService(walletSvc)
	cardOfferSvc := service.NewCardOfferService(walletRepo, cardOfferRepo)
	emailVerifyRepo := repo.NewEmailVerifyRepo(pool)
	emailVerifySvc := service.NewEmailVerifyService(emailVerifyRepo, nil) // nil → LogEmailSender (dev stub)

	// Flight data services: Apify (live awards), SerpAPI (cash prices), Seats.aero (awards, optional)
	apifySvc := service.NewApifyAwardService(getEnv("APIFY_TOKEN", ""))
	serpSvc := service.NewSerpAPIService(getEnv("SERPAPI_KEY", ""), quotaClient)
	seatsAeroSvc := service.NewSeatsAeroService(getEnv("SEATSAERO_API_KEY", ""))

	tripSvc := service.NewTripService(walletRepo, cardRepo, transferRepo, tavilySvc, serpSvc, kb)
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

	// ── Repos that depend on services being wired ────────────────────────
	chatRepo := repo.NewChatRepo(pool)

	// ── Admin allow-list ─────────────────────────────────────────────────
	// ADMIN_EMAILS is a comma-separated list of emails that may hit the
	// /api/v1/admin/* routes. Empty list = admin routes deny every request.
	adminEmails := splitCSV(getEnv("ADMIN_EMAILS", ""))

	// ── Handlers ──────────────────────────────────────────────────────────
	cardH := handler.NewCardHandler(cardRepo)
	walletH := handler.NewWalletHandler(walletSvc)
	optimizerH := handler.NewOptimizerHandler(optimizerSvc, walletRepo)
	spendH := handler.NewSpendHandler(walletSvc)
	chatH := handler.NewChatHandlerWithRepo(aiSvc, rdb, walletRepo, chatRepo)
	adminValuationH := handler.NewAdminValuationHandler(valuationRepo, redisCache)
	adminQuotaH := handler.NewAdminQuotaHandler(quotaClient)
	summaryH := handler.NewSummaryHandler(walletRepo, transferRepo)
	programH := handler.NewProgramHandler(cardRepo, transferRepo)
	cardDetailH := handler.NewCardDetailHandler(cardRepo, transferRepo)
	recommendH := handler.NewRecommendHandler(recommenderSvc)
	authH := handler.NewAuthHandler(authSvc)
	emailVerifyH := handler.NewEmailVerifyHandler(emailVerifySvc)
	tripH := handler.NewTripHandler(tripSvc, walletRepo)
	awardH := handler.NewAwardSearchHandler(awardSearchSvc, walletRepo)
	bonusH := handler.NewBonusHandler(walletRepo, bonusRepo)
	portfolioH := handler.NewPortfolioHandler(walletRepo, cardRepo, spendRepo, transferRepo)
	missedH := handler.NewMissedRewardsHandler(missedRewardsSvc)
	creditsH := handler.NewCreditsHandler(creditsSvc)
	sqcH := handler.NewSQCHandler(sqcSvc)
	awardWatchH := handler.NewAwardWatchHandler(awardWatchSvc)
	buyPointsH := handler.NewBuyPointsHandler(buyPointsSvc)
	devalH := handler.NewDevaluationHandler(devalSvc)
	feedH := handler.NewFeedHandler(feedSvc)
	stackH := handler.NewStackHandler(stackSvc, walletRepo)
	cardValueH := handler.NewCardValueHandler(cardValueSvc)
	indiaArbH := handler.NewIndiaArbHandler(indiaArbSvc)
	tangerineH := handler.NewTangerineHandler(tangerineSvc)
	issuerChangesH := handler.NewIssuerChangesHandler(issuerPageRepo)
	loyaltyAccountH := handler.NewLoyaltyAccountHandler(loyaltyAccountSvc)
	csvImportH := handler.NewCSVImportHandler(csvImportSvc)
	cardOfferH := handler.NewCardOfferHandler(cardOfferSvc)
	billingSvc := service.NewBillingService(authRepo)
	billingH := handler.NewBillingHandler(billingSvc)

	// ── Router ────────────────────────────────────────────────────────────
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	// Structured request log: one slog JSON record per request, tagged with
	// request_id + user_id + status + bytes. Replaces chi's human-readable
	// Logger so log aggregation (Loki/Cloudwatch) can parse cleanly.
	r.Use(mw.HTTPRequestLogger())
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

	// Per-user rate limit — applied inside /api/v1 so it sees JWT context.
	// Tighter than per-IP because each authenticated request often triggers
	// expensive downstream calls (LLM, Apify, SerpAPI). Pro users get 4×
	// the budget free users do — tuned to comfortably cover the heaviest
	// realistic Pro workflow without enabling abuse.
	freeUserRPM := getEnvInt("FREE_USER_RPM", 60)
	proUserRPM := getEnvInt("PRO_USER_RPM", 240)
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

		// ── Anonymous-friendly mutation endpoints ───────────────────────
		// Wallet creation has no sessionID yet — anyone may create one.
		r.Post("/wallet", walletH.Create)

		// Anonymous-friendly compute endpoints (session_id passed in body;
		// IDOR for these is mitigated by session-id entropy + future body
		// ownership checks in the handlers themselves).
		r.Post("/optimize", optimizerH.GetBestCard)
		r.Post("/recommend", recommendH.Recommend)
		r.Post("/trip/evaluate", tripH.Evaluate)
		r.Post("/trip/award-search", awardH.Search)
		r.Post("/chat", chatH.Chat)
		r.Post("/chat/stream", chatH.ChatStream) // SSE — tool status pills + progressive events

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

		// ── Authenticated user routes (JWT required + CSRF) ─────────────
		// Account-mutating routes get CSRF on top of JWT so a malicious site
		// embedded in a logged-in user's session can't escalate or destroy
		// the account behind their back.
		r.Group(func(r chi.Router) {
			r.Use(mw.JWTRequired(authSvc))
			r.Use(mw.CSRFProtect)
			r.Post("/auth/logout", authH.Logout)
			r.Get("/auth/me", authH.GetMe)
			r.Put("/auth/me", authH.UpdateMe)
			r.Delete("/auth/me", authH.DeleteMe)
			r.Post("/auth/change-password", authH.ChangePassword)
			r.Post("/auth/verify-email/send", emailVerifyH.SendVerification)
			r.Post("/billing/checkout", billingH.CreateCheckout)
		})

		// ── Wallet-owner routes ─────────────────────────────────────────
		// RequireSessionOwner permits anonymous wallets (sessionID is the
		// bearer token) but requires JWT-matching ownership for any wallet
		// that has been claimed by an authenticated user. Closes the IDOR
		// class on every {sessionID} path-param route.
		r.Group(func(r chi.Router) {
			r.Use(mw.RequireSessionOwner(walletRepo))

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
		})

		// ── Pro-tier routes (JWT + Pro required + session ownership) ────
		// Free users that hit these by URL get 402 (Payment Required).
		r.Group(func(r chi.Router) {
			r.Use(mw.JWTRequired(authSvc))
			r.Use(mw.RequirePro())
			r.Use(mw.RequireSessionOwner(walletRepo))

			// Missed-rewards forensics
			r.Get("/wallet/{sessionID}/missed-rewards", missedH.GetMissedRewards)

			// Card credits + renewal countdown
			r.Get("/wallet/{sessionID}/credits", creditsH.ListCredits)
			r.Post("/wallet/{sessionID}/credits/{creditDefID}/redeem", creditsH.RecordRedemption)

			// 2026 Aeroplan SQC projector
			r.Get("/wallet/{sessionID}/sqc-projection", sqcH.GetProjection)

			// Aeroplan availability watcher (CRUD only — cron worker deferred)
			r.Get("/wallet/{sessionID}/award-watches", awardWatchH.List)
			r.Post("/wallet/{sessionID}/award-watches", awardWatchH.Create)
			r.Delete("/wallet/{sessionID}/award-watches/{watchID}", awardWatchH.Delete)

			// Annual card-value scorecard
			r.Get("/wallet/{sessionID}/card-value", cardValueH.Summary)

			// India-outbound hotel arbitrage (diaspora wedge)
			r.Get("/wallet/{sessionID}/india-arbitrage", indiaArbH.List)

			// Loyalty-account aggregation (track programs without a co-branded card)
			r.Get("/wallet/{sessionID}/loyalty-accounts", loyaltyAccountH.List)
			r.Post("/wallet/{sessionID}/loyalty-accounts", loyaltyAccountH.Create)
			r.Put("/wallet/{sessionID}/loyalty-accounts/{accountID}", loyaltyAccountH.Update)
			r.Delete("/wallet/{sessionID}/loyalty-accounts/{accountID}", loyaltyAccountH.Delete)

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
			r.Post("/buy-points/evaluate", buyPointsH.Evaluate)
			r.Post("/stack-recommend", stackH.Recommend)
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
			r.Post("/admin/valuations", adminValuationH.Push)
			r.Get("/admin/quota", adminQuotaH.Get)
		})
	})

	// ── Server ────────────────────────────────────────────────────────────
	srv := &http.Server{
		Addr:    ":" + getEnv("PORT", "8080"),
		Handler: r,
		// ReadTimeout covers reading the full request body (generous for large bodies)
		ReadTimeout: 30 * time.Second,
		// WriteTimeout was 90s — but the SSE chat stream legitimately writes for
		// 60-180s on flight+hotel prompts (parallel Apify polling 30-90s each +
		// round 2 LLM synthesis 30-60s). The 90s cap was forcibly closing the
		// connection mid-stream, which manifested client-side as ERR_INCOMPLETE_
		// CHUNKED_ENCODING / "network error" and server-side as "context
		// canceled" during apify polling. Bumping to 5min handles the slowest
		// realistic chat without exposing the server to long-hold DoS.
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
func init() {
	// Only enforce when explicitly in production. Other environments may
	// run with the default localhost origin.
	if !strings.EqualFold(os.Getenv("APP_ENV"), "production") {
		return
	}
	origin := strings.TrimSpace(os.Getenv("CORS_ORIGIN"))
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
