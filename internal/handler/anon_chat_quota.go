package handler

import (
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// anonChatMonthlyCap is the per-IP MONTHLY message ceiling for
// unauthenticated chat. Chat is a paid feature; anonymous access is a tiny
// taste to drive sign-up, not a free assistant. 2/IP/month (matching the
// signed-in free tier) keeps anonymous Anthropic spend negligible even at
// thousands of visitors and removes the denial-of-wallet vector.
const anonChatMonthlyCap int64 = 2

// checkAnonymousChatQuota enforces a per-client-IP daily ceiling on chat
// requests for unauthenticated users. Returns true if the request should
// proceed; false if a 429 has already been written.
//
// Redis is the source of truth — middleware.RealIP normalizes RemoteAddr
// upstream so this works correctly behind reverse proxies. Falls open on
// Redis errors (logged) so a Redis outage doesn't break anonymous chat
// for everyone.
func checkAnonymousChatQuota(w http.ResponseWriter, r *http.Request, rdb *redis.Client) bool {
	ip := clientIP(r.RemoteAddr)
	if ip == "" {
		// No usable IP — fall open. Better to serve than to wedge ourselves
		// on a malformed RemoteAddr in some weird deployment.
		return true
	}
	month := time.Now().UTC().Format("2006-01")
	key := fmt.Sprintf("anon_chat_usage:%s:%s", ip, month)

	// Atomic INCR-first (matching quota.SpendTier) closes the TOCTOU race the
	// old GET-then-compare-then-increment path had: N concurrent requests from
	// one IP could all read count < cap before any increment landed and burst
	// past the per-IP cap. The returned value already includes this attempt, so
	// exactly anonChatMonthlyCap requests are admitted. Fails OPEN on a Redis
	// error so an outage doesn't wedge anonymous chat for everyone.
	count, err := rdb.Incr(r.Context(), key).Result()
	if err != nil {
		fmt.Printf("warn: redis incr anon chat quota: %v\n", err)
		return true
	}
	// ExpireNX sets the 32-day TTL only when the key has none, so repeat hits
	// within the month don't keep pushing the expiry out (which would let a
	// bucket outlive its calendar month). 32 days survives the month rollover.
	if err := rdb.ExpireNX(r.Context(), key, 32*24*time.Hour).Err(); err != nil {
		fmt.Printf("warn: redis expire anon chat quota: %v\n", err)
	}
	if count > anonChatMonthlyCap {
		jsonErrorCode(w, "ANON_CHAT_LIMIT",
			"Anonymous chat is limited. Sign in for free, or upgrade to Pro for unlimited chat.",
			http.StatusTooManyRequests)
		return false
	}
	return true
}

// clientIP extracts the host portion of a RemoteAddr like "1.2.3.4:5678"
// or "[::1]:5678". chi's RealIP middleware already normalizes proxy headers
// upstream, so r.RemoteAddr is the trusted source by the time we see it.
func clientIP(remoteAddr string) string {
	if remoteAddr == "" {
		return ""
	}
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		// RealIP may have set just an IP with no port — fall back to the raw value.
		return strings.TrimSpace(remoteAddr)
	}
	return host
}
