package handler

import (
	"encoding/json"
	"net/http"

	mw "maplerewards/internal/middleware"
	"maplerewards/internal/model"
	"maplerewards/internal/service"
)

type TripHandler struct {
	tripSvc       *service.TripService
	sessionLookup mw.SessionOwnerLookup // may be nil in tests
}

// NewTripHandler requires a session-owner lookup (pass nil in tests).
// Positional argument prevents the IDOR fallback that variadic-with-nil
// hides — see internal/handler/session_owner.go for the nil-tolerance contract.
func NewTripHandler(tripSvc *service.TripService, sessionLookup mw.SessionOwnerLookup) *TripHandler {
	return &TripHandler{tripSvc: tripSvc, sessionLookup: sessionLookup}
}

func (h *TripHandler) Evaluate(w http.ResponseWriter, r *http.Request) {
	var req model.TripRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.SessionID == "" {
		jsonError(w, "session_id required", http.StatusBadRequest)
		return
	}

	// Body-sessionID IDOR fix: trip evaluation reads wallet card balances
	// for the transfer-partner math. Without this, a logged-in user could
	// peek at any anonymous wallet's redemption picture.
	if !requireBodySessionOwner(w, r, h.sessionLookup, req.SessionID) {
		return
	}

	if req.Cabin == "" {
		req.Cabin = "economy"
	}

	// Validate before the service forwards to paid external scrapers.
	// Hotels use free-text city; flights must be IATA codes.
	if req.TripType == "flight" {
		if !isValidIATA(req.Origin) || !isValidIATA(req.Destination) {
			jsonError(w, "flight origin and destination must be 3-letter airport codes", http.StatusBadRequest)
			return
		}
	} else if req.Origin == "" || req.Destination == "" {
		jsonError(w, "origin and destination required", http.StatusBadRequest)
		return
	}
	if !isValidFlightDate(req.Date) {
		jsonError(w, "date must be a valid YYYY-MM-DD within the next ~2 years", http.StatusBadRequest)
		return
	}
	if req.Passengers < 0 || req.Passengers > 9 {
		jsonError(w, "passengers must be between 1 and 9", http.StatusBadRequest)
		return
	}
	if req.Nights < 0 || req.Nights > 30 {
		jsonError(w, "nights must be 30 or fewer", http.StatusBadRequest)
		return
	}

	// Pro-gate the live Apify flight probe (set server-side from verified
	// JWT context — clients cannot forge this).
	req.IsPro = mw.IsProFromContext(r.Context())

	options, err := h.tripSvc.EvaluateTrip(r.Context(), req)
	if err != nil {
		jsonInternalError(w, "trip.evaluate", err)
		return
	}

	jsonOK(w, options)
}
