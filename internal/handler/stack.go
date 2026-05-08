package handler

import (
	"encoding/json"
	"net/http"

	"maplerewards/internal/model"
	"maplerewards/internal/service"
)

type StackHandler struct {
	svc *service.StackService
}

func NewStackHandler(svc *service.StackService) *StackHandler { return &StackHandler{svc: svc} }

func (h *StackHandler) ListMerchants(w http.ResponseWriter, r *http.Request) {
	out, err := h.svc.ListMerchants(r.Context())
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonOK(w, out)
}

func (h *StackHandler) Recommend(w http.ResponseWriter, r *http.Request) {
	var req model.StackRecommendRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	out, err := h.svc.Recommend(r.Context(), req)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonOK(w, out)
}
