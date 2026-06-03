// Package quota tracks monthly consumption for the paid external HTTP
// providers (SerpAPI, Apify, Tavily) using Redis INCR counters, and enforces
// FINITE per-tier monthly caps on every subscription tier (free, pro,
// pro_plus, lifetime). It is a denial-of-wallet control: these providers cost
// real cash per call, so an exhausted cap short-circuits the call instead of
// burning credits.
//
// Two hard guarantees this package makes:
//
//  1. FAIL CLOSED. If Redis cannot be read or incremented, SpendTier DENIES the
//     paid call (returns exhausted=true together with the error). A Redis
//     outage therefore degrades the feature gracefully — it can never result in
//     uncapped paid spend. (This is the opposite of a request rate-limiter,
//     which fails OPEN for availability — see internal/middleware/ratelimit.go.)
//
//  2. PROCESS-LIFETIME ATOMIC BACKSTOP. Independently of Redis, each provider
//     has an in-process sync/atomic hard ceiling on the number of paid calls a
//     single instance will ever authorize. Even if Redis is degraded AND the
//     per-tier gate has a logic gap, one instance can NEVER exceed this
//     absolute number. Defense-in-depth against the exact "Redis down →
//     runaway spend" scenario. The counter resets only on process restart.
//
// Per-tier caps and the atomic ceilings are env-overridable (see the var block)
// so operators can retune without a redeploy. The counter is incremented
// exactly once per authorized call and only when the call is actually going to
// be made — callers must not invoke SpendTier for cache hits, and must not
// re-invoke it on retries of an already-charged call.
package quota

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"sync/atomic"
	"time"

	"github.com/redis/go-redis/v9"
)

// Tier is the subscription level a paid call is charged against. It mirrors the
// plan vocabulary persisted in the JWT `plan` claim and in billing
// (free|pro|pro_plus|lifetime). Lifetime and Pro Plus are NOT unlimited — they
// get a high-but-finite ceiling.
type Tier int

const (
	TierFree Tier = iota
	TierPro
	TierProPlus
	TierLifetime
)

// String renders the tier as the canonical plan slug, also used as a Redis key
// segment so each tier counts against its own monthly bucket.
func (t Tier) String() string {
	switch t {
	case TierPro:
		return "pro"
	case TierProPlus:
		return "pro_plus"
	case TierLifetime:
		return "lifetime"
	default:
		return "free"
	}
}

// TierForPlan maps the persisted plan string onto a quota tier. isPro is a
// fallback for legacy access tokens minted before the `plan` claim existed: a
// token with is_pro=true but no plan is treated as Pro (never up-leveled to a
// higher paid tier without explicit plan evidence). Unknown/empty + not-pro =
// Free — the safe default that gets the tightest cap. This matches
// service.tierForPlan so the two budget systems agree on what each user is.
func TierForPlan(plan string, isPro bool) Tier {
	switch plan {
	case "pro_plus":
		return TierProPlus
	case "lifetime":
		return TierLifetime
	case "pro":
		return TierPro
	default:
		if isPro {
			return TierPro
		}
		return TierFree
	}
}

