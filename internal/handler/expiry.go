package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"maplerewards/internal/service"
)

// ExpiryGuardianHandler serves the Pro points-expiry-guardian report.
type ExpiryGuardianHandler struct {
	svc *service.ExpiryGuardianService
}

func NewExpiryGuardianHandler(svc *service.ExpiryGuardianService) *ExpiryGuardianHandler {
	return &ExpiryGuardianHandler{svc: svc}
}

// GetGuardian returns, for every tracked loyalty account, when its points
// effectively expire, the CAD at risk, and how to reset the clock. Pro +
// session ownership are enforced by middleware.
func (h *ExpiryGuardianHandler) GetGuardian(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	if sessionID == "" {
		jsonError(w, "session id required", http.StatusBadRequest)
		return
	}
	out, err := h.svc.Assess(r.Context(), sessionID)
	if err != nil {
		jsonMaskedError(w, "expiry.assess", err, "could not build expiry report", http.StatusBadRequest)
		return
	}
	jsonOK(w, out)
}
