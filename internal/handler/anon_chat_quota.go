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

	count, err := rdb.Get(r.Context(), key).Int64()
	if err != nil && err != redis.Nil {
		fmt.Printf("warn: redis get anon chat quota: %v\n", err)
		return true
	}
	if count >= anonChatMonthlyCap {
		jsonErrorCode(w, "ANON_CHAT_LIMIT",
			"Anonymous chat is limited. Sign in for free, or upgrade to Pro for unlimited chat.",
			http.StatusTooManyRequests)
		return false
	}

	pipe := rdb.Pipeline()
	pipe.Incr(r.Context(), key)
	// 32-day TTL so the monthly bucket survives until the calendar month
	// rolls over, then expires on its own.
	pipe.Expire(r.Context(), key, 32*24*time.Hour)
	if _, err := pipe.Exec(r.Context()); err != nil {
		fmt.Printf("warn: redis incr anon chat quota: %v\n", err)
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
