package handler

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"maplerewards/internal/service"
)

type MissedRewardsHandler struct {
	svc *service.MissedRewardsService
}

func NewMissedRewardsHandler(svc *service.MissedRewardsService) *MissedRewardsHandler {
	return &MissedRewardsHandler{svc: svc}
}

// GetMissedRewards handles GET /api/v1/wallet/{sessionID}/missed-rewards?since=90&top=10
func (h *MissedRewardsHandler) GetMissedRewards(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	if sessionID == "" {
		jsonError(w, "session_id required", http.StatusBadRequest)
		return
	}

	sinceDays := 90 // default lookback window
	if v := r.URL.Query().Get("since"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 && n <= 3650 {
			sinceDays = n
		}
	}

	topN := 10
	if v := r.URL.Query().Get("top"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 100 {
			topN = n
		}
	}

	report, err := h.svc.ComputeMissedRewards(r.Context(), sessionID, sinceDays, topN)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonOK(w, report)
}
