package handler

import (
	"encoding/json"
	"net/http"

	"maplerewards/internal/model"
	"maplerewards/internal/service"
)

type OptimizerHandler struct {
	svc *service.OptimizerService
}

func NewOptimizerHandler(svc *service.OptimizerService) *OptimizerHandler {
	return &OptimizerHandler{svc: svc}
}

func (h *OptimizerHandler) GetBestCard(w http.ResponseWriter, r *http.Request) {
	var req model.OptimizeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.SessionID == "" || req.SpendAmount <= 0 {
		jsonError(w, "session_id and spend_amount > 0 are required", http.StatusBadRequest)
		return
	}
	if req.CategorySlug == "" && req.MCCCode == nil {
		jsonError(w, "provide category_slug or mcc_code", http.StatusBadRequest)
		return
	}

	recs, err := h.svc.GetBestCard(r.Context(), req)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonOK(w, recs)
}
