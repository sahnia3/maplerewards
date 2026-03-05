package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"maplerewards/internal/service"
)

type WalletHandler struct {
	svc *service.WalletService
}

func NewWalletHandler(svc *service.WalletService) *WalletHandler {
	return &WalletHandler{svc: svc}
}

func (h *WalletHandler) Create(w http.ResponseWriter, r *http.Request) {
	user, err := h.svc.CreateWallet(r.Context())
	if err != nil {
		jsonError(w, "failed to create wallet", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, map[string]string{"session_id": user.SessionID})
}

func (h *WalletHandler) Get(w http.ResponseWriter, r *http.Request) {
	cards, err := h.svc.GetWallet(r.Context(), chi.URLParam(r, "sessionID"))
	if err != nil {
		jsonError(w, "wallet not found", http.StatusNotFound)
		return
	}
	jsonOK(w, cards)
}

func (h *WalletHandler) AddCard(w http.ResponseWriter, r *http.Request) {
	var body struct {
		CardID string `json:"card_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.CardID == "" {
		jsonError(w, "card_id required", http.StatusBadRequest)
		return
	}
	if err := h.svc.AddCard(r.Context(), chi.URLParam(r, "sessionID"), body.CardID); err != nil {
		jsonError(w, "failed to add card", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *WalletHandler) RemoveCard(w http.ResponseWriter, r *http.Request) {
	err := h.svc.RemoveCard(r.Context(), chi.URLParam(r, "sessionID"), chi.URLParam(r, "cardID"))
	if err != nil {
		jsonError(w, "failed to remove card", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *WalletHandler) UpdateBalance(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Balance int64 `json:"balance"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "balance required", http.StatusBadRequest)
		return
	}
	err := h.svc.UpdateBalance(r.Context(), chi.URLParam(r, "sessionID"), chi.URLParam(r, "cardID"), body.Balance)
	if err != nil {
		jsonError(w, "failed to update balance", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
