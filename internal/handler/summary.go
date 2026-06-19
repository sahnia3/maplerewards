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

// sweetSpotFraction is the heuristic share of the spread between a card's base
// redemption value and its best transfer-partner value that a typical user can
// realistically capture. The wallet summary's middle "sweet-spot" tier is
// baseCPP + sweetSpotFraction*(bestCPP-baseCPP). It is an achievable-redemption
// estimate, NOT a guaranteed value; the high tier remains the theoretical max.
const sweetSpotFraction = 0.60

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

	// Points the user has earned by logging purchases, per card. Added to each
	// card's manual point_balance so the wallet value + totals reflect accrued
	// rewards — the home hero, the sidebar portfolio, and the portfolio page all
	// read this. Non-fatal: a nil map (on error) indexes to 0, falling back to
	// manual balances only.
	earnedByCard, _ := h.walletRepo.GetEarnedPointsByCard(ctx, user.ID)

	var totalPoints int64
	var valueLow, valueHigh, valueSweet float64
	var items []model.CardSummaryItem

	for _, uc := range userCards {
		card := uc.Card
		prog := card.LoyaltyProgram
		baseCPP := prog.BaseCPP
		points := uc.PointBalance + earnedByCard[card.ID]

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

		// Sweet-spot: a realistically achievable redemption that sits between the
		// base (low) and the theoretical best-transfer max (high). When no
		// transfer partner beats base (bestCPP == baseCPP), sweetCPP == baseCPP so
		// sweet == low. By construction low <= sweet <= high always holds.
		sweetCPP := baseCPP + sweetSpotFraction*(bestCPP-baseCPP)
		sweet := float64(points) * sweetCPP / 100.0

		totalPoints += points
		valueLow += low
		valueHigh += high
		valueSweet += sweet

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
			ValueSweetSpot:      sweet,
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
		ValueSweetSpot: valueSweet,
		Cards:          items,
	})
}
