// Package quota tracks monthly free-tier consumption for external HTTP
// providers (SerpAPI, Apify, Tavily) using a Redis INCR counter. Each
// provider gets one key per calendar month with a 32-day TTL so the bucket
// rolls forward automatically on the 1st.
//
// Free-tier limits are constants here; bump them when a paid plan kicks in
// or wire to env vars if seasonally different. A non-zero limit reached
// returns exhausted=true from Spend so callers can short-circuit instead of
// burning API credits or returning empty data silently.
package quota

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

// FreeTierLimits maps provider names to monthly call budgets. A limit of 0
// means "unlimited". Apify now has a hard monthly ceiling (was 0/unlimited)
// — a kill-switch so a bug or traffic spike can never run an unbounded
// number of paid scrapes. The default is generous headroom over expected
// Pro volume (Pro-gated + 6h/7d cached), not a usage throttle; tune via the
// env vars below without a redeploy.
var FreeTierLimits = map[string]int{
	"serpapi": envInt("SERPAPI_MONTHLY_CAP", 250),
	"apify":   envInt("APIFY_MONTHLY_CAP", 2500),
	"tavily":  envInt("TAVILY_MONTHLY_CAP", 1000),
}

// envInt reads a positive integer override from the environment, falling
// back to def when unset or invalid.
func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			return n
		}
	}
	return def
}

// CounterTTL is how long a monthly counter key persists. 32 days guarantees
// the next month's key is fresh; the TTL is only refreshed on key creation
// so usage measurement stays accurate within the month.
const CounterTTL = 32 * 24 * time.Hour

// Client wraps a Redis connection with provider quota helpers.
type Client struct {
	rdb *redis.Client
}

// New builds a quota client backed by the given Redis connection.
func New(rdb *redis.Client) *Client {
	return &Client{rdb: rdb}
}

// monthKey returns the Redis key for a given provider in the current UTC
// month. Format: "quota:{provider}:{YYYY-MM}".
func monthKey(provider string) string {
	return fmt.Sprintf("quota:%s:%s", provider, time.Now().UTC().Format("2006-01"))
}

// Spend increments the monthly counter for the provider by one and returns
// the remaining budget plus an exhausted flag. A provider with limit 0 is
// always allowed and returns remaining=-1 (sentinel for "unlimited").
//
// The TTL is only applied on the first increment of the month — subsequent
// calls preserve the original expiry so the counter rolls over cleanly.
func (c *Client) Spend(ctx context.Context, provider string) (remaining int, exhausted bool, err error) {
	limit, ok := FreeTierLimits[provider]
	if !ok {
		return 0, false, fmt.Errorf("unknown provider: %s", provider)
	}

	key := monthKey(provider)
	n, err := c.rdb.Incr(ctx, key).Result()
	if err != nil {
		return 0, false, fmt.Errorf("quota incr: %w", err)
	}
	// Set TTL only on the first hit of the new month.
	if n == 1 {
		if err := c.rdb.Expire(ctx, key, CounterTTL).Err(); err != nil {
			return 0, false, fmt.Errorf("quota expire: %w", err)
		}
	}

	if limit == 0 {
		return -1, false, nil
	}
	rem := limit - int(n)
	if rem < 0 {
		rem = 0
	}
	return rem, int(n) > limit, nil
}

// Remaining reports how many calls are left this month without consuming
// any. Returns -1 for unlimited providers. A missing key means the counter
// has never been touched this month — full budget remaining.
func (c *Client) Remaining(ctx context.Context, provider string) (int, error) {
	limit, ok := FreeTierLimits[provider]
	if !ok {
		return 0, fmt.Errorf("unknown provider: %s", provider)
	}
	if limit == 0 {
		return -1, nil
	}

	used, err := c.rdb.Get(ctx, monthKey(provider)).Int()
	if err == redis.Nil {
		return limit, nil
	}
	if err != nil {
		return 0, fmt.Errorf("quota get: %w", err)
	}
	rem := limit - used
	if rem < 0 {
		rem = 0
	}
	return rem, nil
}
