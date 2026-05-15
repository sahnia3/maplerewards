package handler

import (
	"net/http"

	"maplerewards/internal/metrics"
)

// AdminMetricsHandler exposes the in-process metric snapshot at
// GET /api/v1/admin/metrics. Gated by the admin middleware in main.go.
// Returns JSON only — Prometheus exposition format is deferred until a
// scrape stack actually exists (DEPLOY.md §8).
type AdminMetricsHandler struct{}

// NewAdminMetricsHandler is intentionally stateless — metrics are package
// globals in internal/metrics, so the handler is just a JSON renderer.
func NewAdminMetricsHandler() *AdminMetricsHandler {
	return &AdminMetricsHandler{}
}

// Get returns the current Snapshot.
func (h *AdminMetricsHandler) Get(w http.ResponseWriter, r *http.Request) {
	jsonOK(w, metrics.Now())
}
