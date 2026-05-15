package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"

	"maplerewards/internal/middleware"
)

// ValuationRepoForAdmin captures the two valuation-repo methods this handler
// uses. Kept narrow so tests can satisfy it with function fields without
// pulling in the full pgxpool-backed repo.
type ValuationRepoForAdmin interface {
	UpsertValuation(ctx context.Context, programSlug, segment string, cppCents float64, source string) error
	InsertHistory(ctx context.Context, programSlug, segment string, cppCents float64, source string) error
}

// ValuationCacheForAdmin is the single cache method admin pushes need.
type ValuationCacheForAdmin interface {
	InvalidateValuation(ctx context.Context, programSlug, segment string) error
}

// AdminValuationHandler exposes POST /api/v1/admin/valuations for trusted
// operators to push fresh CPP numbers without touching the database
// directly. The middleware chain in main.go enforces admin gating; the
// handler is free to assume the request is authorized.
type AdminValuationHandler struct {
	repo  ValuationRepoForAdmin
	cache ValuationCacheForAdmin
}

// NewAdminValuationHandler constructs the handler.
func NewAdminValuationHandler(repo ValuationRepoForAdmin, cache ValuationCacheForAdmin) *AdminValuationHandler {
	return &AdminValuationHandler{repo: repo, cache: cache}
}

// AdminValuationPushItem is one row in the bulk push payload.
type AdminValuationPushItem struct {
	Slug     string  `json:"slug"`
	Segment  string  `json:"segment"`
	CPPCents float64 `json:"cpp_cents"`
	Source   string  `json:"source"`
}

// AdminValuationPushResponse summarizes the write.
type AdminValuationPushResponse struct {
	Count   int      `json:"count"`
	Skipped []string `json:"skipped,omitempty"`
}

// Push handles POST /api/v1/admin/valuations.
// Body: a JSON array of AdminValuationPushItem. Per row we Upsert, then
// InsertHistory, then InvalidateValuation. A bad row is skipped and
// reported back; one bad row never poisons the rest.
func (h *AdminValuationHandler) Push(w http.ResponseWriter, r *http.Request) {
	var items []AdminValuationPushItem
	if err := json.NewDecoder(r.Body).Decode(&items); err != nil {
		jsonError(w, "invalid JSON body: "+err.Error(), http.StatusBadRequest)
		return
	}
	if len(items) == 0 {
		jsonError(w, "at least one valuation row required", http.StatusBadRequest)
		return
	}

	adminEmail := middleware.EmailFromContext(r.Context())
	resp := AdminValuationPushResponse{}
	ctx := r.Context()

	for _, it := range items {
		if it.Slug == "" || it.Segment == "" {
			resp.Skipped = append(resp.Skipped, fmt.Sprintf("missing slug/segment in row: %+v", it))
			continue
		}
		if it.CPPCents <= 0 || it.CPPCents > 25 {
			// 25¢/point is a generous upper bound — anything above it is
			// almost certainly a unit mistake (e.g. dollars vs cents).
			resp.Skipped = append(resp.Skipped, fmt.Sprintf("cpp_cents out of range for %s/%s: %.2f", it.Slug, it.Segment, it.CPPCents))
			continue
		}
		source := it.Source
		if source == "" {
			source = "admin"
		}

		if err := h.repo.UpsertValuation(ctx, it.Slug, it.Segment, it.CPPCents, source); err != nil {
			slog.Warn("[admin-valuation] upsert failed",
				"slug", it.Slug, "segment", it.Segment, "err", err)
			resp.Skipped = append(resp.Skipped, fmt.Sprintf("%s/%s: %v", it.Slug, it.Segment, err))
			continue
		}
		if err := h.repo.InsertHistory(ctx, it.Slug, it.Segment, it.CPPCents, source); err != nil {
			// History failure is non-fatal — the live row is already updated.
			slog.Warn("[admin-valuation] history insert failed",
				"slug", it.Slug, "segment", it.Segment, "err", err)
		}
		if h.cache != nil {
			if err := h.cache.InvalidateValuation(ctx, it.Slug, it.Segment); err != nil {
				slog.Warn("[admin-valuation] cache invalidation failed",
					"slug", it.Slug, "segment", it.Segment, "err", err)
			}
		}
		resp.Count++
	}

	slog.Info("[admin-valuation] push complete",
		"admin", adminEmail, "count", resp.Count, "skipped", len(resp.Skipped))

	jsonOK(w, resp)
}

// Quota handles GET /api/v1/admin/quota — reports remaining monthly free-tier
// budget per external provider. Keeps the admin dashboard honest about what
// the production app is burning through.
type QuotaReader interface {
	Remaining(ctx context.Context, provider string) (int, error)
}

// AdminQuotaHandler is a thin wrapper around quota.Client for the admin
// dashboard. Lives in the same file as AdminValuationHandler since both
// serve the same /admin route group and share auth gating in main.go.
type AdminQuotaHandler struct {
	quota QuotaReader
}

func NewAdminQuotaHandler(q QuotaReader) *AdminQuotaHandler {
	return &AdminQuotaHandler{quota: q}
}

// QuotaReport is the response body for GET /admin/quota.
type QuotaReport struct {
	Provider  string `json:"provider"`
	Remaining int    `json:"remaining"` // -1 = unlimited
}

// Get returns remaining quota for each known provider.
func (h *AdminQuotaHandler) Get(w http.ResponseWriter, r *http.Request) {
	providers := []string{"serpapi", "apify", "tavily"}
	out := make([]QuotaReport, 0, len(providers))
	for _, p := range providers {
		rem, err := h.quota.Remaining(r.Context(), p)
		if err != nil {
			slog.Warn("[admin-quota] remaining failed", "provider", p, "err", err)
			continue
		}
		out = append(out, QuotaReport{Provider: p, Remaining: rem})
	}
	jsonOK(w, out)
}
