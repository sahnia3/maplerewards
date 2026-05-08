package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"maplerewards/internal/model"
	"maplerewards/internal/service"
)

type CreditsHandler struct {
	svc *service.CreditsService
}

func NewCreditsHandler(svc *service.CreditsService) *CreditsHandler {
	return &CreditsHandler{svc: svc}
}

// ListCredits handles GET /api/v1/wallet/{sessionID}/credits
func (h *CreditsHandler) ListCredits(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	if sessionID == "" {
		jsonError(w, "session_id required", http.StatusBadRequest)
		return
	}
	out, err := h.svc.ListCredits(r.Context(), sessionID)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonOK(w, out)
}

// RecordRedemption handles POST /api/v1/wallet/{sessionID}/credits/{creditDefID}/redeem
func (h *CreditsHandler) RecordRedemption(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	creditDefID := chi.URLParam(r, "creditDefID")
	if sessionID == "" || creditDefID == "" {
		jsonError(w, "session_id and credit_def_id required", http.StatusBadRequest)
		return
	}
	var req model.CreditRedemptionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	out, err := h.svc.RecordRedemption(r.Context(), sessionID, creditDefID, req)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonOK(w, out)
}
