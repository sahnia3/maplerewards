package quota

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

// ── Fake redisDoer (interface + function fields, no testify) ────────────────
//
// fakeRedis lets a test drive the exact Redis behavior it needs — including
// returning an error from INCR — which is the only way to exercise the
// fail-closed gate without a live, deliberately-broken Redis. Counters are
// kept in-memory so the "allow until cap" tests don't need a server either.
type fakeRedis struct {
	incrFn    func(ctx context.Context, key string) (int64, error)
	expireErr error // returned from ExpireNX when set
	getFn     func(ctx context.Context, key string) (string, error)
	counts    map[string]int64 // default INCR backing store
	incrCalls int
}

func newFakeRedis() *fakeRedis { return &fakeRedis{counts: map[string]int64{}} }

func (f *fakeRedis) Incr(ctx context.Context, key string) *redis.IntCmd {
	f.incrCalls++
	if f.incrFn != nil {
		v, err := f.incrFn(ctx, key)
		return redis.NewIntResult(v, err)
	}
	f.counts[key]++
	return redis.NewIntResult(f.counts[key], nil)
}

func (f *fakeRedis) ExpireNX(ctx context.Context, key string, expiration time.Duration) *redis.BoolCmd {
	return redis.NewBoolResult(true, f.expireErr)
}

func (f *fakeRedis) Get(ctx context.Context, key string) *redis.StringCmd {
	if f.getFn != nil {
		v, err := f.getFn(ctx, key)
		return redis.NewStringResult(v, err)
	}
	return redis.NewStringResult("", redis.Nil)
}

// withTempCap temporarily overrides a provider+tier cap for the duration of a
// test and restores it after. Returns a restore func to defer.
func withTempCap(t *testing.T, provider string, tier Tier, v int) func() {
	t.Helper()
	orig := tierCaps[provider][tier]
	tierCaps[provider][tier] = v
	return func() { tierCaps[provider][tier] = orig }
}

// withTempHardCap temporarily overrides a provider's process hard cap.
func withTempHardCap(t *testing.T, provider string, v int64) func() {
	t.Helper()
	orig := processHardCaps[provider]
	processHardCaps[provider] = v
	return func() { processHardCaps[provider] = orig }
}

// ── CORE REGRESSION: fail CLOSED on a Redis error ───────────────────────────
//
// This is the bug the whole change exists to fix. If the counter can't be
// incremented, the paid-API gate MUST deny (exhausted=true) — never allow.
func TestSpendTier_RedisError_FailsClosed(t *testing.T) {
	resetProcessUsed()
	boom := errors.New("redis down")
	f := newFakeRedis()
	f.incrFn = func(ctx context.Context, key string) (int64, error) { return 0, boom }
	c := newWithDoer(f)

	for _, prov := range []string{"serpapi", "apify", "tavily"} {
		// Use a tier with a non-zero cap so we actually reach the Redis INCR
		// (a 0-cap tier short-circuits before Redis). Pro is non-zero for all.
		_, exhausted, err := c.SpendTier(context.Background(), prov, TierPro)
		if err == nil {
			t.Fatalf("%s: expected error on redis failure, got nil", prov)
		}
		if !exhausted {
			t.Fatalf("%s: FAIL-OPEN BUG — gate allowed the paid call on a Redis error (want exhausted=true)", prov)
		}
	}
}

// Spend (the legacy tier-agnostic shim) must ALSO fail closed on a Redis error.
func TestSpend_RedisError_FailsClosed(t *testing.T) {
	resetProcessUsed()
	f := newFakeRedis()
	f.incrFn = func(ctx context.Context, key string) (int64, error) {
		return 0, errors.New("redis down")
	}
	c := newWithDoer(f)

	_, exhausted, err := c.Spend(context.Background(), "serpapi")
	if err == nil || !exhausted {
		t.Fatalf("Spend on redis error: exhausted=%v err=%v (want exhausted=true, err!=nil)", exhausted, err)
	}
}

