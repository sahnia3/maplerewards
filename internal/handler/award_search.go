package handler

import (
	"encoding/json"
	"net/http"

	"maplerewards/internal/model"
	"maplerewards/internal/service"
)

// AwardSearchHandler handles POST /api/v1/trip/award-search.
type AwardSearchHandler struct {
	svc *service.AwardSearchService
}

// NewAwardSearchHandler creates the handler.
func NewAwardSearchHandler(svc *service.AwardSearchService) *AwardSearchHandler {
	return &AwardSearchHandler{svc: svc}
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
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	jsonOK(w, results)
}