// ── Per-tier monthly caps ───────────────────────────────────────────────────
//
// EVERY tier has a FINITE monthly cap for EVERY paid provider — none are
// unlimited. Free is intentionally tiny (or 0) for the expensive scrapers so a
// free-heavy user base can't drive cost; the ladder is then pro < pro_plus ≤
// lifetime. (Lifetime is one-time revenue with no recurring income, so it sits
// at the same ceiling as Pro Plus rather than above it — generous, still
// bounded.) These are SHARED monthly pools per tier across all users of that
// tier and across the API + worker processes (same Redis), sized as cost
// kill-switches with headroom over expected volume, not per-user throttles.
//
// Numbers (monthly calls), and the env var that overrides each:
//
//	provider │ free                       │ pro                       │ pro_plus                       │ lifetime
//	─────────┼────────────────────────────┼───────────────────────────┼────────────────────────────────┼─────────────────────────────────
//	serpapi  │ 25  SERPAPI_CAP_FREE        │ 250  SERPAPI_CAP_PRO      │ 600  SERPAPI_CAP_PROPLUS       │ 600  SERPAPI_CAP_LIFETIME
//	apify    │ 0   APIFY_CAP_FREE          │ 1500 APIFY_CAP_PRO        │ 3000 APIFY_CAP_PROPLUS         │ 3000 APIFY_CAP_LIFETIME
//	tavily   │ 50  TAVILY_CAP_FREE         │ 1000 TAVILY_CAP_PRO       │ 2500 TAVILY_CAP_PROPLUS        │ 2500 TAVILY_CAP_LIFETIME
//
// Apify free is 0: the live Apify scrape is already Pro-gated in
// award_search.go, so a free user should never reach it — the 0 cap makes that
// a hard quota guarantee rather than relying on a single call-site check.
// A cap of <0 in the env is ignored (falls back to the default); 0 is a valid,
// meaningful cap (always exhausted ⇒ feature off for that tier).
var tierCaps = map[string]map[Tier]int{
	"serpapi": {
		TierFree:     envInt("SERPAPI_CAP_FREE", 25),
		TierPro:      envInt("SERPAPI_CAP_PRO", 250),
		TierProPlus:  envInt("SERPAPI_CAP_PROPLUS", 600),
		TierLifetime: envInt("SERPAPI_CAP_LIFETIME", 600),
	},
	"apify": {
		TierFree:     envInt("APIFY_CAP_FREE", 0),
		TierPro:      envInt("APIFY_CAP_PRO", 1500),
		TierProPlus:  envInt("APIFY_CAP_PROPLUS", 3000),
		TierLifetime: envInt("APIFY_CAP_LIFETIME", 3000),
	},
	"tavily": {
		TierFree:     envInt("TAVILY_CAP_FREE", 50),
		TierPro:      envInt("TAVILY_CAP_PRO", 1000),
		TierProPlus:  envInt("TAVILY_CAP_PROPLUS", 2500),
		TierLifetime: envInt("TAVILY_CAP_LIFETIME", 2500),
	},
}

// FreeTierLimits maps each provider to the LARGEST per-tier monthly cap. It is
// the aggregate envelope backing the legacy tier-agnostic Spend()/Remaining()
// shared-bucket path. Kept exported and named for backward compatibility; it is
// NOT the actual enforced cap — SpendTier enforces the per-tier caps in
// tierCaps. Per-tier callers should use TierCap / RemainingTier instead.
var FreeTierLimits = map[string]int{
	"serpapi": maxTierCap("serpapi"),
	"apify":   maxTierCap("apify"),
	"tavily":  maxTierCap("tavily"),
}

// processHardCaps is the absolute number of paid calls a SINGLE process will
// EVER authorize for each provider, regardless of Redis state or tier. This is
// the in-process atomic backstop (guarantee #2). Sized well above any
// legitimate single-instance month so it never trips in normal operation, but
// low enough that a runaway loop during a Redis outage is bounded to a known
// worst-case dollar amount. Override per provider via *_PROCESS_HARD_CAP.
var processHardCaps = map[string]int64{
	"serpapi": int64(envInt("SERPAPI_PROCESS_HARD_CAP", 1000)),
	"apify":   int64(envInt("APIFY_PROCESS_HARD_CAP", 4000)),
	"tavily":  int64(envInt("TAVILY_PROCESS_HARD_CAP", 4000)),
}

// processUsed holds the live per-process authorized-call counters that back the
// atomic ceiling. Package-level so the bound is per instance, not per Client —
// multiple Client values in one process (API + worker share a binary in tests)
// still share one hard ceiling.
var processUsed = map[string]*atomic.Int64{
	"serpapi": {},
	"apify":   {},
	"tavily":  {},
}

// TierCap returns the configured monthly cap for a provider+tier (0 if the
// provider or tier is unknown, or if that tier is disabled). Exported for
// callers that need the cap value itself — e.g. the worker's reserve math.
func TierCap(provider string, tier Tier) int {
	if m, ok := tierCaps[provider]; ok {
		return m[tier]
	}
	return 0
}

// maxTierCap returns the largest finite cap across tiers for a provider.
func maxTierCap(provider string) int {
	m, ok := tierCaps[provider]
	if !ok {
		return 0
	}
	max := 0
	for _, v := range m {
		if v > max {
			max = v
		}
	}
	return max
}

// envInt reads a non-negative integer override from the environment, falling
// back to def when unset or invalid. A negative value is treated as invalid so
// a typo can never silently disable a cap; 0 is accepted (a meaningful cap).
func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			return n
		}
	}
	return def
}

// CounterTTL is how long a monthly counter key persists. 32 days guarantees the
// next month's key is fresh; the TTL is only refreshed on key creation so usage
// measurement stays accurate within the month.
const CounterTTL = 32 * 24 * time.Hour

