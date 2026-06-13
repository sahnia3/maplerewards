package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"maplerewards/internal/service"
)

type ApplicationHandler struct {
	svc *service.ApplicationService
}

func NewApplicationHandler(svc *service.ApplicationService) *ApplicationHandler {
	return &ApplicationHandler{svc: svc}
}

// List handles GET /wallet/{sessionID}/applications
func (h *ApplicationHandler) List(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	if sessionID == "" {
		jsonError(w, "session_id required", http.StatusBadRequest)
		return
	}
	apps, err := h.svc.List(r.Context(), sessionID)
	if err != nil {
		jsonInternalError(w, "list applications failed", err)
		return
	}
	jsonOK(w, map[string]any{"applications": apps})
}

// Create handles POST /wallet/{sessionID}/applications
func (h *ApplicationHandler) Create(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	if sessionID == "" {
		jsonError(w, "session_id required", http.StatusBadRequest)
		return
	}
	var req struct {
		CardID    string `json:"card_id"`
		AppliedAt string `json:"applied_at"`
		Status    string `json:"status"`
		Notes     string `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.CardID == "" || req.AppliedAt == "" {
		jsonError(w, "card_id and applied_at required", http.StatusBadRequest)
		return
	}
	app, err := h.svc.Record(r.Context(), sessionID, req.CardID, req.AppliedAt, req.Status, req.Notes)
	if err != nil {
		jsonMaskedError(w, "create-application", err, "could not record application", http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, app)
}

// UpdateStatus handles PUT /wallet/{sessionID}/applications/{applicationID}
func (h *ApplicationHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	appID := chi.URLParam(r, "applicationID")
	if sessionID == "" || appID == "" {
		jsonError(w, "session_id and application_id required", http.StatusBadRequest)
		return
	}
	var req struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Status == "" {
		jsonError(w, "status required", http.StatusBadRequest)
		return
	}
	app, err := h.svc.UpdateStatus(r.Context(), sessionID, appID, req.Status)
	if err != nil {
		jsonMaskedError(w, "update-application", err, "could not update application", http.StatusBadRequest)
		return
	}
	jsonOK(w, app)
}

// Delete handles DELETE /wallet/{sessionID}/applications/{applicationID}
func (h *ApplicationHandler) Delete(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	appID := chi.URLParam(r, "applicationID")
	if sessionID == "" || appID == "" {
		jsonError(w, "session_id and application_id required", http.StatusBadRequest)
		return
	}
	if err := h.svc.Delete(r.Context(), sessionID, appID); err != nil {
		jsonInternalError(w, "delete failed", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Eligibility handles GET /wallet/{sessionID}/cards/{cardID}/eligibility
func (h *ApplicationHandler) Eligibility(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	cardID := chi.URLParam(r, "cardID")
	if sessionID == "" || cardID == "" {
		jsonError(w, "session_id and card_id required", http.StatusBadRequest)
		return
	}
	res, err := h.svc.CheckEligibility(r.Context(), sessionID, cardID)
	if err != nil {
		jsonInternalError(w, "eligibility check failed", err)
		return
	}
	jsonOK(w, res)
}