// An ExpireNX error must also fail closed (a counter we can't TTL is unsafe to
// trust — it could pin the cap forever).
func TestSpendTier_ExpireError_FailsClosed(t *testing.T) {
	resetProcessUsed()
	f := newFakeRedis()
	f.expireErr = errors.New("expire failed")
	c := newWithDoer(f)

	_, exhausted, err := c.SpendTier(context.Background(), "tavily", TierPro)
	if err == nil || !exhausted {
		t.Fatalf("expire error: exhausted=%v err=%v (want exhausted=true, err!=nil)", exhausted, err)
	}
}

// ── Per-tier cap: under-cap ALLOWS, at-cap ALLOWS, over-cap DENIES ──────────
//
// Runs for every tier (free, pro, pro_plus, lifetime) with a small injected
// cap so the boundary is cheap to exercise. The fake counts in memory.
func TestSpendTier_PerTierCapEnforced(t *testing.T) {
	for _, tier := range []Tier{TierFree, TierPro, TierProPlus, TierLifetime} {
		tier := tier
		t.Run(tier.String(), func(t *testing.T) {
			resetProcessUsed()
			const cap = 3
			defer withTempCap(t, "serpapi", tier, cap)()
			defer withTempHardCap(t, "serpapi", 1_000_000)() // keep backstop out of the way

			f := newFakeRedis()
			c := newWithDoer(f)
			ctx := context.Background()

			// Calls 1..cap land at or below the cap → allowed.
			for i := 1; i <= cap; i++ {
				rem, exhausted, err := c.SpendTier(ctx, "serpapi", tier)
				if err != nil {
					t.Fatalf("call %d: unexpected err %v", i, err)
				}
				if exhausted {
					t.Fatalf("call %d of %d: exhausted too early (under/at cap must allow)", i, cap)
				}
				if want := cap - i; rem != want {
					t.Fatalf("call %d: remaining=%d want %d", i, rem, want)
				}
			}
			// Call cap+1 exceeds the cap → denied.
			_, exhausted, err := c.SpendTier(ctx, "serpapi", tier)
			if err != nil {
				t.Fatalf("over-cap call: unexpected err %v", err)
			}
			if !exhausted {
				t.Fatalf("over-cap call: want exhausted=true, got false (cap not enforced for tier %s)", tier)
			}
		})
	}
}

// A tier with a 0 cap (default: apify free) must ALWAYS deny and must never
// touch Redis — a free user can never trigger a paid Apify scrape.
func TestSpendTier_ZeroCapAlwaysDenies(t *testing.T) {
	resetProcessUsed()
	defer withTempCap(t, "apify", TierFree, 0)()

	f := newFakeRedis()
	c := newWithDoer(f)
	_, exhausted, err := c.SpendTier(context.Background(), "apify", TierFree)
	if err != nil {
		t.Fatalf("zero-cap: unexpected err %v", err)
	}
	if !exhausted {
		t.Fatalf("zero-cap: want exhausted=true (tier disabled), got false")
	}
	if f.incrCalls != 0 {
		t.Fatalf("zero-cap must not touch Redis, but INCR was called %d times", f.incrCalls)
	}
}

// Tiers must be independent: exhausting free does not affect pro (separate keys).
func TestSpendTier_TiersAreIndependentKeys(t *testing.T) {
	resetProcessUsed()
	defer withTempCap(t, "serpapi", TierFree, 1)()
	defer withTempCap(t, "serpapi", TierPro, 5)()
	defer withTempHardCap(t, "serpapi", 1_000_000)()

	f := newFakeRedis()
	c := newWithDoer(f)
	ctx := context.Background()

	// Drain free (cap 1): 1st allowed, 2nd denied.
	if _, exh, _ := c.SpendTier(ctx, "serpapi", TierFree); exh {
		t.Fatalf("free call 1 should be allowed")
	}
	if _, exh, _ := c.SpendTier(ctx, "serpapi", TierFree); !exh {
		t.Fatalf("free call 2 should be denied (cap 1)")
	}
	// Pro is untouched — still allowed.
	if _, exh, _ := c.SpendTier(ctx, "serpapi", TierPro); exh {
		t.Fatalf("pro should be unaffected by free exhaustion")
	}
}

