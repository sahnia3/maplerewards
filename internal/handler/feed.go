package handler

import (
	"net/http"

	"maplerewards/internal/service"
)

type FeedHandler struct {
	svc *service.FeedAggregatorService
}

func NewFeedHandler(svc *service.FeedAggregatorService) *FeedHandler {
	return &FeedHandler{svc: svc}
}

// List handles GET /api/v1/feed/articles.
// Optional query param: ?category=devaluation|bonus|offer|guide|news|all
// Empty / "all" returns every article. Other values filter to that bucket.
func (h *FeedHandler) List(w http.ResponseWriter, r *http.Request) {
	category := r.URL.Query().Get("category")
	out, err := h.svc.Articles(r.Context(), category)
	if err != nil {
		jsonMaskedError(w, "feed.list", err, "could not load feed articles", http.StatusBadGateway)
		return
	}
	if out == nil {
		out = []service.FeedArticle{}
	}
	jsonOK(w, out)
}
