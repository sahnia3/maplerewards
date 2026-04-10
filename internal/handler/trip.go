package handler

import (
	"encoding/json"
	"net/http"

	"maplerewards/internal/model"
	"maplerewards/internal/service"
)

type TripHandler struct {
	tripSvc *service.TripService
}

func NewTripHandler(tripSvc *service.TripService) *TripHandler {
	return &TripHandler{tripSvc: tripSvc}
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

	if req.Cabin == "" {
		req.Cabin = "economy"
	}

	options, err := h.tripSvc.EvaluateTrip(r.Context(), req)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	jsonOK(w, options)
}
