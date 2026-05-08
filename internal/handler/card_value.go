package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"maplerewards/internal/service"
)

type CardValueHandler struct {
	svc *service.CardValueService
}

func NewCardValueHandler(svc *service.CardValueService) *CardValueHandler {
	return &CardValueHandler{svc: svc}
}

func (h *CardValueHandler) Summary(w http.ResponseWriter, r *http.Request) {
	sid := chi.URLParam(r, "sessionID")
	out, err := h.svc.Summary(r.Context(), sid)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonOK(w, out)
}
