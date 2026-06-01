package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"maplerewards/internal/service"
)

// ChurnPlannerHandler serves the Pro welcome-bonus / churn-planner report.
type ChurnPlannerHandler struct {
	svc *service.ChurnPlannerService
}

func NewChurnPlannerHandler(svc *service.ChurnPlannerService) *ChurnPlannerHandler {
	return &ChurnPlannerHandler{svc: svc}
}

// GetPlan returns the best next cards to apply for (ranked by net first-year
// value, feasible bonuses first) plus the attractive cards currently blocked by
// an issuer cooldown. Pro + session ownership are enforced by middleware.
func (h *ChurnPlannerHandler) GetPlan(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	if sessionID == "" {
		jsonError(w, "session id required", http.StatusBadRequest)
		return
	}
	out, err := h.svc.Plan(r.Context(), sessionID)
	if err != nil {
		jsonMaskedError(w, "churn.plan", err, "could not build churn plan", http.StatusBadRequest)
		return
	}
	jsonOK(w, out)
}
