package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"maplerewards/internal/model"
	"maplerewards/internal/service"
)

type AwardWatchHandler struct {
	svc *service.AwardWatchService
}

func NewAwardWatchHandler(svc *service.AwardWatchService) *AwardWatchHandler {
	return &AwardWatchHandler{svc: svc}
}

func (h *AwardWatchHandler) List(w http.ResponseWriter, r *http.Request) {
	sid := chi.URLParam(r, "sessionID")
	out, err := h.svc.List(r.Context(), sid)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonOK(w, out)
}

func (h *AwardWatchHandler) Create(w http.ResponseWriter, r *http.Request) {
	sid := chi.URLParam(r, "sessionID")
	var req model.CreateAwardWatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	out, err := h.svc.Create(r.Context(), sid, req)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonOK(w, out)
}

func (h *AwardWatchHandler) Delete(w http.ResponseWriter, r *http.Request) {
	sid := chi.URLParam(r, "sessionID")
	wid := chi.URLParam(r, "watchID")
	if err := h.svc.Delete(r.Context(), sid, wid); err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
