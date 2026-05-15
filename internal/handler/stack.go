package handler

import (
	"encoding/json"
	"net/http"

	mw "maplerewards/internal/middleware"
	"maplerewards/internal/model"
	"maplerewards/internal/service"
)

type StackHandler struct {
	svc           *service.StackService
	sessionLookup mw.SessionOwnerLookup // may be nil in tests
}

// NewStackHandler requires a session-owner lookup (pass nil in tests).
// Positional argument closes the IDOR variadic-fallback footgun.
func NewStackHandler(svc *service.StackService, sessionLookup mw.SessionOwnerLookup) *StackHandler {
	return &StackHandler{svc: svc, sessionLookup: sessionLookup}
}

func (h *StackHandler) ListMerchants(w http.ResponseWriter, r *http.Request) {
	out, err := h.svc.ListMerchants(r.Context())
	if err != nil {
		jsonMaskedError(w, "stack.list_merchants", err, "could not load merchants", http.StatusBadRequest)
		return
	}
	jsonOK(w, out)
}

func (h *StackHandler) Recommend(w http.ResponseWriter, r *http.Request) {
	var req model.StackRecommendRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	// Body-sessionID IDOR fix: stack recommender reads wallet to inform
	// per-card layering. Gate on session ownership before computing.
	if req.SessionID != "" && !requireBodySessionOwner(w, r, h.sessionLookup, req.SessionID) {
		return
	}
	out, err := h.svc.Recommend(r.Context(), req)
	if err != nil {
		jsonMaskedError(w, "stack.recommend", err, "could not compute stack recommendation", http.StatusBadRequest)
		return
	}
	jsonOK(w, out)
}
