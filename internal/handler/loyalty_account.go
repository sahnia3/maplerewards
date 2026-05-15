package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"maplerewards/internal/model"
	"maplerewards/internal/service"
)

type LoyaltyAccountHandler struct {
	svc *service.LoyaltyAccountService
}

func NewLoyaltyAccountHandler(svc *service.LoyaltyAccountService) *LoyaltyAccountHandler {
	return &LoyaltyAccountHandler{svc: svc}
}

// List handles GET /wallet/{sessionID}/loyalty-accounts
func (h *LoyaltyAccountHandler) List(w http.ResponseWriter, r *http.Request) {
	sid := chi.URLParam(r, "sessionID")
	accounts, err := h.svc.List(r.Context(), sid)
	if err != nil {
		jsonError(w, "failed to list accounts", http.StatusInternalServerError)
		return
	}
	jsonOK(w, accounts)
}

// Create handles POST /wallet/{sessionID}/loyalty-accounts
func (h *LoyaltyAccountHandler) Create(w http.ResponseWriter, r *http.Request) {
	sid := chi.URLParam(r, "sessionID")
	var req model.CreateLoyaltyAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	a, err := h.svc.Create(r.Context(), sid, req)
	if err != nil {
		jsonMaskedError(w, "loyalty_account.create", err, "could not create loyalty account", http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, a)
}

// Update handles PUT /wallet/{sessionID}/loyalty-accounts/{accountID}
func (h *LoyaltyAccountHandler) Update(w http.ResponseWriter, r *http.Request) {
	sid := chi.URLParam(r, "sessionID")
	id := chi.URLParam(r, "accountID")
	var req model.UpdateLoyaltyAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	a, err := h.svc.Update(r.Context(), sid, id, req)
	if err != nil {
		jsonMaskedError(w, "loyalty_account.update", err, "could not update loyalty account", http.StatusBadRequest)
		return
	}
	jsonOK(w, a)
}

// Delete handles DELETE /wallet/{sessionID}/loyalty-accounts/{accountID}
func (h *LoyaltyAccountHandler) Delete(w http.ResponseWriter, r *http.Request) {
	sid := chi.URLParam(r, "sessionID")
	id := chi.URLParam(r, "accountID")
	if err := h.svc.Delete(r.Context(), sid, id); err != nil {
		jsonError(w, "failed to delete account", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
