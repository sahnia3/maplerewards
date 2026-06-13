package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"maplerewards/internal/service"
)

type UserCPPHandler struct {
	svc *service.UserCPPService
}

func NewUserCPPHandler(svc *service.UserCPPService) *UserCPPHandler {
	return &UserCPPHandler{svc: svc}
}

// List handles GET /wallet/{sessionID}/cpp-overrides
func (h *UserCPPHandler) List(w http.ResponseWriter, r *http.Request) {
	sid := chi.URLParam(r, "sessionID")
	overrides, err := h.svc.List(r.Context(), sid)
	if err != nil {
		jsonMaskedError(w, "user_cpp.list", err, "could not load valuations", http.StatusBadRequest)
		return
	}
	if overrides == nil {
		overrides = []service.UserCPPOverride{}
	}
	jsonOK(w, map[string]any{"overrides": overrides})
}

// Set handles PUT /wallet/{sessionID}/cpp-overrides
func (h *UserCPPHandler) Set(w http.ResponseWriter, r *http.Request) {
	sid := chi.URLParam(r, "sessionID")
	var req struct {
		ProgramSlug string  `json:"program_slug"`
		Segment     string  `json:"segment"`
		CPPCAD      float64 `json:"cpp_cad"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	o, err := h.svc.Set(r.Context(), sid, req.ProgramSlug, req.Segment, req.CPPCAD)
	if err != nil {
		jsonMaskedError(w, "user_cpp.set", err, "could not save valuation", http.StatusBadRequest)
		return
	}
	jsonOK(w, o)
}

// Delete handles DELETE /wallet/{sessionID}/cpp-overrides/{programSlug}/{segment}
func (h *UserCPPHandler) Delete(w http.ResponseWriter, r *http.Request) {
	sid := chi.URLParam(r, "sessionID")
	programSlug := chi.URLParam(r, "programSlug")
	segment := chi.URLParam(r, "segment")
	if err := h.svc.Delete(r.Context(), sid, programSlug, segment); err != nil {
		jsonMaskedError(w, "user_cpp.delete", err, "could not delete valuation", http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
