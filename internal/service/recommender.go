package service

import (
	"context"
	"sort"

	"maplerewards/internal/model"
)

// RecommendRequest holds a monthly spending profile (category_slug → monthly CAD amount).
type RecommendRequest struct {
	MonthlySpend map[string]float64 `json:"monthly_spend"`
}

// CategoryReturn holds per-category earn detail for a scored card.
type CategoryReturn struct {
	CategoryName string  `json:"category_name"`
	CategorySlug string  `json:"category_slug"`
	MonthlySpend float64 `json:"monthly_spend"`
	EarnRate     float64 `json:"earn_rate"`
	EarnType     string  `json:"earn_type"`
	MonthlyValue float64 `json:"monthly_value"`
}

// CardScore is a ranked card recommendation with projected annual value.
type CardScore struct {
	CardID           string           `json:"card_id"`
	CardName         string           `json:"card_name"`
	Issuer           string           `json:"issuer"`
	Network          string           `json:"network"`
	AnnualFee        float64          `json:"annual_fee"`
	GrossAnnualValue float64          `json:"gross_annual_value"`
	NetAnnualValue   float64          `json:"net_annual_value"`
	EffectiveReturn  float64          `json:"effective_return"` // net / annual_spend * 100
	TopCategories    []CategoryReturn `json:"top_categories"`
	WelcomeBonusValue float64         `json:"welcome_bonus_value"`
	LoyaltyProgram   string           `json:"loyalty_program"`
	BaseCPP          float64          `json:"base_cpp"`
	WelcomeBonusPoints int            `json:"welcome_bonus_points"`
	WelcomeBonusMinSpend float64      `json:"welcome_bonus_min_spend"`
	WelcomeBonusMonths int            `json:"welcome_bonus_months"`
}

type RecommenderService struct {
	cardRepo CardRepository
}

func NewRecommenderService(cardRepo CardRepository) *RecommenderService {
	return &RecommenderService{cardRepo: cardRepo}
}

// Recommend scores all active cards against the spending profile and returns them
// ranked by net annual value (gross rewards − annual fee).
func (s *RecommenderService) Recommend(ctx context.Context, req RecommendRequest) ([]CardScore, error) {
	cards, err := s.cardRepo.ListCards(ctx)
	if err != nil {
		return nil, err
	}

	categories, err := s.cardRepo.ListCategories(ctx)
	if err != nil {
		return nil, err
	}

	// slug → category name. Also the set of REAL category slugs — anything not
	// in here is junk (or an attacker padding the body) and is dropped, so the
	// work is bounded by the ~real category count regardless of body size.
	slugToName := make(map[string]string, len(categories))
	for _, cat := range categories {
		slugToName[cat.Slug] = cat.Name
	}

	// Pre-filter the request to known categories with positive spend. This caps
	// the per-card inner loop at the real category count even if the caller sent
	// a huge map (DoS hardening — see handler bound too).
	spend := make(map[string]float64, len(slugToName))
	for slug, amt := range req.MonthlySpend {
		if amt > 0 {
			if _, ok := slugToName[slug]; ok {
				spend[slug] = amt
			}
		}
	}

	var scores []CardScore
	for _, card := range cards {
		if !card.IsActive || card.LoyaltyProgram == nil {
			continue
		}
		score, err := s.scoreCard(ctx, card, spend, slugToName)
		if err != nil {
			return nil, err
		}
		scores = append(scores, score)
	}

	sort.Slice(scores, func(i, j int) bool {
		return scores[i].NetAnnualValue > scores[j].NetAnnualValue
	})
	return scores, nil
}

func (s *RecommenderService) scoreCard(
	ctx context.Context,
	card model.Card,
	monthlySpend map[string]float64,
	slugToName map[string]string,
) (CardScore, error) {
	cpp := card.LoyaltyProgram.BaseCPP

	var grossAnnualValue float64
	var catReturns []CategoryReturn
	var totalMonthlySpend float64

	for _, amt := range monthlySpend {
		totalMonthlySpend += amt
	}

	// ONE query per card for all its multipliers, instead of one query per
	// (card, category). This is the core fix for the /recommend amplification
	// DoS: total DB work is now O(cards), not O(cards × request keys).
	rows, err := s.cardRepo.ListMultipliersForCard(ctx, card.ID)
	if err != nil {
		return CardScore{}, err
	}
	bySlug := make(map[string]model.MultiplierRow, len(rows))
	var everythingElse *model.MultiplierRow
	for i := range rows {
		bySlug[rows[i].CategorySlug] = rows[i]
		if rows[i].CategorySlug == "everything-else" {
			everythingElse = &rows[i]
		}
	}

	for slug, monthly := range monthlySpend {
		if monthly <= 0 {
			continue
		}

		mult, ok := bySlug[slug]
		if !ok {
			if everythingElse == nil {
				continue
			}
			mult = *everythingElse
		}

		var monthlyValue float64
		if mult.EarnType == "cashback_pct" {
			monthlyValue = monthly * (mult.EarnRate / 100)
		} else {
			pointsPerMonth := monthly * mult.EarnRate
			monthlyValue = pointsPerMonth * (cpp / 100)
		}

		grossAnnualValue += monthlyValue * 12

		catName := slugToName[slug]
		if catName == "" {
			catName = slug
		}
		catReturns = append(catReturns, CategoryReturn{
			CategoryName: catName,
			CategorySlug: slug,
			MonthlySpend: monthly,
			EarnRate:     mult.EarnRate,
			EarnType:     mult.EarnType,
			MonthlyValue: monthlyValue,
		})
	}

	// Top 3 categories by monthly value
	sort.Slice(catReturns, func(i, j int) bool {
		return catReturns[i].MonthlyValue > catReturns[j].MonthlyValue
	})
	if len(catReturns) > 3 {
		catReturns = catReturns[:3]
	}

	welcomeBonusValue := float64(card.WelcomeBonusPoints) * (cpp / 100)
	netAnnualValue := grossAnnualValue - card.AnnualFee

	effectiveReturn := 0.0
	annualSpend := totalMonthlySpend * 12
	if annualSpend > 0 {
		effectiveReturn = (netAnnualValue / annualSpend) * 100
	}

	return CardScore{
		CardID:               card.ID,
		CardName:             card.Name,
		Issuer:               card.Issuer,
		Network:              card.Network,
		AnnualFee:            card.AnnualFee,
		GrossAnnualValue:     grossAnnualValue,
		NetAnnualValue:       netAnnualValue,
		EffectiveReturn:      effectiveReturn,
		TopCategories:        catReturns,
		WelcomeBonusValue:    welcomeBonusValue,
		LoyaltyProgram:       card.LoyaltyProgram.Name,
		BaseCPP:              cpp,
		WelcomeBonusPoints:   card.WelcomeBonusPoints,
		WelcomeBonusMinSpend: card.WelcomeBonusMinSpend,
		WelcomeBonusMonths:   card.WelcomeBonusMonths,
	}, nil
}
