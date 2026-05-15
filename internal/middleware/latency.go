package middleware

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"maplerewards/internal/metrics"
)

// LatencyRecorder times every request and reports it against the chi route
// PATTERN (e.g. "/api/v1/cards/{id}"), not the concrete path. Using the
// pattern keeps metric cardinality bounded — otherwise every card UUID
// would spawn its own reservoir and blow up memory.
//
// Placed late in the chain (after routing) so chi.RouteContext has the
// matched pattern populated. The duration covers handler execution +
// downstream middleware, which is what "how slow is this endpoint" means
// operationally.
func LatencyRecorder(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)

		// RoutePattern is only available after the router has matched. If
		// it's empty (404, or middleware ran before routing), fall back to
		// a single "unrouted" bucket rather than the raw path.
		pattern := "unrouted"
		if rctx := chi.RouteContext(r.Context()); rctx != nil {
			if p := rctx.RoutePattern(); p != "" {
				pattern = r.Method + " " + p
			}
		}
		metrics.ObserveLatency(pattern, time.Since(start))
	})
}
