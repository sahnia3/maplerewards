package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	mw "maplerewards/internal/middleware"
	"maplerewards/internal/model"
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
	if err := h.svc.AddCard(r.Context(), chi.URLParam(r, "sessionID"), body.CardID, mw.IsProFromContext(r.Context())); err != nil {
		if errors.Is(err, service.ErrCardLimitReached) {
			jsonError(w, "Free tier is limited to 5 cards — upgrade to Pro for unlimited cards.", http.StatusPaymentRequired)
			return
		}
		if strings.Contains(err.Error(), "session not found") {
			jsonError(w, "session not found", http.StatusNotFound)
			return
		}
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
	// Pointer so an omitted/empty body ({}) is distinguishable from an
	// explicit 0 — otherwise a stray PUT silently zeroes the balance, the
	// P0.2 "shows 0 again" footgun (docs/LAUNCH-ISSUES.md).
	var body struct {
		Balance *int64 `json:"balance"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Balance == nil {
		jsonError(w, "balance is required", http.StatusBadRequest)
		return
	}
	if *body.Balance < 0 {
		jsonError(w, "balance cannot be negative", http.StatusBadRequest)
		return
	}
	err := h.svc.UpdateBalance(r.Context(), chi.URLParam(r, "sessionID"), chi.URLParam(r, "cardID"), *body.Balance)
	if err != nil {
		jsonError(w, "failed to update balance", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *WalletHandler) UpdateCardDetails(w http.ResponseWriter, r *http.Request) {
	var req model.UpdateCardDetailsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	err := h.svc.UpdateCardDetails(r.Context(), chi.URLParam(r, "sessionID"), chi.URLParam(r, "cardID"), req)
	if err != nil {
		jsonError(w, "failed to update card details", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
