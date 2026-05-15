package middleware

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"
)

// RateLimiter is a per-IP token-bucket limiter. Fixed-window limiters let an
// attacker fire `rate` requests at the very end of one window and `rate`
// again at the start of the next — effectively 2× the configured throughput
// over a short span. A token bucket refills continuously at `rate / window`
// and caps at `rate`, so steady-state is enforced and no boundary spike is
// possible.
type RateLimiter struct {
	mu       sync.Mutex
	clients  map[string]*tokenBucket
	rate     int           // burst capacity (tokens)
	window   time.Duration // refill the full bucket over this duration
	refillPS float64       // tokens added per second
	ticker   *time.Ticker
	stop     chan struct{}
}

type tokenBucket struct {
	tokens     float64
	lastRefill time.Time
}

// NewRateLimiter creates a token-bucket limiter that allows `rate` requests
// per `window` (sustained), with a burst capacity equal to `rate`.
//
// A cleanup goroutine runs every minute to evict idle buckets. It uses
// time.NewTicker (not time.Tick) so it can be stopped on shutdown via the
// returned Stop function. main.go can defer rl.Stop() if it cares about
// goroutine cleanliness during graceful shutdown.
func NewRateLimiter(rate int, window time.Duration) *RateLimiter {
	rl := &RateLimiter{
		clients:  make(map[string]*tokenBucket),
		rate:     rate,
		window:   window,
		refillPS: float64(rate) / window.Seconds(),
		stop:     make(chan struct{}),
	}
	rl.ticker = time.NewTicker(time.Minute)
	go func() {
		for {
			select {
			case <-rl.ticker.C:
				rl.cleanup()
			case <-rl.stop:
				rl.ticker.Stop()
				return
			}
		}
	}()
	return rl
}

// Stop terminates the background cleanup goroutine. Safe to call multiple
// times (idempotent via select).
func (rl *RateLimiter) Stop() {
	select {
	case <-rl.stop:
		// already closed
	default:
		close(rl.stop)
	}
}

func (rl *RateLimiter) cleanup() {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	now := time.Now()
	cap := float64(rl.rate)
	for ip, b := range rl.clients {
		// Drop buckets that have been idle long enough to be fully refilled —
		// they carry no useful state (a fresh request would behave identically).
		if now.Sub(b.lastRefill) >= rl.window && b.tokens >= cap {
			delete(rl.clients, ip)
		}
	}
}

// Handler returns an HTTP middleware that rate-limits by client IP.
func (rl *RateLimiter) Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := r.RemoteAddr

		rl.mu.Lock()
		allowed, retrySec := rl.takeLocked(ip)
		rl.mu.Unlock()

		if !allowed {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", itoa(retrySec))
			w.WriteHeader(http.StatusTooManyRequests)
			json.NewEncoder(w).Encode(map[string]string{ //nolint:errcheck
				"code":    "RATE_LIMITED",
				"message": "too many requests, please slow down",
			})
			return
		}
		next.ServeHTTP(w, r)
	})
}

// takeLocked attempts to consume one token from the IP's bucket. Caller must
// hold rl.mu. Returns (allowed, retryAfterSeconds).
func (rl *RateLimiter) takeLocked(ip string) (bool, int) {
	now := time.Now()
	cap := float64(rl.rate)
	b, exists := rl.clients[ip]
	if !exists {
		// New client — fresh bucket starts full and serves the first request.
		rl.clients[ip] = &tokenBucket{tokens: cap - 1, lastRefill: now}
		return true, 0
	}
	// Refill based on elapsed time since last touch.
	elapsed := now.Sub(b.lastRefill).Seconds()
	if elapsed > 0 {
		b.tokens += elapsed * rl.refillPS
		if b.tokens > cap {
			b.tokens = cap
		}
		b.lastRefill = now
	}
	if b.tokens >= 1 {
		b.tokens -= 1
		return true, 0
	}
	// How long until at least 1 token is available?
	deficit := 1 - b.tokens
	retrySec := int(deficit/rl.refillPS) + 1
	if retrySec < 1 {
		retrySec = 1
	}
	return false, retrySec
}

