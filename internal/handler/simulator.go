package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"maplerewards/internal/service"
)

// SimulatorHandler serves the Pro wallet simulator: net annual-value impact of
// adding and/or dropping cards.
type SimulatorHandler struct {
	svc *service.SimulatorService
}

func NewSimulatorHandler(svc *service.SimulatorService) *SimulatorHandler {
	return &SimulatorHandler{svc: svc}
}

// simulateRequest is the POST body: which cards to add and/or drop. Both arrays
// are optional; an empty body just re-prices the current wallet against itself.
type simulateRequest struct {
	AddCardIDs  []string `json:"add_card_ids"`
	DropCardIDs []string `json:"drop_card_ids"`
}

// Simulate computes baseline vs. simulated annual reward value, the fee delta,
// and the net change after fees for the wallet behind sessionID. Pro + session
// ownership are enforced by middleware.
func (h *SimulatorHandler) Simulate(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	if sessionID == "" {
		jsonError(w, "session id required", http.StatusBadRequest)
		return
	}

	var req simulateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	out, err := h.svc.Simulate(r.Context(), sessionID, req.AddCardIDs, req.DropCardIDs)
	if err != nil {
		// Array-bound violation is a clean client error — surface its message
		// directly rather than masking it.
		if errors.Is(err, service.ErrSimulatorTooManyCards) {
			jsonError(w, err.Error(), http.StatusBadRequest)
			return
		}
		jsonMaskedError(w, "simulator.simulate", err, "could not run wallet simulation", http.StatusBadRequest)
		return
	}
	jsonOK(w, out)
}