// ── In-process atomic backstop: trips even when Redis keeps saying "allow" ──
//
// The fake's INCR always returns 1 (well under any monthly cap), so ONLY the
// process hard cap can stop the calls. This is the defense-in-depth guarantee:
// a single instance can never exceed the absolute ceiling.
func TestProcessBackstop_TripsEvenWhenRedisAllows(t *testing.T) {
	resetProcessUsed()
	const hard = 5
	defer withTempHardCap(t, "serpapi", hard)()
	defer withTempCap(t, "serpapi", TierPro, 1_000_000)() // monthly cap effectively infinite

	f := newFakeRedis()
	f.incrFn = func(ctx context.Context, key string) (int64, error) {
		return 1, nil // every call looks like the first of the month → never monthly-exhausted
	}
	c := newWithDoer(f)
	ctx := context.Background()

	allowed := 0
	for i := 0; i < hard*3; i++ {
		_, exhausted, err := c.SpendTier(ctx, "serpapi", TierPro)
		if err != nil && !exhausted {
			t.Fatalf("call %d: err without exhausted: %v", i, err)
		}
		if !exhausted {
			allowed++
		}
	}
	if allowed != hard {
		t.Fatalf("backstop allowed %d paid calls, want exactly the hard cap %d", allowed, hard)
	}
	// Once tripped it stays tripped (counter pinned at the ceiling).
	if _, exhausted, _ := c.SpendTier(ctx, "serpapi", TierPro); !exhausted {
		t.Fatalf("backstop must remain tripped after the ceiling is hit")
	}
}

// The backstop is shared across providers' own counters but independent
// between providers: tripping serpapi must not block apify.
func TestProcessBackstop_IndependentPerProvider(t *testing.T) {
	resetProcessUsed()
	defer withTempHardCap(t, "serpapi", 1)()
	defer withTempHardCap(t, "apify", 1_000)()
	defer withTempCap(t, "serpapi", TierPro, 1_000_000)()
	defer withTempCap(t, "apify", TierPro, 1_000_000)()

	f := newFakeRedis()
	f.incrFn = func(ctx context.Context, key string) (int64, error) { return 1, nil }
	c := newWithDoer(f)
	ctx := context.Background()

	// Trip serpapi (hard cap 1): call 1 allowed, call 2 denied.
	if _, exh, _ := c.SpendTier(ctx, "serpapi", TierPro); exh {
		t.Fatalf("serpapi call 1 should be allowed")
	}
	if _, exh, _ := c.SpendTier(ctx, "serpapi", TierPro); !exh {
		t.Fatalf("serpapi call 2 should be denied by backstop")
	}
	// apify backstop is independent → still allowed.
	if _, exh, _ := c.SpendTier(ctx, "apify", TierPro); exh {
		t.Fatalf("apify must be unaffected by serpapi backstop")
	}
}

