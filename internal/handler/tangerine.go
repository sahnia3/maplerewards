package handler

import (
	"net/http"

	"maplerewards/internal/service"
)

type TangerineHandler struct {
	svc *service.TangerineService
}

func NewTangerineHandler(svc *service.TangerineService) *TangerineHandler {
	return &TangerineHandler{svc: svc}
}

func (h *TangerineHandler) List(w http.ResponseWriter, r *http.Request) {
	out, err := h.svc.List(r.Context())
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonOK(w, out)
}
