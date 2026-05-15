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
		jsonMaskedError(w, "devaluation.list", err, "could not load devaluation alerts", http.StatusBadRequest)
		return
	}
	jsonOK(w, out)
}

// ProjectAeroplan handles GET /api/v1/wallet/{sessionID}/devaluation/aeroplan-june-2026.
// Pro-gated; returns a dollar-exposure projection for the chart hike that
// takes effect 2026-06-01. Front-end uses this to render the urgency banner.
func (h *DevaluationHandler) ProjectAeroplan(w http.ResponseWriter, r *http.Request) {
	sid := chi.URLParam(r, "sessionID")
	out, err := h.svc.ProjectAeroplanJune2026(r.Context(), sid)
	if err != nil {
		jsonMaskedError(w, "devaluation.project_aeroplan", err, "could not compute Aeroplan projection", http.StatusBadRequest)
		return
	}
	jsonOK(w, out)
}
