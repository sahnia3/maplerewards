package handler

import (
	"context"
	"math"
	"net/http"
	"sort"

	"github.com/go-chi/chi/v5"
	"maplerewards/internal/model"
	"maplerewards/internal/repo"
)

type PortfolioHandler struct {
	walletRepo   *repo.WalletRepo
	cardRepo     *repo.CardRepo
	spendRepo    *repo.SpendRepo
	transferRepo *repo.TransferRepo
}

func NewPortfolioHandler(
	walletRepo *repo.WalletRepo,
	cardRepo *repo.CardRepo,
	spendRepo *repo.SpendRepo,
	transferRepo *repo.TransferRepo,
) *PortfolioHandler {
	return &PortfolioHandler{
		walletRepo:   walletRepo,
		cardRepo:     cardRepo,
		spendRepo:    spendRepo,
		transferRepo: transferRepo,
	}
}

// GetAnalysis computes fee ROI, dollar gap (opportunity cost), and utilization score.
func (h *PortfolioHandler) GetAnalysis(w http.ResponseWriter, r *http.Request) {
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

	if len(userCards) == 0 {
		jsonOK(w, model.PortfolioAnalysis{
			FeeROI:      []model.CardFeeROI{},
			DollarGap:   model.DollarGapAnalysis{Entries: []model.GapEntry{}},
			Utilization: model.UtilizationScore{Gaps: []model.CategoryGap{}},
		})
		return
	}

	// Get spend stats and entries for analysis
	stats, _ := h.spendRepo.GetSpendStats(ctx, user.ID)
	entries, _ := h.spendRepo.ListSpendEntries(ctx, user.ID, 200, 0)

	feeROI := h.computeFeeROI(ctx, userCards, stats)
	dollarGap := h.computeDollarGap(ctx, userCards, entries)
	utilization := h.computeUtilization(ctx, userCards)

	jsonOK(w, model.PortfolioAnalysis{
		FeeROI:      feeROI,
		DollarGap:   dollarGap,
		Utilization: utilization,
	})
}

// ── Fee ROI ──────────────────────────────────────────────────────────────────

func (h *PortfolioHandler) computeFeeROI(ctx context.Context, userCards []model.UserCard, stats *model.SpendStats) []model.CardFeeROI {
	// Build map from card name → stats
	cardStatMap := make(map[string]model.CardStat)
	if stats != nil {
		for _, cs := range stats.ByCard {
			cardStatMap[cs.CardName] = cs
		}
	}

	var results []model.CardFeeROI
	for _, uc := range userCards {
		if uc.Card == nil {
			continue
		}
		card := uc.Card
		cs := cardStatMap[card.Name]

		avgReturn := cs.AvgReturn / 100 // percent → decimal
		if avgReturn <= 0 {
			// Estimate from card's base earn rate and CPP
			avgReturn = h.estimateReturn(ctx, uc)
		}

		annualFee := card.AnnualFee

		var breakevenSpend float64
		if avgReturn > 0 {
			breakevenSpend = annualFee / avgReturn / 12 // monthly spend
		}

		totalValueEarned := cs.TotalValue
		netROI := totalValueEarned - annualFee

		results = append(results, model.CardFeeROI{
			CardID:         card.ID,
			CardName:       card.Name,
			AnnualFee:      annualFee,
			ValueEarned:    round2(totalValueEarned),
			TotalSpend:     round2(cs.TotalSpend),
			AvgReturn:      round2(cs.AvgReturn),
			NetROI:         round2(netROI),
			BreakevenSpend: math.Round(breakevenSpend),
		})
	}

	if results == nil {
		results = []model.CardFeeROI{}
	}
	return results
}

// estimateReturn computes a rough % return for a card using base multiplier × CPP.
func (h *PortfolioHandler) estimateReturn(ctx context.Context, uc model.UserCard) float64 {
	if uc.Card == nil || uc.Card.LoyaltyProgram == nil {
		return 0.01
	}
	mult, err := h.cardRepo.GetEverythingElseMultiplier(ctx, uc.CardID)
	if err != nil {
		return 0.01
	}
	if mult.EarnType == "cashback_pct" {
		return mult.EarnRate / 100
	}
	cpp := uc.Card.LoyaltyProgram.BaseCPP
	return mult.EarnRate * cpp / 100
}

// ── Dollar Gap (Opportunity Cost) ────────────────────────────────────────────

