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
		jsonMaskedError(w, "missed_rewards.compute", err, "could not compute missed rewards report", http.StatusBadRequest)
		return
	}
	jsonOK(w, report)
}

// GetPreview handles GET /api/v1/wallet/{sessionID}/missed-rewards/preview?since=90
//
// FREE-TIER endpoint. Unlike GetMissedRewards (Pro-gated), this returns AT MOST
// a single computed missed-rewards line from the user's own logged spend plus a
// has-more flag, so the Insights page can teach free users with one real example
// instead of a misleading "$0.00 recoverable". It must be mounted on a route
// group WITHOUT RequirePro (session-owner gating still applies). The full
// forensics (totals, per-category, multi-row list) stays behind GetMissedRewards.
func (h *MissedRewardsHandler) GetPreview(w http.ResponseWriter, r *http.Request) {
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

	preview, err := h.svc.ComputeMissedRewardsPreview(r.Context(), sessionID, sinceDays)
	if err != nil {
		jsonMaskedError(w, "missed_rewards.preview", err, "could not compute missed rewards preview", http.StatusBadRequest)
		return
	}
	jsonOK(w, preview)
}
