package middleware

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"
)

// RateLimiter implements a simple sliding-window rate limiter per IP.
type RateLimiter struct {
	mu      sync.Mutex
	clients map[string]*clientBucket
	rate    int           // requests per window
	window  time.Duration // window size
}

type clientBucket struct {
	count    int
	resetAt  time.Time
}

// NewRateLimiter creates a rate limiter that allows `rate` requests per `window` duration.
func NewRateLimiter(rate int, window time.Duration) *RateLimiter {
	rl := &RateLimiter{
		clients: make(map[string]*clientBucket),
		rate:    rate,
		window:  window,
	}
	// Cleanup stale entries every minute
	go func() {
		for range time.Tick(time.Minute) {
			rl.cleanup()
		}
	}()
	return rl
}

func (rl *RateLimiter) cleanup() {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	now := time.Now()
	for ip, b := range rl.clients {
		if now.After(b.resetAt) {
			delete(rl.clients, ip)
		}
	}
}

// Handler returns an HTTP middleware that rate-limits by client IP.
func (rl *RateLimiter) Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := r.RemoteAddr

		rl.mu.Lock()
		now := time.Now()
		b, exists := rl.clients[ip]
		if !exists || now.After(b.resetAt) {
			rl.clients[ip] = &clientBucket{count: 1, resetAt: now.Add(rl.window)}
			rl.mu.Unlock()
			next.ServeHTTP(w, r)
			return
		}

		b.count++
		if b.count > rl.rate {
			rl.mu.Unlock()
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", "10")
			w.WriteHeader(http.StatusTooManyRequests)
			json.NewEncoder(w).Encode(map[string]string{
				"code":    "RATE_LIMITED",
				"message": "too many requests, please slow down",
			}) //nolint:errcheck
			return
		}
		rl.mu.Unlock()
		next.ServeHTTP(w, r)
	})
}
