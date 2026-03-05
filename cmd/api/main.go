package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"

	"maplerewards/internal/cache"
	"maplerewards/internal/handler"
	"maplerewards/internal/repo"
	"maplerewards/internal/service"
)

func main() {
	_ = godotenv.Load()

	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))

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

	// ── Services ──────────────────────────────────────────────────────────
	walletSvc := service.NewWalletService(walletRepo, cardRepo, redisCache)
	optimizerSvc := service.NewOptimizerService(cardRepo, walletRepo, valuationRepo, redisCache)

	// ── Handlers ──────────────────────────────────────────────────────────
	cardH := handler.NewCardHandler(cardRepo)
	walletH := handler.NewWalletHandler(walletSvc)
	optimizerH := handler.NewOptimizerHandler(optimizerSvc)

	// ── Router ────────────────────────────────────────────────────────────
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(corsMiddleware)

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`)) //nolint:errcheck
	})

	r.Route("/api/v1", func(r chi.Router) {
		// Cards catalogue (read-only)
		r.Get("/cards", cardH.List)
		r.Get("/cards/{id}", cardH.Get)
		r.Get("/categories", cardH.ListCategories)

		// Anonymous wallet
		r.Post("/wallet", walletH.Create)
		r.Get("/wallet/{sessionID}", walletH.Get)
		r.Post("/wallet/{sessionID}/cards", walletH.AddCard)
		r.Delete("/wallet/{sessionID}/cards/{cardID}", walletH.RemoveCard)
		r.Put("/wallet/{sessionID}/cards/{cardID}/balance", walletH.UpdateBalance)

		// Spend optimizer
		r.Post("/optimize", optimizerH.GetBestCard)
	})

	// ── Server ────────────────────────────────────────────────────────────
	srv := &http.Server{
		Addr:         ":" + getEnv("PORT", "8080"),
		Handler:      r,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  60 * time.Second,
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

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		slog.Error("required env var not set", "key", key)
		os.Exit(1)
	}
	return v
}
