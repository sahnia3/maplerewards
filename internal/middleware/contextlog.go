package middleware

import (
	"context"
	"log/slog"
	"net/http"

	chimw "github.com/go-chi/chi/v5/middleware"
)

// SlogContext wraps an *slog.Logger with request_id + user_id attributes
// pulled from the request context. Use it inside handlers to thread tracing
// IDs into every log line without remembering to pass them by hand.
//
// Usage:
//
//	func (h *Handler) DoThing(w http.ResponseWriter, r *http.Request) {
//	    log := mw.SlogContext(r.Context())
//	    log.Info("loading wallet", "session_id", sid)
//	    ...
//	}
//
// Falls back to slog.Default() if the context has no request ID — handler
// callers don't need to special-case it.
func SlogContext(ctx context.Context) *slog.Logger {
	log := slog.Default()
	if rid := chimw.GetReqID(ctx); rid != "" {
		log = log.With("request_id", rid)
	}
	if uid := UserIDFromContext(ctx); uid != "" {
		log = log.With("user_id", uid)
	}
	if IsProFromContext(ctx) {
		log = log.With("is_pro", true)
	}
	return log
}

// HTTPRequestLogger is a chi-style middleware that emits a single slog
// record per request, tagged with method, path, status, latency, and the
// request ID. Replaces chi.middleware.Logger when you want structured
// JSON instead of human-readable lines (better for Loki / Cloudwatch / Loki).
//
// Wire it into main.go in place of `middleware.Logger`:
//
//	r.Use(middleware.RequestID)
//	r.Use(middleware.RealIP)
//	r.Use(mw.HTTPRequestLogger())
func HTTPRequestLogger() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ww := chimw.NewWrapResponseWriter(w, r.ProtoMajor)
			start := chimw.GetReqID(r.Context())
			next.ServeHTTP(ww, r)
			status := ww.Status()
			level := slog.LevelInfo
			switch {
			case status >= 500:
				level = slog.LevelError
			case status >= 400:
				level = slog.LevelWarn
			}
			log := SlogContext(r.Context())
			log.Log(r.Context(), level, "http request",
				"method", r.Method,
				"path", r.URL.Path,
				"status", status,
				"bytes_written", ww.BytesWritten(),
				"chi_request_id", start,
			)
		})
	}
}
