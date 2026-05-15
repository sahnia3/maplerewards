package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"maplerewards/internal/model"
	"maplerewards/internal/service"
)

type CardOfferHandler struct {
	svc *service.CardOfferService
}

func NewCardOfferHandler(svc *service.CardOfferService) *CardOfferHandler {
	return &CardOfferHandler{svc: svc}
}

// List handles GET /wallet/{sessionID}/offers?active=1
func (h *CardOfferHandler) List(w http.ResponseWriter, r *http.Request) {
	sid := chi.URLParam(r, "sessionID")
	activeOnly := r.URL.Query().Get("active") == "1"
	offers, err := h.svc.List(r.Context(), sid, activeOnly)
	if err != nil {
		jsonError(w, "failed to list offers", http.StatusInternalServerError)
		return
	}
	jsonOK(w, offers)
}

// Create handles POST /wallet/{sessionID}/offers
func (h *CardOfferHandler) Create(w http.ResponseWriter, r *http.Request) {
	sid := chi.URLParam(r, "sessionID")
	var req model.CreateCardOfferRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	o, err := h.svc.Create(r.Context(), sid, req)
	if err != nil {
		// Same IDOR-fix mapping as CSV import: card-not-in-wallet must be 403,
		// not 400, so attackers can't brute-force card_id → wallet via timing.
		if errors.Is(err, service.ErrCardNotInWallet) {
			jsonErrorCode(w, "FORBIDDEN", "the supplied card is not in your wallet", http.StatusForbidden)
			return
		}
		jsonMaskedError(w, "card_offer.create", err, "could not create offer", http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, o)
}

// MarkUsed handles POST /wallet/{sessionID}/offers/{offerID}/used
func (h *CardOfferHandler) MarkUsed(w http.ResponseWriter, r *http.Request) {
	sid := chi.URLParam(r, "sessionID")
	id := chi.URLParam(r, "offerID")
	if err := h.svc.MarkUsed(r.Context(), sid, id); err != nil {
		jsonMaskedError(w, "card_offer.mark_used", err, "could not mark offer as used", http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Delete handles DELETE /wallet/{sessionID}/offers/{offerID}
func (h *CardOfferHandler) Delete(w http.ResponseWriter, r *http.Request) {
	sid := chi.URLParam(r, "sessionID")
	id := chi.URLParam(r, "offerID")
	if err := h.svc.Delete(r.Context(), sid, id); err != nil {
		jsonError(w, "failed to delete offer", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