// ── Denied calls must NOT leak the per-process backstop slot ────────────────
//
// Regression for the bug where reserveBackstop ran BEFORE the Redis check, so
// every DENIED call (Redis error / expire error / over-cap) permanently burned
// a process-lifetime slot. With a small hard cap, enough denied attempts would
// trip the backstop and then block ALL subsequent calls — including ones a
// fresh month's Redis budget would allow — until the process restarted.
//
// The fix claims the slot LAST, only on the authorized path, so these denials
// leave processUsed untouched.
func TestSpendTier_DeniedCalls_DoNotLeakBackstop(t *testing.T) {
	t.Run("redis_incr_error", func(t *testing.T) {
		resetProcessUsed()
		defer withTempHardCap(t, "apify", 3)()
		defer withTempCap(t, "apify", TierPro, 1_000_000)()

		f := newFakeRedis()
		f.incrFn = func(ctx context.Context, key string) (int64, error) {
			return 0, errors.New("redis down")
		}
		c := newWithDoer(f)

		// Many more denied attempts than the hard cap — pre-fix this trips it.
		for i := 0; i < 10; i++ {
			if _, exh, err := c.SpendTier(context.Background(), "apify", TierPro); err == nil || !exh {
				t.Fatalf("attempt %d: want denied (exhausted+err) on redis error, got exhausted=%v err=%v", i, exh, err)
			}
		}
		if used := processUsed["apify"].Load(); used != 0 {
			t.Fatalf("denied redis-error calls leaked %d backstop slot(s); want 0", used)
		}
	})

	t.Run("expire_error", func(t *testing.T) {
		resetProcessUsed()
		defer withTempHardCap(t, "apify", 3)()
		defer withTempCap(t, "apify", TierPro, 1_000_000)()

		f := newFakeRedis()
		f.expireErr = errors.New("expire failed")
		c := newWithDoer(f)

		for i := 0; i < 10; i++ {
			if _, exh, err := c.SpendTier(context.Background(), "apify", TierPro); err == nil || !exh {
				t.Fatalf("attempt %d: want denied on expire error, got exhausted=%v err=%v", i, exh, err)
			}
		}
		if used := processUsed["apify"].Load(); used != 0 {
			t.Fatalf("denied expire-error calls leaked %d backstop slot(s); want 0", used)
		}
	})

	t.Run("over_cap", func(t *testing.T) {
		resetProcessUsed()
		const monthlyCap = 2
		defer withTempCap(t, "apify", TierPro, monthlyCap)()
		defer withTempHardCap(t, "apify", 3)()

		f := newFakeRedis()
		c := newWithDoer(f)
		ctx := context.Background()

		// Drain the monthly cap (2 authorized calls), then hammer over-cap
		// denials many times.
		for i := 1; i <= monthlyCap; i++ {
			if _, exh, err := c.SpendTier(ctx, "apify", TierPro); err != nil || exh {
				t.Fatalf("authorized call %d: exhausted=%v err=%v", i, exh, err)
			}
		}
		for i := 0; i < 10; i++ {
			if _, exh, _ := c.SpendTier(ctx, "apify", TierPro); !exh {
				t.Fatalf("over-cap attempt %d: want denied", i)
			}
		}
		// Only the 2 authorized calls consumed a backstop slot. If over-cap
		// denials leaked, used would be 3 (pinned at the hard cap) and the next
		// fresh-month call would be falsely blocked.
		if used := processUsed["apify"].Load(); used != int64(monthlyCap) {
			t.Fatalf("backstop used=%d, want %d (over-cap denials must not consume slots)", used, monthlyCap)
		}
	})
}

// After the fix, the backstop counts AUTHORIZED calls exactly — denied calls
// interleaved with allowed ones never advance the per-process counter, so the
// hard cap is reached only after exactly that many real paid calls.
func TestSpendTier_BackstopCountsOnlyAuthorized(t *testing.T) {
	resetProcessUsed()
	const hard = 4
	defer withTempHardCap(t, "apify", hard)()
	defer withTempCap(t, "apify", TierPro, 1_000_000)() // monthly cap effectively infinite

	f := newFakeRedis()
	// Alternate: even calls succeed (authorized), odd calls hit a redis error
	// (denied). Denied calls must not advance the backstop.
	authorized := 0
	call := 0
	f.incrFn = func(ctx context.Context, key string) (int64, error) {
		call++
		if call%2 == 0 {
			return 0, errors.New("transient redis error")
		}
		return 1, nil // always looks like first of month → never monthly-exhausted
	}
	c := newWithDoer(f)
	ctx := context.Background()

	for i := 0; i < hard*10; i++ {
		_, exh, err := c.SpendTier(ctx, "apify", TierPro)
		if err == nil && !exh {
			authorized++
		}
	}
	if authorized != hard {
		t.Fatalf("authorized %d calls before the hard cap, want exactly %d (denied calls must not consume the backstop)", authorized, hard)
	}
}