func (h *PortfolioHandler) computeDollarGap(ctx context.Context, userCards []model.UserCard, entries []model.SpendEntry) model.DollarGapAnalysis {
	if len(entries) == 0 {
		return model.DollarGapAnalysis{Entries: []model.GapEntry{}}
	}

	// Group entries by category
	type catGroup struct {
		categoryName string
		totalSpend   float64
		actualValue  float64
		cardSpend    map[string]float64
	}

	groups := make(map[string]*catGroup)
	for _, e := range entries {
		g, ok := groups[e.CategoryID]
		if !ok {
			g = &catGroup{
				categoryName: e.CategoryName,
				cardSpend:    make(map[string]float64),
			}
			groups[e.CategoryID] = g
		}
		g.totalSpend += e.Amount
		g.actualValue += e.DollarValue
		g.cardSpend[e.CardName] += e.Amount
	}

	// For each category, find the optimal card in wallet
	var gapEntries []model.GapEntry
	var totalActual, totalOptimal float64

	for catID, g := range groups {
		// Find the card that was used most in this category
		var maxCardSpend float64
		primaryCard := ""
		for name, spend := range g.cardSpend {
			if spend > maxCardSpend {
				maxCardSpend = spend
				primaryCard = name
			}
		}

		// Find optimal card: compute what each wallet card would earn
		bestCard := primaryCard
		bestValue := g.actualValue

		for _, uc := range userCards {
			if uc.Card == nil || uc.Card.LoyaltyProgram == nil {
				continue
			}
			mult, err := h.cardRepo.GetMultiplierForCard(ctx, uc.CardID, catID)
			if err != nil {
				mult, err = h.cardRepo.GetEverythingElseMultiplier(ctx, uc.CardID)
				if err != nil {
					continue
				}
			}

			var cardValue float64
			if mult.EarnType == "cashback_pct" {
				cardValue = g.totalSpend * (mult.EarnRate / 100)
			} else {
				cpp := uc.Card.LoyaltyProgram.BaseCPP

				// Check transfer partners for better CPP
				routes, _ := h.transferRepo.GetTransferRoutes(ctx, uc.Card.LoyaltyProgramID)
				for _, route := range routes {
					if route.ToProgram != nil {
						effectiveCPP := route.ToProgram.BaseCPP * route.TransferRatio
						if effectiveCPP > cpp {
							cpp = effectiveCPP
						}
					}
				}

				points := g.totalSpend * mult.EarnRate
				cardValue = points * cpp / 100
			}

			if cardValue > bestValue {
				bestValue = cardValue
				bestCard = uc.Card.Name
			}
		}

		gap := bestValue - g.actualValue
		totalActual += g.actualValue
		totalOptimal += bestValue

		gapEntries = append(gapEntries, model.GapEntry{
			CategoryName: g.categoryName,
			CardUsed:     primaryCard,
			OptimalCard:  bestCard,
			ActualValue:  round2(g.actualValue),
			OptimalValue: round2(bestValue),
			Gap:          round2(gap),
			TotalSpend:   round2(g.totalSpend),
		})
	}

	// Sort by gap descending (biggest missed opportunities first)
	sort.Slice(gapEntries, func(i, j int) bool {
		return gapEntries[i].Gap > gapEntries[j].Gap
	})

	if gapEntries == nil {
		gapEntries = []model.GapEntry{}
	}

	return model.DollarGapAnalysis{
		TotalActualValue:  round2(totalActual),
		TotalOptimalValue: round2(totalOptimal),
		TotalGap:          round2(totalOptimal - totalActual),
		Entries:           gapEntries,
	}
}

// ── Utilization Score ────────────────────────────────────────────────────────

func (h *PortfolioHandler) computeUtilization(ctx context.Context, userCards []model.UserCard) model.UtilizationScore {
	categories, err := h.cardRepo.ListCategories(ctx)
	if err != nil || len(categories) == 0 {
		return model.UtilizationScore{Gaps: []model.CategoryGap{}}
	}

	// Filter to top-level spend categories (skip "everything-else")
	var mainCats []model.Category
	for _, cat := range categories {
		if cat.Slug != "everything-else" && cat.ParentID == nil {
			mainCats = append(mainCats, cat)
		}
	}

	if len(mainCats) == 0 {
		return model.UtilizationScore{Gaps: []model.CategoryGap{}}
	}

	covered := 0
	var gaps []model.CategoryGap

	for _, cat := range mainCats {
		var bestRate float64
		var bestCardName string

		for _, uc := range userCards {
			if uc.Card == nil || uc.Card.LoyaltyProgram == nil {
				continue
			}
			mult, err := h.cardRepo.GetMultiplierForCard(ctx, uc.CardID, cat.ID)
			if err != nil {
				mult, err = h.cardRepo.GetEverythingElseMultiplier(ctx, uc.CardID)
				if err != nil {
					continue
				}
			}

			var effectiveReturn float64
			if mult.EarnType == "cashback_pct" {
				effectiveReturn = mult.EarnRate
			} else {
				cpp := uc.Card.LoyaltyProgram.BaseCPP
				routes, _ := h.transferRepo.GetTransferRoutes(ctx, uc.Card.LoyaltyProgramID)
				for _, route := range routes {
					if route.ToProgram != nil {
						effectiveCPP := route.ToProgram.BaseCPP * route.TransferRatio
						if effectiveCPP > cpp {
							cpp = effectiveCPP
						}
					}
				}
				effectiveReturn = mult.EarnRate * cpp / 100
			}

			if effectiveReturn > bestRate {
				bestRate = effectiveReturn
				bestCardName = uc.Card.Name
			}
		}

		// "Covered" = return > 1.5% (better than basic 1x card)
		isCovered := bestRate >= 1.5
		if isCovered {
			covered++
		}

		gaps = append(gaps, model.CategoryGap{
			CategoryName:     cat.Name,
			BestCardInWallet: bestCardName,
			WalletReturn:     round2(bestRate),
			IsCovered:        isCovered,
		})
	}

	// Sort: uncovered categories first, then by return ascending
	sort.Slice(gaps, func(i, j int) bool {
		if gaps[i].IsCovered != gaps[j].IsCovered {
			return !gaps[i].IsCovered // uncovered first
		}
		return gaps[i].WalletReturn < gaps[j].WalletReturn
	})

	if gaps == nil {
		gaps = []model.CategoryGap{}
	}

	score := float64(covered) / float64(len(mainCats))

	return model.UtilizationScore{
		Score:             round2(score),
		CoveredCategories: covered,
		TotalCategories:   len(mainCats),
		Gaps:              gaps,
	}
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}
