package metrics

import (
	"expvar"
	"sort"
	"sync"
	"time"
)

// Latency tracking + Anthropic token-cost counters. Kept in-process and
// dependency-free, consistent with the rest of this package. A reservoir
// (fixed-size ring) per route gives approximate P50/P95/P99 without
// unbounded memory — exact percentiles aren't worth a TSDB at our scale.
//
// Why a reservoir not a full histogram: we want "is anything pathologically
// slow right now" answered in O(1) memory per route. The last N samples is
// a good-enough proxy and resets its own staleness as traffic flows.

const reservoirSize = 256

type routeReservoir struct {
	mu      sync.Mutex
	samples []float64 // milliseconds; ring buffer
	idx     int
	count   int64 // total observations (not just retained)
}

func (r *routeReservoir) observe(ms float64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.samples == nil {
		r.samples = make([]float64, reservoirSize)
	}
	r.samples[r.idx] = ms
	r.idx = (r.idx + 1) % reservoirSize
	r.count++
}

func (r *routeReservoir) percentiles() (p50, p95, p99 float64, n int64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.count == 0 {
		return 0, 0, 0, 0
	}
	retained := int(r.count)
	if retained > reservoirSize {
		retained = reservoirSize
	}
	cp := make([]float64, retained)
	copy(cp, r.samples[:retained])
	sort.Float64s(cp)
	pick := func(q float64) float64 {
		if retained == 0 {
			return 0
		}
		i := int(q * float64(retained))
		if i >= retained {
			i = retained - 1
		}
		return cp[i]
	}
	return pick(0.50), pick(0.95), pick(0.99), r.count
}

var (
	latMu      sync.RWMutex
	latByRoute = map[string]*routeReservoir{}

	// Anthropic token-cost counters. input/output split because output
	// tokens are ~5x the price — tracking them separately lets the admin
	// dashboard estimate $ spend, not just call volume.
	AnthropicInputTokens  = expvar.NewInt("mr.anthropic_input_tokens")
	AnthropicOutputTokens = expvar.NewInt("mr.anthropic_output_tokens")
)

// ObserveLatency records one request's duration against a route label.
// The label should be the route PATTERN ("/api/v1/cards/{id}") not the
// concrete path, so the cardinality stays bounded.
func ObserveLatency(routePattern string, d time.Duration) {
	latMu.RLock()
	res := latByRoute[routePattern]
	latMu.RUnlock()
	if res == nil {
		latMu.Lock()
		if res = latByRoute[routePattern]; res == nil {
			res = &routeReservoir{}
			latByRoute[routePattern] = res
		}
		latMu.Unlock()
	}
	res.observe(float64(d.Microseconds()) / 1000.0)
}

// AddAnthropicTokens accumulates the input/output token counts pulled from
// the Anthropic API usage block. Call from the chat path once the response
// usage is known.
func AddAnthropicTokens(in, out int) {
	if in > 0 {
		AnthropicInputTokens.Add(int64(in))
	}
	if out > 0 {
		AnthropicOutputTokens.Add(int64(out))
	}
}

// RouteLatency is the per-route percentile rollup in the snapshot.
type RouteLatency struct {
	Route   string  `json:"route"`
	Count   int64   `json:"count"`
	P50ms   float64 `json:"p50_ms"`
	P95ms   float64 `json:"p95_ms"`
	P99ms   float64 `json:"p99_ms"`
}

// LatencySnapshot returns the current per-route percentiles, sorted by
// p99 descending so the slowest endpoints surface first.
func LatencySnapshot() []RouteLatency {
	latMu.RLock()
	routes := make([]string, 0, len(latByRoute))
	for r := range latByRoute {
		routes = append(routes, r)
	}
	latMu.RUnlock()

	out := make([]RouteLatency, 0, len(routes))
	for _, rt := range routes {
		latMu.RLock()
		res := latByRoute[rt]
		latMu.RUnlock()
		p50, p95, p99, n := res.percentiles()
		out = append(out, RouteLatency{Route: rt, Count: n, P50ms: p50, P95ms: p95, P99ms: p99})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].P99ms > out[j].P99ms })
	return out
}