// ── TierForPlan mapping ─────────────────────────────────────────────────────
func TestTierForPlan(t *testing.T) {
	cases := []struct {
		plan  string
		isPro bool
		want  Tier
	}{
		{"free", false, TierFree},
		{"", false, TierFree},
		{"pro", false, TierPro},
		{"pro_plus", false, TierProPlus},
		{"lifetime", false, TierLifetime},
		{"", true, TierPro},        // legacy is_pro token, no plan claim
		{"garbage", true, TierPro}, // unknown plan + is_pro → Pro, never up-leveled
		{"garbage", false, TierFree},
	}
	for _, tc := range cases {
		if got := TierForPlan(tc.plan, tc.isPro); got != tc.want {
			t.Errorf("TierForPlan(%q, %v) = %v, want %v", tc.plan, tc.isPro, got, tc.want)
		}
	}
}

// Every provider has a FINITE, positive cap for every PAID tier, and the table
// honors free ≤ pro ≤ pro_plus and lifetime ≤ pro_plus (no unlimited anywhere).
func TestCaps_AllTiersFiniteAndOrdered(t *testing.T) {
	for _, prov := range []string{"serpapi", "apify", "tavily", "seatsaero", "anthropic"} {
		caps := tierCaps[prov]
		f, pro, pp, life := caps[TierFree], caps[TierPro], caps[TierProPlus], caps[TierLifetime]
		// No negatives, nothing "unlimited" (we removed the -1/0-as-unlimited sentinel).
		for tier, v := range caps {
			if v < 0 {
				t.Fatalf("%s %s cap is negative (%d) — caps must be finite & non-negative", prov, tier, v)
			}
		}
		// Paid tiers must be strictly usable (>0).
		if pro <= 0 || pp <= 0 || life <= 0 {
			t.Fatalf("%s: paid tiers must have positive caps (pro=%d proplus=%d lifetime=%d)", prov, pro, pp, life)
		}
		// Ladder: free ≤ pro ≤ pro_plus, and lifetime ≤ pro_plus (one-time revenue).
		if f > pro || pro > pp || life > pp {
			t.Fatalf("%s: cap ladder violated free=%d pro=%d proplus=%d lifetime=%d (want free≤pro≤proplus, lifetime≤proplus)", prov, f, pro, pp, life)
		}
	}
	// Apify free must be 0 — the live scrape is Pro-gated.
	if tierCaps["apify"][TierFree] != 0 {
		t.Fatalf("apify free cap = %d, want 0 (Pro-gated scraper)", tierCaps["apify"][TierFree])
	}
}

// ── Redis-backed integration tests (skip if no local Redis) ─────────────────
//
// These keep the live-counter contract honest. They run only when a Redis is
// reachable at localhost:6379; the mock-based tests above cover CI.
func newTestClient(t *testing.T) *Client {
	t.Helper()
	rdb := redis.NewClient(&redis.Options{Addr: "localhost:6379"})
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		t.Skipf("redis unavailable: %v", err)
	}
	c := New(rdb)
	resetProcessUsed()
	// Clear keys this test will touch so re-runs don't bleed (both shared and
	// per-tier shapes).
	for _, p := range []string{"serpapi", "apify", "tavily"} {
		_ = rdb.Del(ctx, monthKey(p)).Err()
		for _, tr := range []Tier{TierFree, TierPro, TierProPlus, TierLifetime} {
			_ = rdb.Del(ctx, monthKeyTier(p, tr)).Err()
		}
	}
	return c
}

