package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"maplerewards/internal/model"
	"maplerewards/internal/repo"
)

type SummaryHandler struct {
	walletRepo   *repo.WalletRepo
	transferRepo *repo.TransferRepo
}

func NewSummaryHandler(walletRepo *repo.WalletRepo, transferRepo *repo.TransferRepo) *SummaryHandler {
	return &SummaryHandler{walletRepo: walletRepo, transferRepo: transferRepo}
}

func (h *SummaryHandler) GetWalletSummary(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	ctx := r.Context()

	user, err := h.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		jsonError(w, "session not found", http.StatusNotFound)
		return
	}
	if user == nil { // unknown/scrubbed session — GetUserBySession returns (nil,nil)
		jsonError(w, "session not found", http.StatusNotFound)
		return
	}

	userCards, err := h.walletRepo.GetUserCards(ctx, user.ID)
	if err != nil {
		jsonError(w, "failed to fetch wallet", http.StatusInternalServerError)
		return
	}

	var totalPoints int64
	var valueLow, valueHigh float64
	var items []model.CardSummaryItem

	for _, uc := range userCards {
		card := uc.Card
		prog := card.LoyaltyProgram
		baseCPP := prog.BaseCPP
		points := uc.PointBalance

		low := float64(points) * baseCPP / 100.0

		// Find best transfer partner value
		bestCPP := baseCPP
		bestPartner := ""
		routes, _ := h.transferRepo.GetTransferRoutes(ctx, card.LoyaltyProgramID)
		for _, route := range routes {
			if route.ToProgram != nil {
				effectiveCPP := route.ToProgram.BaseCPP * route.TransferRatio
				if effectiveCPP > bestCPP {
					bestCPP = effectiveCPP
					bestPartner = route.ToProgram.Name
				}
			}
		}

		high := float64(points) * bestCPP / 100.0
		totalPoints += points
		valueLow += low
		valueHigh += high

		items = append(items, model.CardSummaryItem{
			CardID:              card.ID,
			CardName:            card.Name,
			Issuer:              card.Issuer,
			Network:             card.Network,
			PointBalance:        points,
			ProgramName:         prog.Name,
			BaseCPP:             baseCPP,
			ValueLow:            low,
			ValueHigh:           high,
			BestTransferPartner: bestPartner,
			BestTransferCPP:     bestCPP,
		})
	}

	if items == nil {
		items = []model.CardSummaryItem{}
	}

	jsonOK(w, model.WalletSummary{
		TotalPoints:    totalPoints,
		ValueRangeLow:  valueLow,
		ValueRangeHigh: valueHigh,
		Cards:          items,
	})
}
