// Package metrics exposes a tiny in-process counter set so the admin
// dashboard (and ops scripts) can answer "what's actually happening right
// now" without standing up Prometheus + a scrape stack. Backed by
// expvar.Int so the values are atomic and concurrent-safe.
//
// Why not Prometheus: DEPLOY.md explicitly defers Prometheus until needed.
// This package is the bridge — once a metrics pipeline exists, the same
// counters can publish via a Collector with no change to call sites.
package metrics

import (
	"expvar"
	"runtime"
	"sync"
	"time"
)

// Counters available across the binary. Each is a separate *expvar.Int so
// callers can `.Add(1)` without locking. Names match the upstream service
// (serpapi/apify/tavily/anthropic) plus a cache layer pair.
var (
	SerpAPICalls   = expvar.NewInt("mr.serpapi_calls")
	SerpAPIErrors  = expvar.NewInt("mr.serpapi_errors")
	ApifyCalls     = expvar.NewInt("mr.apify_calls")
	ApifyErrors    = expvar.NewInt("mr.apify_errors")
	TavilyCalls    = expvar.NewInt("mr.tavily_calls")
	AnthropicCalls = expvar.NewInt("mr.anthropic_calls")

	CacheHitsAwards  = expvar.NewInt("mr.cache_hits_awards")
	CacheMissAwards  = expvar.NewInt("mr.cache_miss_awards")
	CacheHitsWallet  = expvar.NewInt("mr.cache_hits_wallet")
	CacheMissWallet  = expvar.NewInt("mr.cache_miss_wallet")

	ChatRequestsFree  = expvar.NewInt("mr.chat_requests_free")
	ChatRequestsPro   = expvar.NewInt("mr.chat_requests_pro")
	ChatErrors        = expvar.NewInt("mr.chat_errors")
)

// bootTime stamps process start so /admin/metrics can report uptime without
// reaching into runtime debug. Set once via sync.Once on first read.
var (
	bootOnce sync.Once
	boot     time.Time
)

// Uptime returns the duration since the first call to it (which we trigger
// from package init via Snapshot). Practically: the process uptime.
func Uptime() time.Duration {
	bootOnce.Do(func() { boot = time.Now() })
	return time.Since(boot)
}

// Snapshot is the JSON shape /admin/metrics returns. Kept stable so a
// dashboard can grep for specific keys without breaking on changes.
type Snapshot struct {
	UptimeSeconds int64            `json:"uptime_seconds"`
	GoVersion     string           `json:"go_version"`
	NumGoroutine  int              `json:"num_goroutines"`
	Upstream      map[string]int64 `json:"upstream"`
	Cache         map[string]int64 `json:"cache"`
	Chat          map[string]int64 `json:"chat"`
	Memory        map[string]int64 `json:"memory"`
}

// Now builds a current snapshot. Cheap — no DB calls, no I/O.
func Now() Snapshot {
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)
	return Snapshot{
		UptimeSeconds: int64(Uptime().Seconds()),
		GoVersion:     runtime.Version(),
		NumGoroutine:  runtime.NumGoroutine(),
		Upstream: map[string]int64{
			"serpapi_calls":   SerpAPICalls.Value(),
			"serpapi_errors":  SerpAPIErrors.Value(),
			"apify_calls":     ApifyCalls.Value(),
			"apify_errors":    ApifyErrors.Value(),
			"tavily_calls":    TavilyCalls.Value(),
			"anthropic_calls": AnthropicCalls.Value(),
		},
		Cache: map[string]int64{
			"hits_awards":  CacheHitsAwards.Value(),
			"miss_awards":  CacheMissAwards.Value(),
			"hits_wallet":  CacheHitsWallet.Value(),
			"miss_wallet":  CacheMissWallet.Value(),
		},
		Chat: map[string]int64{
			"requests_free": ChatRequestsFree.Value(),
			"requests_pro":  ChatRequestsPro.Value(),
			"errors":        ChatErrors.Value(),
		},
		Memory: map[string]int64{
			"heap_alloc_bytes": int64(ms.HeapAlloc),
			"heap_sys_bytes":   int64(ms.HeapSys),
			"num_gc":           int64(ms.NumGC),
		},
	}
}

func init() {
	// Establish boot time on package load.
	Uptime()
}
