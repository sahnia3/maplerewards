package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"maplerewards/internal/service"
)

type SQCHandler struct {
	svc *service.SQCService
}

func NewSQCHandler(svc *service.SQCService) *SQCHandler {
	return &SQCHandler{svc: svc}
}

// GetProjection handles GET /api/v1/wallet/{sessionID}/sqc-projection
func (h *SQCHandler) GetProjection(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	if sessionID == "" {
		jsonError(w, "session_id required", http.StatusBadRequest)
		return
	}
	out, err := h.svc.Project(r.Context(), sessionID)
	if err != nil {
		jsonMaskedError(w, "sqc.project", err, "could not compute SQC projection", http.StatusBadRequest)
		return
	}
	jsonOK(w, out)
}