func TestSpendTier_MonotonicAndRemaining_Redis(t *testing.T) {
	c := newTestClient(t)
	ctx := context.Background()

	limit := tierCaps["serpapi"][TierPro]
	if limit <= 1 {
		t.Skipf("serpapi pro cap too small to exercise: %d", limit)
	}

	rem1, exh1, err := c.SpendTier(ctx, "serpapi", TierPro)
	if err != nil || exh1 {
		t.Fatalf("first spend: exhausted=%v err=%v", exh1, err)
	}
	if rem1 != limit-1 {
		t.Fatalf("first remaining = %d, want %d", rem1, limit-1)
	}

	rem2, exh2, err := c.SpendTier(ctx, "serpapi", TierPro)
	if err != nil || exh2 {
		t.Fatalf("second spend: exhausted=%v err=%v", exh2, err)
	}
	if rem2 != limit-2 {
		t.Fatalf("second remaining = %d, want %d", rem2, limit-2)
	}
}

func TestSpendTier_UnknownProvider(t *testing.T) {
	c := newTestClient(t)
	_, exhausted, err := c.SpendTier(context.Background(), "bogus_provider", TierPro)
	if err == nil || !exhausted {
		t.Fatalf("unknown provider: want err + exhausted, got exhausted=%v err=%v", exhausted, err)
	}
}

func TestSpendTier_TTLApplied_Redis(t *testing.T) {
	c := newTestClient(t)
	ctx := context.Background()

	if _, _, err := c.SpendTier(ctx, "serpapi", TierPro); err != nil {
		t.Fatalf("spend: %v", err)
	}
	// Read TTL via a real client (the test client is the real one here).
	rc := c.rdb.(*redis.Client)
	ttl, err := rc.TTL(ctx, monthKeyTier("serpapi", TierPro)).Result()
	if err != nil {
		t.Fatalf("ttl: %v", err)
	}
	if ttl <= 0 || ttl > CounterTTL {
		t.Fatalf("ttl out of range: got %v, want (0, %v]", ttl, CounterTTL)
	}
}

func TestSpendTier_ExhaustionFlips_Redis(t *testing.T) {
	c := newTestClient(t)
	ctx := context.Background()
	rc := c.rdb.(*redis.Client)

	limit := tierCaps["tavily"][TierPro]
	key := monthKeyTier("tavily", TierPro)
	if err := rc.Set(ctx, key, limit-1, CounterTTL).Err(); err != nil {
		t.Fatalf("prime: %v", err)
	}
	if _, exh, err := c.SpendTier(ctx, "tavily", TierPro); err != nil || exh {
		t.Fatalf("spend at exactly limit: exhausted=%v err=%v (should NOT exhaust)", exh, err)
	}
	if _, exh, err := c.SpendTier(ctx, "tavily", TierPro); err != nil || !exh {
		t.Fatalf("spend past limit: exhausted=%v err=%v (SHOULD exhaust)", exh, err)
	}
}

func TestRemainingTier_FreshKeyReturnsLimit_Redis(t *testing.T) {
	c := newTestClient(t)
	rem, err := c.RemainingTier(context.Background(), "tavily", TierPro)
	if err != nil {
		t.Fatalf("remaining: %v", err)
	}
	if rem != tierCaps["tavily"][TierPro] {
		t.Fatalf("tavily pro remaining = %d, want full %d", rem, tierCaps["tavily"][TierPro])
	}
}

