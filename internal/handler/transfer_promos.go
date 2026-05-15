package handler

import (
	"net/http"

	"maplerewards/internal/repo"
)

// TransferPromoHandler exposes the detected transfer-bonus promo log. The
// list is genuinely public — it's the "what's hot in points right now"
// signal the entire Canadian rewards community already shares freely.
// Pro-specific personalization (which promos match the user's balances)
// is a frontend computation on top of this list, not a separate endpoint.
type TransferPromoHandler struct {
	repo *repo.TransferBonusRepo
}

func NewTransferPromoHandler(r *repo.TransferBonusRepo) *TransferPromoHandler {
	return &TransferPromoHandler{repo: r}
}

// ListActive handles GET /api/v1/transfer-promos/active.
func (h *TransferPromoHandler) ListActive(w http.ResponseWriter, r *http.Request) {
	promos, err := h.repo.ListActive(r.Context(), 50)
	if err != nil {
		jsonMaskedError(w, "transfer_promos.list", err, "could not load transfer promos", http.StatusBadRequest)
		return
	}
	if promos == nil {
		promos = []repo.TransferBonusEvent{}
	}
	jsonOK(w, promos)
}
