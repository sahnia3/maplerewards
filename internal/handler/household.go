package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"maplerewards/internal/service"
)

// HouseholdHandler serves the Pro household optimizer: who should use which card
// per category across a household's combined wallet, and which fee-carrying
// cards are redundant.
type HouseholdHandler struct {
	svc *service.HouseholdService
}

func NewHouseholdHandler(svc *service.HouseholdService) *HouseholdHandler {
	return &HouseholdHandler{svc: svc}
}

// householdRequest is the POST body: the partner's cards as catalog ids. The
// partner is never another user's account — only a list of card ids. Optional;
// an empty list just analyses the user's own wallet as the whole household.
type householdRequest struct {
	PartnerCardIDs []string `json:"partner_card_ids"`
}

// Analyze builds the household optimizer report for the wallet behind
// sessionID. Pro + session ownership are enforced by middleware; the only
// session touched is {sessionID}.
func (h *HouseholdHandler) Analyze(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	if sessionID == "" {
		jsonError(w, "session id required", http.StatusBadRequest)
		return
	}

	var req householdRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	out, err := h.svc.Analyze(r.Context(), sessionID, req.PartnerCardIDs)
	if err != nil {
		// Array-bound violation is a clean client error — surface its message
		// directly rather than masking it.
		if errors.Is(err, service.ErrHouseholdTooManyPartnerCards) {
			jsonError(w, err.Error(), http.StatusBadRequest)
			return
		}
		jsonMaskedError(w, "household.analyze", err, "could not build household report", http.StatusBadRequest)
		return
	}
	jsonOK(w, out)
}
