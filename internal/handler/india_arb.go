package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"maplerewards/internal/service"
)

type IndiaArbHandler struct {
	svc *service.IndiaArbService
}

func NewIndiaArbHandler(svc *service.IndiaArbService) *IndiaArbHandler {
	return &IndiaArbHandler{svc: svc}
}

func (h *IndiaArbHandler) List(w http.ResponseWriter, r *http.Request) {
	sid := chi.URLParam(r, "sessionID")
	out, err := h.svc.List(r.Context(), sid)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonOK(w, out)
}
