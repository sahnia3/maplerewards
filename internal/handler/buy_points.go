package handler

import (
	"encoding/json"
	"net/http"

	"maplerewards/internal/model"
	"maplerewards/internal/service"
)

type BuyPointsHandler struct {
	svc *service.BuyPointsService
}

func NewBuyPointsHandler(svc *service.BuyPointsService) *BuyPointsHandler {
	return &BuyPointsHandler{svc: svc}
}

func (h *BuyPointsHandler) ListPromos(w http.ResponseWriter, r *http.Request) {
	out, err := h.svc.ListPromos(r.Context())
	if err != nil {
		jsonMaskedError(w, "buy_points.list", err, "could not load buy-points promos", http.StatusBadRequest)
		return
	}
	jsonOK(w, out)
}

func (h *BuyPointsHandler) Evaluate(w http.ResponseWriter, r *http.Request) {
	var req model.BuyPointsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	out, err := h.svc.Evaluate(r.Context(), req)
	if err != nil {
		jsonMaskedError(w, "buy_points.evaluate", err, "could not evaluate buy-points promo", http.StatusBadRequest)
		return
	}
	jsonOK(w, out)
}
