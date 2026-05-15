package handler

import (
	"net/http"
	"time"

	"maplerewards/internal/service"
)

// AeroplanJune1Handler powers the public /tools/aeroplan-june-1 calculator
// page. Pure read-only — anyone can hit it, no auth required. The output is
// the same pre-/post-hike chart the marketing page renders, filtered by
// airport, region, and cabin query parameters.
//
// Why a handler instead of inline static data on the frontend: keeping the
// chart authoritative on the backend means a future update (corrections,
// new regions, additional partners) is a one-deploy fix. The frontend then
// keeps its own version stamp for cache-busting.
type AeroplanJune1Handler struct{}

func NewAeroplanJune1Handler() *AeroplanJune1Handler {
	return &AeroplanJune1Handler{}
}

// Query handles GET /tools/aeroplan-june-1?airport=YYZ&region=europe&cabin=business
func (h *AeroplanJune1Handler) Query(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	result := service.QueryAeroplanLockIn(service.LockInQuery{
		Airport: q.Get("airport"),
		Region:  q.Get("region"),
		Cabin:   q.Get("cabin"),
	})
	result.GeneratedAt = time.Now().UTC().Format(time.RFC3339)

	// 1h browser/CDN cache — the chart only changes when we deploy.
	w.Header().Set("Cache-Control", "public, max-age=3600")
	jsonOK(w, result)
}
