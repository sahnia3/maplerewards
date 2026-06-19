package handler

import (
	"encoding/json"
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

// ListProjections handles GET /api/v1/wallet/{sessionID}/devaluation-projections.
// Returns a per-program Today→After points projection + synthetic trend for every
// upcoming event the user holds, with the persisted alert_enabled flag. Free.
func (h *DevaluationHandler) ListProjections(w http.ResponseWriter, r *http.Request) {
	sid := chi.URLParam(r, "sessionID")
	out, err := h.svc.ListProjections(r.Context(), sid)
	if err != nil {
		jsonMaskedError(w, "devaluation.projections", err, "could not load projections", http.StatusBadRequest)
		return
	}
	jsonOK(w, out)
}

// ListAlertSubs handles GET /api/v1/wallet/{sessionID}/devaluation-alerts.
func (h *DevaluationHandler) ListAlertSubs(w http.ResponseWriter, r *http.Request) {
	sid := chi.URLParam(r, "sessionID")
	out, err := h.svc.ListSubscriptions(r.Context(), sid)
	if err != nil {
		jsonMaskedError(w, "devaluation.alerts.list", err, "could not load alerts", http.StatusBadRequest)
		return
	}
	jsonOK(w, out)
}

// SetAlert handles PUT /api/v1/wallet/{sessionID}/devaluation-alerts.
func (h *DevaluationHandler) SetAlert(w http.ResponseWriter, r *http.Request) {
	sid := chi.URLParam(r, "sessionID")
	var req struct {
		ProgramSlug string `json:"program_slug"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	a, err := h.svc.Subscribe(r.Context(), sid, req.ProgramSlug)
	if err != nil {
		jsonMaskedError(w, "devaluation.alerts.set", err, "could not save alert", http.StatusBadRequest)
		return
	}
	jsonOK(w, a)
}

// DeleteAlert handles DELETE /api/v1/wallet/{sessionID}/devaluation-alerts/{programSlug}.
func (h *DevaluationHandler) DeleteAlert(w http.ResponseWriter, r *http.Request) {
	sid := chi.URLParam(r, "sessionID")
	programSlug := chi.URLParam(r, "programSlug")
	if err := h.svc.Unsubscribe(r.Context(), sid, programSlug); err != nil {
		jsonMaskedError(w, "devaluation.alerts.delete", err, "could not remove alert", http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
