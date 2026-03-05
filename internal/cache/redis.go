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