// UserRateLimiter caps requests per authenticated user. Anonymous requests
// pass through (the per-IP limiter handles them). Pro users get a higher
// allowance than free users — keeps a single bad actor from burning through
// the LLM budget without throttling paying customers. Same token-bucket
// semantics as RateLimiter (no fixed-window boundary spike).
type UserRateLimiter struct {
	mu             sync.Mutex
	users          map[string]*tokenBucket
	freeRate       int
	proRate        int
	window         time.Duration
	freeRefillPS   float64
	proRefillPS    float64
	ticker         *time.Ticker
	stop           chan struct{}
}

// NewUserRateLimiter caps free users at freeRate and Pro users at proRate
// tokens, refilled smoothly over `window`. Burst capacity equals the rate.
//
// Like NewRateLimiter, the cleanup goroutine is stoppable via the returned
// .Stop() method — call it from main.go's shutdown path if desired.
func NewUserRateLimiter(freeRate, proRate int, window time.Duration) *UserRateLimiter {
	rl := &UserRateLimiter{
		users:        make(map[string]*tokenBucket),
		freeRate:     freeRate,
		proRate:      proRate,
		window:       window,
		freeRefillPS: float64(freeRate) / window.Seconds(),
		proRefillPS:  float64(proRate) / window.Seconds(),
		stop:         make(chan struct{}),
	}
	rl.ticker = time.NewTicker(time.Minute)
	go func() {
		for {
			select {
			case <-rl.ticker.C:
				rl.cleanup()
			case <-rl.stop:
				rl.ticker.Stop()
				return
			}
		}
	}()
	return rl
}

// Stop terminates the background cleanup goroutine.
func (u *UserRateLimiter) Stop() {
	select {
	case <-u.stop:
	default:
		close(u.stop)
	}
}

func (u *UserRateLimiter) cleanup() {
	u.mu.Lock()
	defer u.mu.Unlock()
	now := time.Now()
	maxCap := float64(u.proRate) // largest possible cap; idle buckets at this level are stateless
	if u.freeRate > u.proRate {
		maxCap = float64(u.freeRate)
	}
	for k, b := range u.users {
		if now.Sub(b.lastRefill) >= u.window && b.tokens >= maxCap {
			delete(u.users, k)
		}
	}
}

// Handler returns middleware that rate-limits by authenticated user ID. Must
// be chained AFTER JWTOptional so the userID/isPro context is populated.
// Anonymous requests pass through unchanged.
func (u *UserRateLimiter) Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID := UserIDFromContext(r.Context())
		if userID == "" {
			next.ServeHTTP(w, r)
			return
		}

		rate := u.freeRate
		refillPS := u.freeRefillPS
		if IsProFromContext(r.Context()) {
			rate = u.proRate
			refillPS = u.proRefillPS
		}

		u.mu.Lock()
		now := time.Now()
		cap := float64(rate)
		b, exists := u.users[userID]
		if !exists {
			u.users[userID] = &tokenBucket{tokens: cap - 1, lastRefill: now}
			u.mu.Unlock()
			next.ServeHTTP(w, r)
			return
		}
		elapsed := now.Sub(b.lastRefill).Seconds()
		if elapsed > 0 {
			b.tokens += elapsed * refillPS
			if b.tokens > cap {
				b.tokens = cap
			}
			b.lastRefill = now
		}
		if b.tokens >= 1 {
			b.tokens -= 1
			u.mu.Unlock()
			next.ServeHTTP(w, r)
			return
		}
		deficit := 1 - b.tokens
		retrySec := int(deficit/refillPS) + 1
		if retrySec < 1 {
			retrySec = 1
		}
		u.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Retry-After", itoa(retrySec))
		w.WriteHeader(http.StatusTooManyRequests)
		json.NewEncoder(w).Encode(map[string]string{ //nolint:errcheck
			"code":    "USER_RATE_LIMITED",
			"message": "too many requests for your account, please slow down",
		})
	})
}

// itoa avoids strconv import for a single integer-to-string call.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	negative := n < 0
	if negative {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if negative {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
