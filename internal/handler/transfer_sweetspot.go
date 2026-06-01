package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"maplerewards/internal/service"
)

// TransferSweetSpotHandler serves the Pro transfer sweet-spot report.
type TransferSweetSpotHandler struct {
	svc *service.TransferSweetSpotService
}

func NewTransferSweetSpotHandler(svc *service.TransferSweetSpotService) *TransferSweetSpotHandler {
	return &TransferSweetSpotHandler{svc: svc}
}

// GetSweetSpots returns, per program the user holds points in, the transfer-
// partner move that most increases value. Pro + session ownership are enforced
// by middleware.
func (h *TransferSweetSpotHandler) GetSweetSpots(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	if sessionID == "" {
		jsonError(w, "session id required", http.StatusBadRequest)
		return
	}
	out, err := h.svc.Find(r.Context(), sessionID)
	if err != nil {
		jsonMaskedError(w, "transfer.sweetspots", err, "could not build transfer sweet-spot report", http.StatusBadRequest)
		return
	}
	jsonOK(w, out)
}
