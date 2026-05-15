package cache

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// ErrCacheMiss is returned when a key is not found in Redis.
var ErrCacheMiss = errors.New("cache miss")

type Cache struct {
	client *redis.Client
}

func New(client *redis.Client) *Cache {
	return &Cache{client: client}
}

// ── Point Valuations ─────────────────────────────────────────────────────────

func (c *Cache) GetValuation(ctx context.Context, programSlug, segment string) (float64, error) {
	key := fmt.Sprintf("valuation:%s:%s", programSlug, segment)
	val, err := c.client.Get(ctx, key).Float64()
	if errors.Is(err, redis.Nil) {
		return 0, ErrCacheMiss
	}
	return val, err
}

func (c *Cache) SetValuation(ctx context.Context, programSlug, segment string, cpp float64) error {
	key := fmt.Sprintf("valuation:%s:%s", programSlug, segment)
	return c.client.Set(ctx, key, cpp, time.Hour).Err()
}

// InvalidateValuation deletes the cached CPP for a (program, segment) so the
// next read falls through to Postgres. Called by the admin valuation push
// endpoint after a fresh write, otherwise the warm cache would serve a stale
// value for up to an hour.
func (c *Cache) InvalidateValuation(ctx context.Context, programSlug, segment string) error {
	key := fmt.Sprintf("valuation:%s:%s", programSlug, segment)
	return c.client.Del(ctx, key).Err()
}

// ── Award Search ─────────────────────────────────────────────────────────────

// GetAwardSearch returns the cached JSON-encoded award search response, the
// "found" flag, and any IO error. Callers decide whether to honour the cached
// result based on their own freshness rule (e.g. age of FetchedAt < 45 min).
func (c *Cache) GetAwardSearch(ctx context.Context, key string) ([]byte, bool, error) {
	full := fmt.Sprintf("awards:%s", key)
	data, err := c.client.Get(ctx, full).Bytes()
	if errors.Is(err, redis.Nil) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return data, true, nil
}

// SetAwardSearch caches the JSON-encoded award search response under a key
// of the caller's construction. TTL is caller-supplied so the same primitive
// can serve future cabin/route caches with different freshness budgets.
func (c *Cache) SetAwardSearch(ctx context.Context, key string, payload []byte, ttl time.Duration) error {
	full := fmt.Sprintf("awards:%s", key)
	return c.client.Set(ctx, full, payload, ttl).Err()
}

// ── Feed aggregator ──────────────────────────────────────────────────────────
// Caches the aggregated RSS/Atom feed across all curated sources. The full
// JSON-encoded slice of FeedArticles lives at one key with a 2hr TTL.

func (c *Cache) GetFeed(ctx context.Context, key string) ([]byte, bool, error) {
	full := fmt.Sprintf("feed:%s", key)
	data, err := c.client.Get(ctx, full).Bytes()
	if errors.Is(err, redis.Nil) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return data, true, nil
}

func (c *Cache) SetFeed(ctx context.Context, key string, payload []byte, ttl time.Duration) error {
	full := fmt.Sprintf("feed:%s", key)
	return c.client.Set(ctx, full, payload, ttl).Err()
}

// ── Wallet ───────────────────────────────────────────────────────────────────

func (c *Cache) GetWallet(ctx context.Context, sessionID string, dest any) error {
	key := fmt.Sprintf("wallet:%s", sessionID)
	data, err := c.client.Get(ctx, key).Bytes()
	if errors.Is(err, redis.Nil) {
		return ErrCacheMiss
	}
	if err != nil {
		return err
	}
	return json.Unmarshal(data, dest)
}

func (c *Cache) SetWallet(ctx context.Context, sessionID string, data any) error {
	key := fmt.Sprintf("wallet:%s", sessionID)
	b, err := json.Marshal(data)
	if err != nil {
		return err
	}
	return c.client.Set(ctx, key, b, 30*time.Minute).Err()
}

func (c *Cache) InvalidateWallet(ctx context.Context, sessionID string) error {
	return c.client.Del(ctx, fmt.Sprintf("wallet:%s", sessionID)).Err()
}

// ── Card Multipliers ─────────────────────────────────────────────────────────

func (c *Cache) GetMultipliers(ctx context.Context, cardID string, dest any) error {
	key := fmt.Sprintf("multipliers:card:%s", cardID)
	data, err := c.client.Get(ctx, key).Bytes()
	if errors.Is(err, redis.Nil) {
		return ErrCacheMiss
	}
	if err != nil {
		return err
	}
	return json.Unmarshal(data, dest)
}

func (c *Cache) SetMultipliers(ctx context.Context, cardID string, data any) error {
	key := fmt.Sprintf("multipliers:card:%s", cardID)
	b, err := json.Marshal(data)
	if err != nil {
		return err
	}
	return c.client.Set(ctx, key, b, 24*time.Hour).Err()
}

// ── Apify Flight Probe ───────────────────────────────────────────────────────
// Caches the cheapest live point cost for a (program, origin, dest, date,
// cabin) tuple. Apify scrapes are slow (60-120s) and rate-limited, so the
// Trip Planner consults this cache first; cold misses fall back to the
// static zone-chart estimate and may kick off a background prime. 24h TTL
// keeps the data fresh against fast-moving Aeroplan dynamic pricing without
// triggering scrapes on every search.

func apifyFlightKey(program, origin, dest, date, cabin string) string {
	return fmt.Sprintf("apify:flight:%s:%s-%s:%s:%s", program, origin, dest, date, cabin)
}

// GetApifyFlightMinPoints returns the cached minimum point cost, or (0, false,
// nil) on a cold miss. Surface errors only for genuine Redis failures so
// callers can distinguish "no data" from "broken".
func (c *Cache) GetApifyFlightMinPoints(ctx context.Context, program, origin, dest, date, cabin string) (int, bool, error) {
	val, err := c.client.Get(ctx, apifyFlightKey(program, origin, dest, date, cabin)).Int()
	if errors.Is(err, redis.Nil) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, err
	}
	return val, true, nil
}

// SetApifyFlightMinPoints caches the cheapest probed point cost. Callers
// should write -1 (or skip the cache) when the probe returns no availability
// at all — caching a zero would shadow the static fallback chart.
func (c *Cache) SetApifyFlightMinPoints(ctx context.Context, program, origin, dest, date, cabin string, minPoints int, ttl time.Duration) error {
	if ttl <= 0 {
		ttl = 24 * time.Hour
	}
	return c.client.Set(ctx, apifyFlightKey(program, origin, dest, date, cabin), minPoints, ttl).Err()
}
