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
	// Validate BEFORE the service forwards these to paid external scrapers
	// (Apify/Seats.aero/SerpAPI). Unvalidated junk burned metered quota and
	// could shape arbitrary third-party query strings.
	if !isValidIATA(req.Origin) {
		jsonError(w, "origin must be a 3-letter airport code", http.StatusBadRequest)
		return
	}
	if !isValidIATA(req.Destination) {
		jsonError(w, "destination must be a 3-letter airport code", http.StatusBadRequest)
		return
	}
	if !isValidFlightDate(req.Date) {
		jsonError(w, "date must be a valid YYYY-MM-DD within the next ~2 years", http.StatusBadRequest)
		return
	}
	if req.Cabin == "" {
		req.Cabin = "economy"
	}
	if req.Passengers <= 0 {
		req.Passengers = 1
	}
	if req.Passengers > 9 {
		jsonError(w, "passengers must be 9 or fewer", http.StatusBadRequest)
		return
	}

	// Pro-gate the live Apify scrape (the expensive path). Set server-side
	// from the verified JWT context — clients cannot forge this.
	req.IsPro = mw.IsProFromContext(r.Context())

	results, err := h.svc.Search(r.Context(), req)
	if err != nil {
		jsonInternalError(w, "award_search.search", err)
		return
	}

	jsonOK(w, results)
}
