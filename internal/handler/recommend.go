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

	scores, err := h.svc.Recommend(r.Context(), req)
	if err != nil {
		jsonInternalError(w, "recommend", err)
		return
	}

	jsonOK(w, scores)
}
