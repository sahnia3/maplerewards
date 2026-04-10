package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"maplerewards/internal/model"
	"maplerewards/internal/repo"
)

type CardDetailHandler struct {
	cardRepo     *repo.CardRepo
	transferRepo *repo.TransferRepo
}

func NewCardDetailHandler(cardRepo *repo.CardRepo, transferRepo *repo.TransferRepo) *CardDetailHandler {
	return &CardDetailHandler{cardRepo: cardRepo, transferRepo: transferRepo}
}

func (h *CardDetailHandler) GetDetail(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ctx := r.Context()

	card, err := h.cardRepo.GetCard(ctx, id)
	if err != nil {
		jsonError(w, "card not found", http.StatusNotFound)
		return
	}

	multipliers, err := h.cardRepo.ListMultipliersForCard(ctx, id)
	if err != nil || multipliers == nil {
		multipliers = []model.MultiplierRow{}
	}

	transferPartners, err := h.transferRepo.GetTransferRoutes(ctx, card.LoyaltyProgramID)
	if err != nil || transferPartners == nil {
		transferPartners = []model.TransferPartner{}
	}

	// Compute value range based on base CPP vs best transfer CPP
	baseCPP := card.LoyaltyProgram.BaseCPP
	bestCPP := baseCPP
	for _, tp := range transferPartners {
		if tp.ToProgram != nil {
			effectiveCPP := tp.ToProgram.BaseCPP * tp.TransferRatio
			if effectiveCPP > bestCPP {
				bestCPP = effectiveCPP
			}
		}
	}

	jsonOK(w, model.CardDetail{
		Card:             *card,
		Multipliers:      multipliers,
		TransferPartners: transferPartners,
		ValueRangeLow:    baseCPP,
		ValueRangeHigh:   bestCPP,
	})
}
