package service

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// AIBudget tracks per-user Claude token spend in Redis, daily UTC-bucketed.
//
// Why per-user, not per-provider (vs internal/quota): the Anthropic monthly
// cost is the abuse vector. A motivated free-tier user could burn through
// $50/day in our budget by spamming /chat. We pre-check the budget before
// firing the API call, then consume tokens-in + tokens-out after the response
// to keep the counter honest.
//
// Limits are constants here. Bump them when product tiers change. Pro is 10×
// the free-tier limit — the typical Pro user with our knowledge base is well
// under that ceiling; the cap exists for runaway-loop protection, not for
// "use less."
const (
	// Daily per-user token budgets, by tier. Tightened 50K → 25K → 15K:
	// free chat is now a hard 2-messages/month funnel (see
	// freeChatMonthlyCap), so the daily token budget is just a per-request
	// abuse ceiling, not a usage allowance. 15K is comfortably enough for
	// one or two Haiku-routed answers while capping a single abusive free
	// request well under a cent of spend.
	// Sized to the economics, not just abuse: a maxed Sonnet-heavy day costs
	// roughly $0.10–0.15 per 100K tokens, so these ceilings bound the
	// worst-case monthly cost per user well below catastrophic. Real usage
	// is expected to be a tiny fraction (a complex query every few days).
	FreeDailyTokenBudget     = 15_000  // 2 msgs/mo cap anyway — this is just a per-request abuse ceiling
	ProDailyTokenBudget      = 100_000 // $39.99/yr
	ProPlusDailyTokenBudget  = 200_000 // $69.99/yr — a real step up over Pro
	LifetimeDailyTokenBudget = 150_000 // $199 one-time, NO recurring revenue → tightest paid ceiling

	// MaxTokensPerRequest is the hard per-request ceiling. Even with daily
	// budget remaining, a single request estimated above this is rejected
	// outright. This is the "one request can't drain the quota" guarantee:
	// the history cap (capHistoryForLLM) bounds replay size, this bounds the
	// total. ~14K tokens ≈ system prompt + 12-msg history + a long question.
	MaxTokensPerRequest = 14_000

	// dailyTTL gives us a 1h grace window past UTC midnight so a request
	// that started at 23:59 doesn't trip a reset mid-flight.
	dailyTTL = 25 * time.Hour
)

// Tier is the subscription level for AI-budget purposes. Backend currently
// derives this from the is_pro JWT claim; Pro Plus is mapped once billing
// plumbs the higher tier through (see pricing restructure). Keeping the type
// here means callers can move to tier-aware budgets without touching this
// file again.
type Tier int

const (
	TierFree Tier = iota
	TierPro
	TierProPlus
	TierLifetime
)

// limitForTier returns the daily ceiling for an explicit tier.
func limitForTier(t Tier) int {
	switch t {
	case TierProPlus:
		return ProPlusDailyTokenBudget
	case TierLifetime:
		return LifetimeDailyTokenBudget
	case TierPro:
		return ProDailyTokenBudget
	default:
		return FreeDailyTokenBudget
	}
}

// tierForPlan maps the persisted plan string onto a budget tier. isPro is a
// fallback for legacy access tokens minted before the `plan` claim existed:
// a token with is_pro=true but no plan is treated as Pro (never up-leveled
// to Pro Plus without explicit plan evidence). Unknown/empty + not-pro =
// Free.
func tierForPlan(plan string, isPro bool) Tier {
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

// AIBudget is the daily-token tracker. Construct one and inject into AIService.
type AIBudget struct {
	rdb *redis.Client
}

// NewAIBudget wraps a Redis client with the token-budget helpers.
func NewAIBudget(rdb *redis.Client) *AIBudget {
	return &AIBudget{rdb: rdb}
}

// dailyKey builds the Redis key for a user's UTC day: "aibudget:{userID}:{YYYY-MM-DD}".
func dailyKey(userID string) string {
	return fmt.Sprintf("aibudget:%s:%s", userID, time.Now().UTC().Format("2006-01-02"))
}

// limitForPlan resolves the daily token ceiling from the user's plan
// (falling back to the is_pro bool for legacy tokens without a plan claim).
func limitForPlan(plan string, isPro bool) int {
	return limitForTier(tierForPlan(plan, isPro))
}

// RequestTooLarge reports whether a single request's estimated token count
// exceeds the hard per-request ceiling. Callers check this BEFORE the
// Anthropic call and reject with 413/429 — independent of remaining daily
// budget, so no single request can ever be pathologically expensive.
func RequestTooLarge(estTokens int) bool {
	return estTokens > MaxTokensPerRequest
}

// SecondsUntilUTCMidnight is the Retry-After header value to send when
// returning 429. Surfaces the precise wait time for the counter to roll.
func SecondsUntilUTCMidnight() int {
	now := time.Now().UTC()
	tomorrow := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, time.UTC)
	return int(tomorrow.Sub(now).Seconds())
}

// CheckBudget returns the user's current token usage today and whether they
// have already exhausted their daily allowance. Read-only — call this before
// firing the Claude request to short-circuit.
//
// An anonymous user (empty userID) is treated as "free tier, shared bucket"
// to prevent unauthenticated abuse. The shared key is `aibudget:anon:{day}`.
func (b *AIBudget) CheckBudget(ctx context.Context, userID, plan string, isPro bool) (used int, remaining int, exhausted bool, err error) {
	if b == nil || b.rdb == nil {
		// Budget service not configured — fail open. Operators get the
		// warning at startup and can wire Redis to enforce.
		return 0, limitForPlan(plan, isPro), false, nil
	}
	key := dailyKey(coalesceUserID(userID))
	limit := limitForPlan(plan, isPro)

	usedI64, err := b.rdb.Get(ctx, key).Int64()
	if err == redis.Nil {
		return 0, limit, false, nil
	}
	if err != nil {
		return 0, limit, false, fmt.Errorf("aibudget get: %w", err)
	}
	used = int(usedI64)
	rem := limit - used
	if rem < 0 {
		rem = 0
	}
	return used, rem, used >= limit, nil
}

// Consume increments the user's daily counter by tokens (typically
// input_tokens + output_tokens from the Anthropic response usage block).
// Returns the new used total + remaining; ignores negative or zero deltas.
//
// Best-effort: a Redis error here is logged by the caller but does not
// abort the chat response — we'd rather under-bill than fail the request.
func (b *AIBudget) Consume(ctx context.Context, userID, plan string, isPro bool, tokens int) (used int, remaining int, err error) {
	if b == nil || b.rdb == nil || tokens <= 0 {
		return 0, limitForPlan(plan, isPro), nil
	}
	key := dailyKey(coalesceUserID(userID))
	limit := limitForPlan(plan, isPro)

	n, err := b.rdb.IncrBy(ctx, key, int64(tokens)).Result()
	if err != nil {
		return 0, limit, fmt.Errorf("aibudget incrby: %w", err)
	}
	// Set TTL on first increment of the day.
	if int(n) == tokens {
		if err := b.rdb.Expire(ctx, key, dailyTTL).Err(); err != nil {
			return int(n), limit - int(n), fmt.Errorf("aibudget expire: %w", err)
		}
	}
	used = int(n)
	rem := limit - used
	if rem < 0 {
		rem = 0
	}
	return used, rem, nil
}

// coalesceUserID maps the empty session into a shared anonymous bucket so
// unauthenticated abuse can't bypass the limit by simply not signing in.
func coalesceUserID(userID string) string {
	if userID == "" {
		return "anon"
	}
	return userID
}
