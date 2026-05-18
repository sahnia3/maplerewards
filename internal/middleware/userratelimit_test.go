package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// sendAs fires one request through the UserRateLimiter handler with the given
// user identity baked into context (as JWTOptional would have done), and
// returns the resulting status code.
func sendAs(h http.Handler, userID string, isPro bool) int {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	if userID != "" {
		ctx := context.WithValue(req.Context(), userIDKey, userID)
		ctx = context.WithValue(ctx, isProKey, isPro)
		req = req.WithContext(ctx)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w.Code
}

func okHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
}

func TestUserRateLimiter_FreeUserCappedThen429(t *testing.T) {
	u := NewUserRateLimiter(3, 100, time.Minute)
	defer u.Stop()
	h := u.Handler(okHandler())

	for i := 0; i < 3; i++ {
		if code := sendAs(h, "free-user", false); code != http.StatusOK {
			t.Fatalf("free request %d: expected 200, got %d", i+1, code)
		}
	}
	if code := sendAs(h, "free-user", false); code != http.StatusTooManyRequests {
		t.Fatalf("4th free request: expected 429, got %d", code)
	}
}

func TestUserRateLimiter_429PayloadAndRetryAfter(t *testing.T) {
	u := NewUserRateLimiter(1, 100, time.Minute)
	defer u.Stop()
	h := u.Handler(okHandler())

	sendAs(h, "f1", false) // consume the only token
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := context.WithValue(req.Context(), userIDKey, "f1")
	ctx = context.WithValue(ctx, isProKey, false)
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d", w.Code)
	}
	if w.Header().Get("Retry-After") == "" {
		t.Error("expected Retry-After header on user rate-limit")
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp) //nolint:errcheck
	if resp["code"] != "USER_RATE_LIMITED" {
		t.Errorf("expected code USER_RATE_LIMITED, got %q", resp["code"])
	}
}

// Pro gets the higher allowance: a request count that 429s a free user must
// still pass for a Pro user on the same limiter.
func TestUserRateLimiter_ProUserGetsHigherAllowance(t *testing.T) {
	u := NewUserRateLimiter(2, 10, time.Minute)
	defer u.Stop()
	h := u.Handler(okHandler())

	// Free user: blocked after 2.
	sendAs(h, "free-x", false)
	sendAs(h, "free-x", false)
	if code := sendAs(h, "free-x", false); code != http.StatusTooManyRequests {
		t.Fatalf("free-x 3rd: expected 429, got %d", code)
	}

	// Pro user: 3rd request (which 429'd a free user) must still pass, and
	// indeed all 10 of the Pro allowance.
	for i := 0; i < 10; i++ {
		if code := sendAs(h, "pro-x", true); code != http.StatusOK {
			t.Fatalf("pro-x request %d: expected 200 (higher Pro cap), got %d", i+1, code)
		}
	}
	if code := sendAs(h, "pro-x", true); code != http.StatusTooManyRequests {
		t.Fatalf("pro-x 11th: expected 429 at Pro cap, got %d", code)
	}
}

// Anonymous requests (no userID in context) pass through unthrottled — the
// per-IP RateLimiter is responsible for them. Documented behavior pinned here.
func TestUserRateLimiter_AnonymousPassesThrough(t *testing.T) {
	u := NewUserRateLimiter(1, 1, time.Minute)
	defer u.Stop()
	h := u.Handler(okHandler())

	for i := 0; i < 25; i++ {
		if code := sendAs(h, "", false); code != http.StatusOK {
			t.Fatalf("anonymous request %d must pass through (got %d)", i+1, code)
		}
	}
}

// Buckets are keyed per user-id: one user exhausting their bucket must not
// affect a different user.
func TestUserRateLimiter_PerUserBucketsIndependent(t *testing.T) {
	u := NewUserRateLimiter(2, 2, time.Minute)
	defer u.Stop()
	h := u.Handler(okHandler())

	// Exhaust user A.
	sendAs(h, "userA", false)
	sendAs(h, "userA", false)
	if code := sendAs(h, "userA", false); code != http.StatusTooManyRequests {
		t.Fatalf("userA 3rd: expected 429, got %d", code)
	}

	// User B is untouched.
	if code := sendAs(h, "userB", false); code != http.StatusOK {
		t.Fatalf("userB: expected 200 (independent bucket), got %d", code)
	}
	if code := sendAs(h, "userB", false); code != http.StatusOK {
		t.Fatalf("userB 2nd: expected 200, got %d", code)
	}
	if code := sendAs(h, "userB", false); code != http.StatusTooManyRequests {
		t.Fatalf("userB 3rd: expected 429, got %d", code)
	}
}

// Token bucket refills continuously (no fixed-window boundary burst) for the
// per-user limiter too.
func TestUserRateLimiter_RefillsOverTime(t *testing.T) {
	u := NewUserRateLimiter(1, 1, 50*time.Millisecond)
	defer u.Stop()
	h := u.Handler(okHandler())

	if code := sendAs(h, "r1", false); code != http.StatusOK {
		t.Fatalf("first: expected 200, got %d", code)
	}
	if code := sendAs(h, "r1", false); code != http.StatusTooManyRequests {
		t.Fatalf("second (drained): expected 429, got %d", code)
	}
	time.Sleep(60 * time.Millisecond)
	if code := sendAs(h, "r1", false); code != http.StatusOK {
		t.Fatalf("after refill window: expected 200, got %d", code)
	}
}
