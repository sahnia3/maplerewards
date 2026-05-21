package quota

import (
	"context"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

// miniRedis here would be ideal but we keep the import surface tiny.
// Instead, point at a real Redis at REDIS_TEST_ADDR (default localhost:6379)
// and skip if unreachable — matches the rest of the repo's integration-style
// tests (no testify, no external mocks).
func newTestClient(t *testing.T) *Client {
	t.Helper()
	rdb := redis.NewClient(&redis.Options{Addr: "localhost:6379"})
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		t.Skipf("redis unavailable: %v", err)
	}
	c := New(rdb)
	// Clear the keys this test will touch so re-runs don't bleed.
	for _, p := range []string{"serpapi", "apify", "tavily"} {
		_ = rdb.Del(ctx, monthKey(p)).Err()
	}
	return c
}

func TestSpend_MonotonicAndRemaining(t *testing.T) {
	c := newTestClient(t)
	ctx := context.Background()

	limit := FreeTierLimits["serpapi"]
	if limit <= 0 {
		t.Fatalf("expected positive serpapi limit, got %d", limit)
	}

	rem1, exh1, err := c.Spend(ctx, "serpapi")
	if err != nil {
		t.Fatalf("first spend: %v", err)
	}
	if exh1 {
		t.Fatalf("first spend should not exhaust")
	}
	if rem1 != limit-1 {
		t.Fatalf("first remaining = %d, want %d", rem1, limit-1)
	}

	rem2, exh2, err := c.Spend(ctx, "serpapi")
	if err != nil {
		t.Fatalf("second spend: %v", err)
	}
	if exh2 {
		t.Fatalf("second spend should not exhaust")
	}
	if rem2 != limit-2 {
		t.Fatalf("second remaining = %d, want %d", rem2, limit-2)
	}
}

func TestRemaining_FreshKeyReturnsLimit(t *testing.T) {
	c := newTestClient(t)
	ctx := context.Background()

	rem, err := c.Remaining(ctx, "tavily")
	if err != nil {
		t.Fatalf("remaining: %v", err)
	}
	if rem != FreeTierLimits["tavily"] {
		t.Fatalf("tavily remaining = %d, want full %d", rem, FreeTierLimits["tavily"])
	}
}

// Apify is now hard-capped (was unlimited). Spend must count down and
// exhaust once the monthly cap is exceeded — the kill-switch contract.
func TestSpend_ApifyHardCapped(t *testing.T) {
	c := newTestClient(t)
	ctx := context.Background()

	orig := FreeTierLimits["apify"]
	FreeTierLimits["apify"] = 2 // small cap to exercise exhaustion cheaply
	defer func() { FreeTierLimits["apify"] = orig }()

	if _, exh, err := c.Spend(ctx, "apify"); err != nil || exh {
		t.Fatalf("1st apify spend: exhausted=%v err=%v (want not-exhausted)", exh, err)
	}
	if _, exh, err := c.Spend(ctx, "apify"); err != nil || exh {
		t.Fatalf("2nd apify spend: exhausted=%v err=%v (want not-exhausted at cap)", exh, err)
	}
	if _, exh, err := c.Spend(ctx, "apify"); err != nil || !exh {
		t.Fatalf("3rd apify spend: exhausted=%v err=%v (want EXHAUSTED past cap)", exh, err)
	}
}

// The limit==0 "unlimited" sentinel path must still work for any provider
// configured that way (rem=-1, never exhausts).
func TestSpend_UnlimitedSentinelStillWorks(t *testing.T) {
	c := newTestClient(t)
	ctx := context.Background()

	orig := FreeTierLimits["apify"]
	FreeTierLimits["apify"] = 0
	defer func() { FreeTierLimits["apify"] = orig }()

	rem, exh, err := c.Spend(ctx, "apify")
	if err != nil {
		t.Fatalf("spend: %v", err)
	}
	if exh {
		t.Fatalf("limit=0 provider should never exhaust")
	}
	if rem != -1 {
		t.Fatalf("remaining = %d, want -1 (unlimited sentinel)", rem)
	}
}

func TestSpend_UnknownProvider(t *testing.T) {
	c := newTestClient(t)
	ctx := context.Background()

	_, _, err := c.Spend(ctx, "bogus_provider")
	if err == nil {
		t.Fatalf("expected error for unknown provider")
	}
}

func TestSpend_TTLApplied(t *testing.T) {
	c := newTestClient(t)
	ctx := context.Background()

	// Spend once so the key exists.
	if _, _, err := c.Spend(ctx, "serpapi"); err != nil {
		t.Fatalf("spend: %v", err)
	}
	// Read TTL directly via the underlying client — confirm it's > 0 and ≤ 32d.
	ttl, err := c.rdb.TTL(ctx, monthKey("serpapi")).Result()
	if err != nil {
		t.Fatalf("ttl: %v", err)
	}
	if ttl <= 0 || ttl > CounterTTL {
		t.Fatalf("ttl out of range: got %v, want (0, %v]", ttl, CounterTTL)
	}
}

func TestSpend_ExhaustionFlips(t *testing.T) {
	c := newTestClient(t)
	ctx := context.Background()

	// Pre-set the counter to one less than the limit so the next Spend
	// hits exactly limit (not exhausted), and the one after exhausts.
	limit := FreeTierLimits["tavily"]
	key := monthKey("tavily")
	if err := c.rdb.Set(ctx, key, limit-1, CounterTTL).Err(); err != nil {
		t.Fatalf("prime: %v", err)
	}
	_, exh, err := c.Spend(ctx, "tavily")
	if err != nil {
		t.Fatalf("spend at limit: %v", err)
	}
	if exh {
		t.Fatalf("spend at exactly limit should not exhaust")
	}
	_, exh2, err := c.Spend(ctx, "tavily")
	if err != nil {
		t.Fatalf("spend past limit: %v", err)
	}
	if !exh2 {
		t.Fatalf("spend past limit should exhaust")
	}
}
