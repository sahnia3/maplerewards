package handler

import (
	"encoding/json"
	"net/http"

	"maplerewards/internal/service"
)

type RecommendHandler struct {
	svc *service.RecommenderService
}

func NewRecommendHandler(svc *service.RecommenderService) *RecommendHandler {
	return &RecommendHandler{svc: svc}
}

func (h *RecommendHandler) Recommend(w http.ResponseWriter, r *http.Request) {
	var req service.RecommendRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if len(req.MonthlySpend) == 0 {
		jsonError(w, "monthly_spend is required", http.StatusBadRequest)
		return
	}
	// Upper bound: there are ~10 real spend categories. Reject an oversized map
	// so an anonymous caller can't pad the body with tens of thousands of keys
	// to amplify per-card scoring work (DoS hardening; the service also drops
	// unknown slugs and batches the DB lookups).
	if len(req.MonthlySpend) > 64 {
		jsonError(w, "too many spend categories", http.StatusBadRequest)
		return
	}

	scores, err := h.svc.Recommend(r.Context(), req)
	if err != nil {
		jsonInternalError(w, "recommend", err)
		return
	}

	jsonOK(w, scores)
}
