package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	mw "maplerewards/internal/middleware"
	"maplerewards/internal/model"
	"maplerewards/internal/service"
)

type BonusHandler struct {
	svc *service.BonusService
}

func NewBonusHandler(walletRepo service.WalletRepository, bonusRepo service.BonusRepository) *BonusHandler {
	return &BonusHandler{svc: service.NewBonusService(walletRepo, bonusRepo)}
}

// ListBonuses returns all bonus tracking rows for the user.
func (h *BonusHandler) ListBonuses(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	if sessionID == "" {
		jsonError(w, "session ID required", http.StatusBadRequest)
		return
	}

	bonuses, err := h.svc.ListBonuses(r.Context(), sessionID)
	if err != nil {
		if errors.Is(err, service.ErrSessionNotFound) {
			jsonError(w, "user not found", http.StatusNotFound)
			return
		}
		jsonInternalError(w, "bonuses.list", err)
		return
	}

	if bonuses == nil {
		bonuses = []model.WelcomeBonus{}
	}

	jsonOK(w, bonuses)
}

// ActivateBonus creates or retrieves a bonus tracking row for a specific card.
// Free tier is capped at 3 ACTIVE trackers (service.ErrBonusLimitReached →
// 402), matching the wallet's 5-card pattern.
func (h *BonusHandler) ActivateBonus(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	cardID := chi.URLParam(r, "cardID")

	if sessionID == "" || cardID == "" {
		jsonError(w, "session ID and card ID required", http.StatusBadRequest)
		return
	}

	bonus, err := h.svc.ActivateBonus(r.Context(), sessionID, cardID, mw.IsProFromContext(r.Context()))
	if err != nil {
		if errors.Is(err, service.ErrBonusLimitReached) {
			jsonError(w, "Free tier tracks up to 3 welcome bonuses — upgrade to Pro for unlimited tracking.", http.StatusPaymentRequired)
			return
		}
		if errors.Is(err, service.ErrSessionNotFound) {
			jsonError(w, "user not found", http.StatusNotFound)
			return
		}
		jsonInternalError(w, "bonuses.activate", err)
		return
	}

	jsonOK(w, bonus)
}
