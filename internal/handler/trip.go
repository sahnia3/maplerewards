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

	options, err := h.tripSvc.EvaluateTrip(r.Context(), req)
	if err != nil {
		jsonInternalError(w, "trip.evaluate", err)
		return
	}

	jsonOK(w, options)
}
