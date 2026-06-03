package handler

import (
	"context"
	"fmt"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

// quotaTestRedis returns a redis client backed by a real server, or skips the
// test if none is reachable — matching the project's live-redis test pattern
// (internal/quota/quota_test.go). Each test mints a unique key prefix via the
// caller's IP so parallel runs don't collide; we also flush the specific key.
func quotaTestRedis(t *testing.T) *redis.Client {
	t.Helper()
	addr := "localhost:6379"
	rdb := redis.NewClient(&redis.Options{Addr: addr})
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		_ = rdb.Close()
		t.Skipf("redis not reachable at %s — skipping live quota test: %v", addr, err)
	}
	t.Cleanup(func() { _ = rdb.Close() })
	return rdb
}

// TestAnonChatQuotaAtomicity is the regression for bug #9 (TOCTOU): with the
// old GET-then-compare-then-increment path, a burst of N concurrent requests
// from one IP could all observe count < cap before any increment landed and
// blow past the per-IP cap. With the atomic INCR-first gate, exactly
// anonChatMonthlyCap requests must be admitted regardless of concurrency.
func TestAnonChatQuotaAtomicity(t *testing.T) {
	rdb := quotaTestRedis(t)
	ip := fmt.Sprintf("203.0.113.%d", time.Now().UnixNano()%250)
	month := time.Now().UTC().Format("2006-01")
	key := fmt.Sprintf("anon_chat_usage:%s:%s", ip, month)
	ctx := context.Background()
	rdb.Del(ctx, key)
	t.Cleanup(func() { rdb.Del(ctx, key) })

	const concurrency = 20
	var wg sync.WaitGroup
	results := make([]bool, concurrency)
	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			w := httptest.NewRecorder()
			r := httptest.NewRequest("POST", "/api/v1/chat", nil)
			r.RemoteAddr = ip + ":5678"
			results[idx] = checkAnonymousChatQuota(w, r, rdb)
		}(i)
	}
	wg.Wait()

	allowed := 0
	for _, ok := range results {
		if ok {
			allowed++
		}
	}
	if int64(allowed) != anonChatMonthlyCap {
		t.Fatalf("TOCTOU: expected exactly %d requests admitted, got %d (cap leaked under concurrency)", anonChatMonthlyCap, allowed)
	}

	// The counter must reflect every attempt (INCR-first counts attempts), and
	// the key must carry a TTL so the monthly bucket eventually rolls over.
	got, err := rdb.Get(ctx, key).Int64()
	if err != nil {
		t.Fatalf("read counter: %v", err)
	}
	if got != concurrency {
		t.Fatalf("counter = %d, want %d (every attempt should INCR exactly once)", got, concurrency)
	}
	ttl, err := rdb.TTL(ctx, key).Result()
	if err != nil {
		t.Fatalf("read TTL: %v", err)
	}
	if ttl <= 0 {
		t.Fatalf("expected a positive TTL on the monthly bucket, got %v", ttl)
	}
}

// TestAnonChatQuotaBoundary pins the exact admit/deny boundary: with the
// post-increment value compared as count > cap, request number cap is the last
// one admitted and cap+1 is the first denied.
func TestAnonChatQuotaBoundary(t *testing.T) {
	rdb := quotaTestRedis(t)
	ip := fmt.Sprintf("203.0.113.%d", 200+time.Now().UnixNano()%50)
	month := time.Now().UTC().Format("2006-01")
	key := fmt.Sprintf("anon_chat_usage:%s:%s", ip, month)
	ctx := context.Background()
	rdb.Del(ctx, key)
	t.Cleanup(func() { rdb.Del(ctx, key) })

	for i := int64(1); i <= anonChatMonthlyCap; i++ {
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/api/v1/chat", nil)
		r.RemoteAddr = ip + ":5678"
		if ok := checkAnonymousChatQuota(w, r, rdb); !ok {
			t.Fatalf("request %d/%d wrongly denied (should be within cap)", i, anonChatMonthlyCap)
		}
	}
	// The next request (cap+1) must be denied.
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/v1/chat", nil)
	r.RemoteAddr = ip + ":5678"
	if ok := checkAnonymousChatQuota(w, r, rdb); ok {
		t.Fatalf("request %d wrongly admitted (over cap %d)", anonChatMonthlyCap+1, anonChatMonthlyCap)
	}
	if w.Code != 429 {
		t.Fatalf("over-cap response code = %d, want 429", w.Code)
	}
}

// TestFreeChatQuotaAtomicity mirrors the anon test for the authenticated
// free-tier gate (checkFreeChatQuota): the same atomic INCR-first contract must
// hold so exactly freeChatMonthlyCap messages are admitted under a burst, and
// the bucket is keyed by a UTC month (bug #11) carrying a TTL.
func TestFreeChatQuotaAtomicity(t *testing.T) {
	rdb := quotaTestRedis(t)
	userID := fmt.Sprintf("free-user-%d", time.Now().UnixNano())
	key := chatUsageKey(userID)
	ctx := context.Background()
	rdb.Del(ctx, key)
	t.Cleanup(func() { rdb.Del(ctx, key) })

	// Bug #11: the key must use the UTC month, matching the anon cap / provider
	// quotas / daily budget — not local time.
	wantKey := fmt.Sprintf("chat_usage:%s:%s", userID, time.Now().UTC().Format("2006-01"))
	if key != wantKey {
		t.Fatalf("chatUsageKey not UTC-bucketed: got %q want %q", key, wantKey)
	}

	const concurrency = 25
	var wg sync.WaitGroup
	results := make([]bool, concurrency)
	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			w := httptest.NewRecorder()
			r := httptest.NewRequest("POST", "/api/v1/chat", nil)
			results[idx] = checkFreeChatQuota(w, r, rdb, userID)
		}(i)
	}
	wg.Wait()

	allowed := 0
	for _, ok := range results {
		if ok {
			allowed++
		}
	}
	if int64(allowed) != freeChatMonthlyCap {
		t.Fatalf("TOCTOU: expected exactly %d free messages admitted, got %d", freeChatMonthlyCap, allowed)
	}
	ttl, err := rdb.TTL(ctx, key).Result()
	if err != nil {
		t.Fatalf("read TTL: %v", err)
	}
	if ttl <= 0 {
		t.Fatalf("expected a positive TTL on the free-tier monthly bucket, got %v", ttl)
	}
}
