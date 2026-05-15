package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"maplerewards/internal/service"
)

// WelcomeBonusMissionHandler wraps the enrichment service. One endpoint:
//   GET /api/v1/wallet/{sessionID}/welcome-bonus-mission (Pro-gated)
//
// Returns the enriched mission report with velocity, projected completion,
// miss-risk severity, and per-bonus recommendations.
type WelcomeBonusMissionHandler struct {
	svc *service.WelcomeBonusMissionService
}

func NewWelcomeBonusMissionHandler(svc *service.WelcomeBonusMissionService) *WelcomeBonusMissionHandler {
	return &WelcomeBonusMissionHandler{svc: svc}
}

func (h *WelcomeBonusMissionHandler) Get(w http.ResponseWriter, r *http.Request) {
	sid := chi.URLParam(r, "sessionID")
	if sid == "" {
		jsonError(w, "session ID required", http.StatusBadRequest)
		return
	}
	report, err := h.svc.Compute(r.Context(), sid)
	if err != nil {
		jsonMaskedError(w, "welcome_bonus_mission.compute", err, "could not compute mission report", http.StatusBadRequest)
		return
	}
	jsonOK(w, report)
}