// redisDoer is the minimal slice of *redis.Client the quota counter needs.
// Depending on an interface (not the concrete client) lets tests inject a fake
// that returns errors on demand — the only way to exercise the fail-closed
// path without a live, deliberately-broken Redis. *redis.Client satisfies it.
type redisDoer interface {
	Incr(ctx context.Context, key string) *redis.IntCmd
	ExpireNX(ctx context.Context, key string, expiration time.Duration) *redis.BoolCmd
	Get(ctx context.Context, key string) *redis.StringCmd
}

// Client wraps a Redis connection with provider quota helpers.
type Client struct {
	rdb redisDoer
}

// New builds a quota client backed by the given Redis connection.
func New(rdb *redis.Client) *Client {
	return &Client{rdb: rdb}
}

// newWithDoer builds a Client over any redisDoer. Used by tests to inject a
// fake that can return errors (fail-closed path) without a live Redis.
func newWithDoer(rdb redisDoer) *Client {
	return &Client{rdb: rdb}
}

// resetProcessUsed zeroes the per-process atomic backstop counters. Test-only:
// the counters are process-lifetime by design, so tests reset them between
// cases to assert the ceiling deterministically.
func resetProcessUsed() {
	for _, c := range processUsed {
		c.Store(0)
	}
}

// monthKeyTier returns the Redis key for a provider+tier in the current UTC
// month. Format: "quota:{provider}:{tier}:{YYYY-MM}". Each tier counts against
// its own monthly bucket so one tier exhausting cannot starve another.
func monthKeyTier(provider string, tier Tier) string {
	return fmt.Sprintf("quota:%s:%s:%s", provider, tier.String(), time.Now().UTC().Format("2006-01"))
}

// monthKey returns the legacy shared (tier-agnostic) Redis key, used by the
// back-compat Spend() shim and Remaining(). Format: "quota:{provider}:{YYYY-MM}".
func monthKey(provider string) string {
	return fmt.Sprintf("quota:%s:%s", provider, time.Now().UTC().Format("2006-01"))
}

// reserveBackstop attempts to claim one paid call against the per-process
// atomic ceiling for provider. Returns false if the ceiling is already reached.
// On success the counter is incremented and stays incremented for the life of
// the process (cost is cumulative, so we never decrement). Unknown providers
// have no backstop and return true.
func reserveBackstop(provider string) bool {
	used, ok := processUsed[provider]
	if !ok {
		return true
	}
	hard, ok := processHardCaps[provider]
	if !ok || hard <= 0 {
		// hard==0 is a valid "this process makes zero paid calls" kill-switch.
		return hard != 0
	}
	// Atomically reserve a slot, then verify we stayed within the ceiling.
	// If we overshot, give the slot back and deny. Pin at the ceiling so the
	// counter can't run away under concurrency.
	if n := used.Add(1); n > hard {
		used.Store(hard)
		return false
	}
	return true
}