// TestSpendTier_SeatsAeroProvider guards the "seatsaero" provider registration:
// it must be recognized by SpendTier (no unknown-provider error) across every
// tier and carry positive caps — including a NON-ZERO free cap, because the
// live Seats.aero call is not Pro-gated, so a 0 free cap would silently kill
// award availability for free users.
func TestSpendTier_SeatsAeroProvider(t *testing.T) {
	resetProcessUsed()
	defer withTempHardCap(t, "seatsaero", 1_000_000)() // keep backstop out of the way

	f := newFakeRedis()
	c := newWithDoer(f)
	ctx := context.Background()

	for _, tier := range []Tier{TierFree, TierPro, TierProPlus, TierLifetime} {
		if cap := TierCap("seatsaero", tier); cap <= 0 {
			t.Fatalf("seatsaero %s cap = %d, want > 0 (provider must be registered with a usable cap)", tier, cap)
		}
		// A registered provider+tier must not return the unknown-provider error;
		// with a fresh fake Redis and a positive cap the first call is allowed.
		_, exhausted, err := c.SpendTier(ctx, "seatsaero", tier)
		if err != nil {
			t.Fatalf("seatsaero %s: unexpected err %v (provider not registered?)", tier, err)
		}
		if exhausted {
			t.Fatalf("seatsaero %s: first call exhausted=true, want false (cap must be > 0)", tier)
		}
	}
}

// TestSpendTier_AnthropicProvider guards the "anthropic" provider registration:
// it must be recognized by SpendTier (no unknown-provider error) across every
// tier and carry positive caps — including a NON-ZERO free cap, because chat is
// available to free users, so a 0 free cap would silently kill the whole free
// tier's chat. This is the global monthly backstop on the LLM provider.
func TestSpendTier_AnthropicProvider(t *testing.T) {
	resetProcessUsed()
	defer withTempHardCap(t, "anthropic", 1_000_000)() // keep backstop out of the way

	f := newFakeRedis()
	c := newWithDoer(f)
	ctx := context.Background()

	for _, tier := range []Tier{TierFree, TierPro, TierProPlus, TierLifetime} {
		if cap := TierCap("anthropic", tier); cap <= 0 {
			t.Fatalf("anthropic %s cap = %d, want > 0 (provider must be registered with a usable cap)", tier, cap)
		}
		_, exhausted, err := c.SpendTier(ctx, "anthropic", tier)
		if err != nil {
			t.Fatalf("anthropic %s: unexpected err %v (provider not registered?)", tier, err)
		}
		if exhausted {
			t.Fatalf("anthropic %s: first call exhausted=true, want false (cap must be > 0)", tier)
		}
	}
}

// TestSpendTier_AnthropicCapEnforced verifies the per-tier monthly cap actually
// short-circuits: calls at/below the cap are allowed, the next is denied. This
// is the denial-of-wallet guarantee for the LLM provider.
func TestSpendTier_AnthropicCapEnforced(t *testing.T) {
	resetProcessUsed()
	const cap = 3
	defer withTempCap(t, "anthropic", TierPro, cap)()
	defer withTempHardCap(t, "anthropic", 1_000_000)() // keep backstop out of the way

	f := newFakeRedis()
	c := newWithDoer(f)
	ctx := context.Background()

	for i := 1; i <= cap; i++ {
		_, exhausted, err := c.SpendTier(ctx, "anthropic", TierPro)
		if err != nil {
			t.Fatalf("call %d: unexpected err %v", i, err)
		}
		if exhausted {
			t.Fatalf("call %d of %d: exhausted too early", i, cap)
		}
	}
	if _, exhausted, err := c.SpendTier(ctx, "anthropic", TierPro); err != nil || !exhausted {
		t.Fatalf("over-cap call: want exhausted=true err=nil, got exhausted=%v err=%v", exhausted, err)
	}
}

// TestSpendTier_AnthropicFailsClosed verifies a Redis error denies the call
// (exhausted=true + err) — a quota outage must degrade chat, never uncap LLM
// spend.
func TestSpendTier_AnthropicFailsClosed(t *testing.T) {
	resetProcessUsed()
	f := newFakeRedis()
	f.incrFn = func(ctx context.Context, key string) (int64, error) {
		return 0, errors.New("redis down")
	}
	c := newWithDoer(f)
	_, exhausted, err := c.SpendTier(context.Background(), "anthropic", TierPro)
	if err == nil || !exhausted {
		t.Fatalf("redis error: want err + exhausted=true (fail-closed), got exhausted=%v err=%v", exhausted, err)
	}
}
