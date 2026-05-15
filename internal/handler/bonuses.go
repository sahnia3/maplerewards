package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"maplerewards/internal/model"
	"maplerewards/internal/service"
)

type BonusHandler struct {
	walletRepo service.WalletRepository
	bonusRepo  service.BonusRepository
}

func NewBonusHandler(walletRepo service.WalletRepository, bonusRepo service.BonusRepository) *BonusHandler {
	return &BonusHandler{
		walletRepo: walletRepo,
		bonusRepo:  bonusRepo,
	}
}

// ListBonuses returns all bonus tracking rows for the user.
func (h *BonusHandler) ListBonuses(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	if sessionID == "" {
		jsonError(w, "session ID required", http.StatusBadRequest)
		return
	}

	user, err := h.walletRepo.GetUserBySession(r.Context(), sessionID)
	if err != nil {
		jsonError(w, "user not found", http.StatusNotFound)
		return
	}

	bonuses, err := h.bonusRepo.GetUserBonuses(r.Context(), user.ID)
	if err != nil {
		jsonInternalError(w, "bonuses.list", err)
		return
	}

	if bonuses == nil {
		bonuses = []model.WelcomeBonus{}
	}

	jsonOK(w, bonuses)
}

// ActivateBonus creates or retrieves a bonus tracking row for a specific card.
func (h *BonusHandler) ActivateBonus(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	cardID := chi.URLParam(r, "cardID")

	if sessionID == "" || cardID == "" {
		jsonError(w, "session ID and card ID required", http.StatusBadRequest)
		return
	}

	user, err := h.walletRepo.GetUserBySession(r.Context(), sessionID)
	if err != nil {
		jsonError(w, "user not found", http.StatusNotFound)
		return
	}

	bonus, err := h.bonusRepo.ActivateBonus(r.Context(), user.ID, cardID)
	if err != nil {
		jsonInternalError(w, "bonuses.activate", err)
		return
	}

	jsonOK(w, bonus)
}
