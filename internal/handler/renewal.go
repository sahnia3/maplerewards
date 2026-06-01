package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"maplerewards/internal/service"
)

// RenewalHandler serves the Pro renewal-optimizer report.
type RenewalHandler struct {
	svc *service.RenewalService
}

func NewRenewalHandler(svc *service.RenewalService) *RenewalHandler {
	return &RenewalHandler{svc: svc}
}

// GetRenewal returns keep / use-credits / downgrade-or-cancel verdicts for every
// card in the wallet. Pro + session ownership are enforced by middleware.
func (h *RenewalHandler) GetRenewal(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	if sessionID == "" {
		jsonError(w, "session id required", http.StatusBadRequest)
		return
	}
	out, err := h.svc.Assess(r.Context(), sessionID)
	if err != nil {
		jsonMaskedError(w, "renewal.assess", err, "could not build renewal report", http.StatusBadRequest)
		return
	}
	jsonOK(w, out)
}
