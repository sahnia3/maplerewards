package metrics

import (
	"testing"
	"time"
)

func TestLatency_PercentilesAndSnapshot(t *testing.T) {
	route := "GET /test/percentiles"
	// 100 samples 1ms..100ms — percentiles are then trivially checkable.
	for i := 1; i <= 100; i++ {
		ObserveLatency(route, time.Duration(i)*time.Millisecond)
	}

	var found *RouteLatency
	for _, rl := range LatencySnapshot() {
		if rl.Route == route {
			r := rl
			found = &r
			break
		}
	}
	if found == nil {
		t.Fatal("route missing from latency snapshot")
	}
	if found.Count != 100 {
		t.Fatalf("count = %d, want 100", found.Count)
	}
	// With 1..100ms uniform, p50 ≈ 50ms, p95 ≈ 95ms, p99 ≈ 99ms. Allow a
	// small slack for the index-based percentile pick.
	if found.P50ms < 45 || found.P50ms > 55 {
		t.Fatalf("p50 = %.1f, expected ~50ms", found.P50ms)
	}
	if found.P95ms < 90 || found.P95ms > 100 {
		t.Fatalf("p95 = %.1f, expected ~95ms", found.P95ms)
	}
	if found.P99ms < 95 || found.P99ms > 100 {
		t.Fatalf("p99 = %.1f, expected ~99ms", found.P99ms)
	}
}

func TestLatency_AnthropicTokenCounters(t *testing.T) {
	in0 := AnthropicInputTokens.Value()
	out0 := AnthropicOutputTokens.Value()
	AddAnthropicTokens(1500, 800)
	AddAnthropicTokens(-5, 0) // negatives ignored
	if got := AnthropicInputTokens.Value() - in0; got != 1500 {
		t.Fatalf("input token delta = %d, want 1500", got)
	}
	if got := AnthropicOutputTokens.Value() - out0; got != 800 {
		t.Fatalf("output token delta = %d, want 800", got)
	}
}

func TestLatency_SnapshotIncludesNewFields(t *testing.T) {
	ObserveLatency("GET /x", 5*time.Millisecond)
	AddAnthropicTokens(10, 20)
	s := Now()
	if s.Latency == nil {
		t.Fatal("Snapshot.Latency must be non-nil")
	}
	if s.AnthropicCost == nil {
		t.Fatal("Snapshot.AnthropicCost must be non-nil")
	}
	if _, ok := s.AnthropicCost["input_tokens"]; !ok {
		t.Fatal("AnthropicCost must include input_tokens key")
	}
}
