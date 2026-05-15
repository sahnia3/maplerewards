package handler

import (
	"encoding/json"
	"net/http"

	mw "maplerewards/internal/middleware"
	"maplerewards/internal/model"
	"maplerewards/internal/service"
)

// AwardSearchHandler handles POST /api/v1/trip/award-search.
type AwardSearchHandler struct {
	svc           *service.AwardSearchService
	sessionLookup mw.SessionOwnerLookup // may be nil in tests
}

// NewAwardSearchHandler requires a session-owner lookup (pass nil in tests).
// Positional argument closes the IDOR variadic-fallback footgun.
func NewAwardSearchHandler(svc *service.AwardSearchService, sessionLookup mw.SessionOwnerLookup) *AwardSearchHandler {
	return &AwardSearchHandler{svc: svc, sessionLookup: sessionLookup}
}

// Search handles the award search request.
func (h *AwardSearchHandler) Search(w http.ResponseWriter, r *http.Request) {
	var req model.AwardSearchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.SessionID == "" {
		jsonError(w, "session_id required", http.StatusBadRequest)
		return
	}

	// Body-sessionID IDOR fix: the search loads wallet balances so the
	// "can_afford" badge is per-user. Without this, a logged-in user could
	// peek at any wallet's balance distribution.
	if !requireBodySessionOwner(w, r, h.sessionLookup, req.SessionID) {
		return
	}
	if req.Origin == "" {
		jsonError(w, "origin required", http.StatusBadRequest)
		return
	}
	if req.Destination == "" {
		jsonError(w, "destination required", http.StatusBadRequest)
		return
	}
	if req.Date == "" {
		jsonError(w, "date required (YYYY-MM-DD)", http.StatusBadRequest)
		return
	}
	if req.Cabin == "" {
		req.Cabin = "economy"
	}
	if req.Passengers <= 0 {
		req.Passengers = 1
	}

	results, err := h.svc.Search(r.Context(), req)
	if err != nil {
		jsonInternalError(w, "award_search.search", err)
		return
	}

	jsonOK(w, results)
}
