package service

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

// limitForPlan must resolve the exact per-tier ceiling from the plan
// string. A regression here is a direct cost blowout (free/lifetime users
// getting Pro+-sized budgets) or a support fire (Pro users throttled).
func TestAIBudget_LimitForPlan(t *testing.T) {
	cases := []struct {
		plan  string
		isPro bool
		want  int
	}{
		{"free", false, FreeDailyTokenBudget},
		{"", false, FreeDailyTokenBudget},            // anon / unknown, not pro
		{"pro", true, ProDailyTokenBudget},           // 100K
		{"pro_plus", true, ProPlusDailyTokenBudget},  // 200K
		{"lifetime", true, LifetimeDailyTokenBudget}, // 150K — below pro_plus on purpose
		{"", true, ProDailyTokenBudget},              // legacy token: is_pro but no plan → Pro, never up-leveled
	}
	for _, c := range cases {
		if got := limitForPlan(c.plan, c.isPro); got != c.want {
			t.Errorf("limitForPlan(%q,%v) = %d, want %d", c.plan, c.isPro, got, c.want)
		}
	}
}

// Concrete ceilings + ordering contract: Free < Pro < Lifetime < Pro Plus.
// Lifetime is intentionally BELOW Pro Plus (one-time payment, no recurring
// revenue ⇒ tighter cap) but ABOVE Pro is NOT required — just a sane ladder.
func TestAIBudget_TierNumbers(t *testing.T) {
	if FreeDailyTokenBudget != 15_000 ||
		ProDailyTokenBudget != 100_000 ||
		ProPlusDailyTokenBudget != 200_000 ||
		LifetimeDailyTokenBudget != 150_000 {
		t.Fatalf("tier budgets drifted: free=%d pro=%d proplus=%d lifetime=%d",
			FreeDailyTokenBudget, ProDailyTokenBudget, ProPlusDailyTokenBudget, LifetimeDailyTokenBudget)
	}
	if FreeDailyTokenBudget >= ProDailyTokenBudget ||
		ProDailyTokenBudget >= LifetimeDailyTokenBudget ||
		LifetimeDailyTokenBudget >= ProPlusDailyTokenBudget {
		t.Fatal("expected ladder Free < Pro < Lifetime < Pro Plus")
	}
}

// The per-request ceiling must reject oversized requests regardless of
// daily budget — this is the "one request can't drain the quota" guard.
func TestAIBudget_RequestTooLarge(t *testing.T) {
	if RequestTooLarge(MaxTokensPerRequest - 1) {
		t.Fatal("a request just under the ceiling must be allowed")
	}
	if !RequestTooLarge(MaxTokensPerRequest + 1) {
		t.Fatal("a request over the ceiling must be rejected")
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
	used, rem, exhausted, err := b.CheckBudget(context.Background(), "u1", "free", false)
	if err != nil || exhausted {
		t.Fatalf("nil budget must fail open: used=%d rem=%d exhausted=%v err=%v", used, rem, exhausted, err)
	}
	if rem != FreeDailyTokenBudget {
		t.Fatalf("nil budget should report full free budget remaining, got %d", rem)
	}
	if _, _, err := b.Consume(context.Background(), "u1", "free", false, 999); err != nil {
		t.Fatalf("nil budget Consume must no-op without error, got %v", err)
	}
}

// A WIRED budget whose Redis is unreachable at request time must FAIL CLOSED:
// deny the request (exhausted=true) rather than let uncapped paid LLM spend
// run during the outage. This is the asymmetric counterpart to the nil/
// unconfigured case above, and mirrors the SerpAPI/Apify quota gates which
// deny on a quota-infra error. Regression here re-opens the
// burn-the-Anthropic-budget-during-a-Redis-blip hole the audit flagged.
func TestAIBudget_RedisErrorFailsClosed(t *testing.T) {
	// A real client pointed at a closed port: Get returns a non-redis.Nil
	// error (dial refused / timeout), exactly the request-time outage path.
	// Tiny DialTimeout keeps the test fast and avoids the default retries
	// dragging it out. This needs no live server — the connection is refused.
	rdb := redis.NewClient(&redis.Options{
		Addr:        "127.0.0.1:1", // reserved, nothing listens here
		DialTimeout: 200 * time.Millisecond,
		MaxRetries:  -1, // don't let go-redis retry the dead dial
	})
	t.Cleanup(func() { _ = rdb.Close() })

	b := NewAIBudget(rdb)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	used, rem, exhausted, err := b.CheckBudget(ctx, "u1", "free", false)
	if err != nil {
		t.Fatalf("fail-closed path must not surface an error (caller has no degrade branch): %v", err)
	}
	if !exhausted {
		t.Fatal("a wired budget with an unreachable Redis must report exhausted=true (fail closed)")
	}
	if used != 0 || rem != 0 {
		t.Fatalf("fail-closed should report no headroom: used=%d rem=%d", used, rem)
	}
}
