package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRateLimiter_AllowsWithinLimit(t *testing.T) {
	rl := NewRateLimiter(5, time.Minute)
	handler := rl.Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	for i := 0; i < 5; i++ {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = "127.0.0.1:12345"
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("request %d: expected 200, got %d", i+1, w.Code)
		}
	}
}

func TestRateLimiter_BlocksOverLimit(t *testing.T) {
	rl := NewRateLimiter(3, time.Minute)
	handler := rl.Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// First 3 should pass
	for i := 0; i < 3; i++ {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = "10.0.0.1:1234"
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("request %d: expected 200, got %d", i+1, w.Code)
		}
	}

	// 4th should be blocked
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "10.0.0.1:1234"
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusTooManyRequests {
		t.Errorf("expected 429, got %d", w.Code)
	}

	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp) //nolint:errcheck
	if resp["code"] != "RATE_LIMITED" {
		t.Errorf("expected code RATE_LIMITED, got %q", resp["code"])
	}

	retryAfter := w.Header().Get("Retry-After")
	if retryAfter == "" {
		t.Error("expected Retry-After header")
	}
}

func TestRateLimiter_DifferentIPsAreSeparate(t *testing.T) {
	rl := NewRateLimiter(2, time.Minute)
	handler := rl.Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// IP A: 2 requests (at limit)
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = "1.1.1.1:1234"
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("IP A request %d: expected 200, got %d", i+1, w.Code)
		}
	}

	// IP B: should still be allowed
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "2.2.2.2:5678"
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("IP B: expected 200, got %d", w.Code)
	}

	// IP A: 3rd request should be blocked
	req = httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "1.1.1.1:1234"
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusTooManyRequests {
		t.Errorf("IP A 3rd request: expected 429, got %d", w.Code)
	}
}

func TestRateLimiter_WindowResets(t *testing.T) {
	// Use a very short window for testing
	rl := NewRateLimiter(1, 50*time.Millisecond)
	handler := rl.Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// First request passes
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "3.3.3.3:9999"
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("first request: expected 200, got %d", w.Code)
	}

	// Second request blocked
	req = httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "3.3.3.3:9999"
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusTooManyRequests {
		t.Errorf("second request: expected 429, got %d", w.Code)
	}

	// Wait for window to expire
	time.Sleep(60 * time.Millisecond)

	// After window reset, request should pass again
	req = httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = "3.3.3.3:9999"
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("after reset: expected 200, got %d", w.Code)
	}
}

// Regression: a fixed-window limiter would let an attacker fire `rate`
// requests at the end of one window and `rate` again right after the
// boundary, doubling the configured throughput. The token bucket should not.
func TestRateLimiter_NoBoundaryBurst(t *testing.T) {
	rl := NewRateLimiter(3, 100*time.Millisecond)
	handler := rl.Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	send := func() int {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = "9.9.9.9:5555"
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)
		return w.Code
	}

	// Drain the bucket
	for i := 0; i < 3; i++ {
		if code := send(); code != http.StatusOK {
			t.Fatalf("warmup request %d: expected 200, got %d", i+1, code)
		}
	}
	if code := send(); code != http.StatusTooManyRequests {
		t.Fatalf("post-burst request: expected 429, got %d", code)
	}

	// Sleep just under the full-refill duration. A fixed-window limiter
	// would allow another full burst here; the token bucket should only
	// have refilled ~1 token (10ms ≈ 1/3 of full window).
	time.Sleep(35 * time.Millisecond)
	if code := send(); code != http.StatusOK {
		t.Fatalf("post-partial-refill: expected 200 from one refilled token, got %d", code)
	}
	// Next two should be blocked since we still only get steady-state refill.
	if code := send(); code != http.StatusTooManyRequests {
		t.Fatalf("immediate followup: expected 429 (no boundary burst), got %d", code)
	}
}
