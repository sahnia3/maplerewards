package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"maplerewards/internal/service"
)

type DevaluationHandler struct {
	svc *service.DevaluationService
}

func NewDevaluationHandler(svc *service.DevaluationService) *DevaluationHandler {
	return &DevaluationHandler{svc: svc}
}

// List handles GET /api/v1/devaluations and GET /api/v1/wallet/{sessionID}/devaluations.
// Without sessionID, returns events without user-context flags.
func (h *DevaluationHandler) List(w http.ResponseWriter, r *http.Request) {
	sid := chi.URLParam(r, "sessionID") // empty for /devaluations
	out, err := h.svc.ListAlerts(r.Context(), sid)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonOK(w, out)
}