// SpendTier charges one paid call for provider against the given tier's monthly
// budget and the per-process atomic backstop, and reports whether the call is
// permitted.
//
// FAIL CLOSED: any Redis error (or an unknown provider/tier) returns
// exhausted=true alongside the error — the caller MUST NOT make the paid call.
// This is the denial-of-wallet guarantee: a Redis outage degrades the feature,
// it never uncaps spend.
//
// The atomic backstop slot is claimed LAST — only after Redis has authorized
// the call (INCR + TTL ok AND under cap). A denied call therefore never
// consumes a backstop slot; since the per-process counter is never decremented,
// counting denied calls would permanently leak slots and eventually trip the
// hard cap for the whole process even when a fresh month's Redis budget would
// allow the call.
//
// Call this exactly once per call that will actually be made: never for cache
// hits, never again on a retry of an already-charged call.
func (c *Client) SpendTier(ctx context.Context, provider string, tier Tier) (remaining int, exhausted bool, err error) {
	caps, ok := tierCaps[provider]
	if !ok {
		return 0, true, fmt.Errorf("unknown provider: %s", provider)
	}
	limit, ok := caps[tier]
	if !ok {
		return 0, true, fmt.Errorf("unknown tier %d for provider %s", tier, provider)
	}

	// A cap of 0 means this tier may never call this provider. Short-circuit
	// without touching Redis or the backstop so it stays free.
	if limit == 0 {
		return 0, true, nil
	}

	// (1) Redis monthly per-tier counter. FAIL CLOSED on any error.
	key := monthKeyTier(provider, tier)
	n, err := c.rdb.Incr(ctx, key).Result()
	if err != nil {
		// Deny: with no way to read the cap, allowing the call is exactly the
		// uncapped-spend outage scenario. The backstop slot has NOT been claimed
		// yet, so a denied call here never burns the per-process ceiling. (An
		// outage therefore denies calls — fail-closed — without leaking slots.)
		return 0, true, fmt.Errorf("quota incr: %w", err)
	}
	// Ensure the key always carries a TTL. ExpireNX sets it only when the key
	// has none, so it is idempotent on later hits AND self-healing: if the very
	// first Expire was ever lost (transient Redis error, or a crash between
	// INCR and EXPIRE), the next SpendTier repairs the missing TTL — otherwise a
	// TTL-less counter would never roll over and pin the tier as falsely
	// "exhausted" forever once it passed the cap.
	if err := c.rdb.ExpireNX(ctx, key, CounterTTL).Err(); err != nil {
		return 0, true, fmt.Errorf("quota expire: %w", err)
	}

	rem := limit - int(n)
	if rem < 0 {
		rem = 0
	}
	// exhausted once the count strictly exceeds the cap: the call landing
	// exactly ON the cap is still allowed, the next one is denied.
	if int(n) > limit {
		return rem, true, nil
	}

	// (2) Per-process atomic backstop — the hard, Redis-independent ceiling.
	// Claimed ONLY after Redis authorized the call (INCR + TTL ok AND under
	// cap), so every denied call — Redis error, expire error, or over-cap —
	// exits above WITHOUT consuming a slot. The counter is process-lifetime and
	// never decremented, so counting denied attempts would permanently leak
	// slots and eventually trip the hard cap for the whole process.
	if !reserveBackstop(provider) {
		return rem, true, fmt.Errorf("process hard cap reached for %s", provider)
	}

	return rem, false, nil
}

// Spend is the legacy tier-agnostic entry point, retained for callers that do
// not (yet) know the user's tier. It charges the SHARED monthly bucket and the
// same atomic backstop, and — like SpendTier — FAILS CLOSED on a Redis error.
// New paid call sites should prefer SpendTier so per-tier caps apply.
func (c *Client) Spend(ctx context.Context, provider string) (remaining int, exhausted bool, err error) {
	limit, ok := FreeTierLimits[provider]
	if !ok {
		return 0, true, fmt.Errorf("unknown provider: %s", provider)
	}
	if limit == 0 {
		return 0, true, nil
	}

	key := monthKey(provider)
	n, err := c.rdb.Incr(ctx, key).Result()
	if err != nil {
		return 0, true, fmt.Errorf("quota incr: %w", err)
	}
	if err := c.rdb.ExpireNX(ctx, key, CounterTTL).Err(); err != nil {
		return 0, true, fmt.Errorf("quota expire: %w", err)
	}

	rem := limit - int(n)
	if rem < 0 {
		rem = 0
	}
	if int(n) > limit {
		return rem, true, nil
	}

	// Claim the backstop slot only after Redis authorized the call (same
	// ordering as SpendTier) so a denied call never leaks a process-lifetime
	// slot.
	if !reserveBackstop(provider) {
		return rem, true, fmt.Errorf("process hard cap reached for %s", provider)
	}

	return rem, false, nil
}

// Remaining reports how many calls are left this month on the shared
// (tier-agnostic) bucket without consuming any, against the aggregate envelope.
// Used by the admin dashboard and the worker's reservation math. A missing key
// means the bucket has not been touched this month — full budget remaining.
// On a Redis error it returns the error so the worker can fail closed.
func (c *Client) Remaining(ctx context.Context, provider string) (int, error) {
	limit, ok := FreeTierLimits[provider]
	if !ok {
		return 0, fmt.Errorf("unknown provider: %s", provider)
	}
	if limit == 0 {
		return 0, nil
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

// RemainingTier reports how many calls are left this month for a specific tier
// without consuming any. A missing key means full budget remaining. On a Redis
// error it returns the error.
func (c *Client) RemainingTier(ctx context.Context, provider string, tier Tier) (int, error) {
	caps, ok := tierCaps[provider]
	if !ok {
		return 0, fmt.Errorf("unknown provider: %s", provider)
	}
	limit, ok := caps[tier]
	if !ok {
		return 0, fmt.Errorf("unknown tier %d for provider %s", tier, provider)
	}
	if limit == 0 {
		return 0, nil
	}
	used, err := c.rdb.Get(ctx, monthKeyTier(provider, tier)).Int()
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
