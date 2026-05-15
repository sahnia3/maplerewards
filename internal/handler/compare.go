package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"maplerewards/internal/model"
	"maplerewards/internal/repo"
)

// CompareHandler returns side-by-side detail for two cards plus a small
// "diff" digest highlighting the categories where the two cards differ
// most. Powers the /compare/[a]/[b] SSG pages — every pair of cards in the
// catalog gets a deep-linkable, search-indexable page.
type CompareHandler struct {
	cardRepo     *repo.CardRepo
	transferRepo *repo.TransferRepo
}

func NewCompareHandler(cardRepo *repo.CardRepo, transferRepo *repo.TransferRepo) *CompareHandler {
	return &CompareHandler{cardRepo: cardRepo, transferRepo: transferRepo}
}

// Compare handles GET /api/v1/compare/{a}/{b}. Both params can be either
// card UUIDs OR slugs — the repo accepts either via GetCard().
//
// Returns 404 if either card is missing. Returns 400 if the two ids resolve
// to the same card.
func (h *CompareHandler) Compare(w http.ResponseWriter, r *http.Request) {
	aID := chi.URLParam(r, "a")
	bID := chi.URLParam(r, "b")

	if aID == "" || bID == "" {
		jsonError(w, "both card ids required", http.StatusBadRequest)
		return
	}
	if aID == bID {
		jsonError(w, "cannot compare a card to itself", http.StatusBadRequest)
		return
	}

	aDetail, err := h.loadDetail(r, aID)
	if err != nil {
		jsonError(w, "card not found: "+aID, http.StatusNotFound)
		return
	}
	bDetail, err := h.loadDetail(r, bID)
	if err != nil {
		jsonError(w, "card not found: "+bID, http.StatusNotFound)
		return
	}

	jsonOK(w, map[string]any{
		"a":    aDetail,
		"b":    bDetail,
		"diff": buildCompareDiff(aDetail, bDetail),
	})
}

func (h *CompareHandler) loadDetail(r *http.Request, id string) (*model.CardDetail, error) {
	ctx := r.Context()
	card, err := h.cardRepo.GetCard(ctx, id)
	if err != nil {
		return nil, err
	}
	multipliers, err := h.cardRepo.ListMultipliersForCard(ctx, card.ID)
	if err != nil || multipliers == nil {
		multipliers = []model.MultiplierRow{}
	}
	partners, err := h.transferRepo.GetTransferRoutes(ctx, card.LoyaltyProgramID)
	if err != nil || partners == nil {
		partners = []model.TransferPartner{}
	}
	baseCPP := card.LoyaltyProgram.BaseCPP
	bestCPP := baseCPP
	for _, tp := range partners {
		if tp.ToProgram != nil {
			eff := tp.ToProgram.BaseCPP * tp.TransferRatio
			if eff > bestCPP {
				bestCPP = eff
			}
		}
	}
	return &model.CardDetail{
		Card:             *card,
		Multipliers:      multipliers,
		TransferPartners: partners,
		ValueRangeLow:    baseCPP,
		ValueRangeHigh:   bestCPP,
	}, nil
}

// CompareDiff is the small computed summary the frontend uses for the
// "verdict" line above the comparison table. Surfaces the dimensions where
// the two cards differ most so the page has a useful headline rather than
// just "here are two tables of numbers".
type CompareDiff struct {
	AnnualFeeDeltaCAD   float64  `json:"annual_fee_delta_cad"`
	BetterAnnualFee     string   `json:"better_annual_fee"`     // "a" | "b" | "tie"
	WelcomeBonusDelta   int      `json:"welcome_bonus_delta"`
	BetterWelcomeBonus  string   `json:"better_welcome_bonus"`
	CategoriesWhereAWins []string `json:"categories_where_a_wins"`
	CategoriesWhereBWins []string `json:"categories_where_b_wins"`
	BaseCPPWinner       string   `json:"base_cpp_winner"`
}

func buildCompareDiff(a, b *model.CardDetail) CompareDiff {
	// Initialise slices to empty so JSON serialises as [] not null. The
	// frontend reads .length on these and a null would throw at render time.
	d := CompareDiff{
		AnnualFeeDeltaCAD:    a.Card.AnnualFee - b.Card.AnnualFee,
		WelcomeBonusDelta:    a.Card.WelcomeBonusPoints - b.Card.WelcomeBonusPoints,
		CategoriesWhereAWins: []string{},
		CategoriesWhereBWins: []string{},
	}
	switch {
	case a.Card.AnnualFee < b.Card.AnnualFee:
		d.BetterAnnualFee = "a"
	case a.Card.AnnualFee > b.Card.AnnualFee:
		d.BetterAnnualFee = "b"
	default:
		d.BetterAnnualFee = "tie"
	}
	switch {
	case a.Card.WelcomeBonusPoints > b.Card.WelcomeBonusPoints:
		d.BetterWelcomeBonus = "a"
	case a.Card.WelcomeBonusPoints < b.Card.WelcomeBonusPoints:
		d.BetterWelcomeBonus = "b"
	default:
		d.BetterWelcomeBonus = "tie"
	}

	// Per-category winner — map multipliers by category slug and compare.
	aMult := indexByCategory(a.Multipliers)
	bMult := indexByCategory(b.Multipliers)
	seen := map[string]bool{}
	for k := range aMult {
		seen[k] = true
	}
	for k := range bMult {
		seen[k] = true
	}
	for cat := range seen {
		aR := aMult[cat]
		bR := bMult[cat]
		switch {
		case aR > bR && aR > 1:
			d.CategoriesWhereAWins = append(d.CategoriesWhereAWins, cat)
		case bR > aR && bR > 1:
			d.CategoriesWhereBWins = append(d.CategoriesWhereBWins, cat)
		}
	}

	switch {
	case a.Card.LoyaltyProgram.BaseCPP > b.Card.LoyaltyProgram.BaseCPP:
		d.BaseCPPWinner = "a"
	case a.Card.LoyaltyProgram.BaseCPP < b.Card.LoyaltyProgram.BaseCPP:
		d.BaseCPPWinner = "b"
	default:
		d.BaseCPPWinner = "tie"
	}
	return d
}

func indexByCategory(rows []model.MultiplierRow) map[string]float64 {
	out := map[string]float64{}
	for _, r := range rows {
		if r.CategorySlug != "" && r.EarnRate > out[r.CategorySlug] {
			out[r.CategorySlug] = r.EarnRate
		}
	}
	return out
}
