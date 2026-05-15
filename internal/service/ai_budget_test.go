package service

import (
	"context"
	"strings"
	"testing"
	"time"
)

// limitFor must return the right ceiling per tier. A regression here would
// silently give free users Pro-sized budgets (cost blowout) or throttle Pro
// users (support tickets).
func TestAIBudget_LimitForTier(t *testing.T) {
	if limitFor(false) != FreeDailyTokenBudget {
		t.Fatalf("free tier limit = %d, want %d", limitFor(false), FreeDailyTokenBudget)
	}
	if limitFor(true) != ProDailyTokenBudget {
		t.Fatalf("pro tier limit = %d, want %d", limitFor(true), ProDailyTokenBudget)
	}
	if FreeDailyTokenBudget >= ProDailyTokenBudget {
		t.Fatal("free budget must be strictly smaller than pro budget")
	}
}

// Anonymous users must collapse into one shared bucket so abuse can't be
// bypassed by simply not signing in.
func TestAIBudget_AnonymousCoalesces(t *testing.T) {
	if coalesceUserID("") != "anon" {
		t.Fatalf("empty user id must map to 'anon', got %q", coalesceUserID(""))
	}
	if coalesceUserID("u-123") != "u-123" {
		t.Fatalf("real user id must pass through unchanged")
	}
}

// The daily key must bucket by UTC calendar day so the counter rolls over
// at midnight UTC regardless of server tz.
func TestAIBudget_DailyKeyShape(t *testing.T) {
	key := dailyKey("user-x")
	today := time.Now().UTC().Format("2006-01-02")
	if !strings.HasPrefix(key, "aibudget:user-x:") {
		t.Fatalf("key prefix wrong: %s", key)
	}
	if !strings.HasSuffix(key, today) {
		t.Fatalf("key must end with today's UTC date %s, got %s", today, key)
	}
}

// SecondsUntilUTCMidnight is the Retry-After value. Must be a positive
// number of seconds within a day's worth of range.
func TestAIBudget_SecondsUntilMidnight(t *testing.T) {
	s := SecondsUntilUTCMidnight()
	if s <= 0 || s > 86400 {
		t.Fatalf("seconds-until-midnight out of range: %d", s)
	}
}

// A nil/unconfigured budget must FAIL OPEN — the product must not break
// because Redis is down. CheckBudget returns not-exhausted; Consume no-ops.
func TestAIBudget_NilFailsOpen(t *testing.T) {
	var b *AIBudget // nil — simulates "Redis not wired"
	used, rem, exhausted, err := b.CheckBudget(context.Background(), "u1", false)
	if err != nil || exhausted {
		t.Fatalf("nil budget must fail open: used=%d rem=%d exhausted=%v err=%v", used, rem, exhausted, err)
	}
	if rem != FreeDailyTokenBudget {
		t.Fatalf("nil budget should report full free budget remaining, got %d", rem)
	}
	if _, _, err := b.Consume(context.Background(), "u1", false, 999); err != nil {
		t.Fatalf("nil budget Consume must no-op without error, got %v", err)
	}
}
