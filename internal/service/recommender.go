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

	// slug → category ID
	slugToID := make(map[string]string, len(categories))
	slugToName := make(map[string]string, len(categories))
	for _, cat := range categories {
		slugToID[cat.Slug] = cat.ID
		slugToName[cat.Slug] = cat.Name
	}

	var scores []CardScore
	for _, card := range cards {
		if !card.IsActive || card.LoyaltyProgram == nil {
			continue
		}
		score := s.scoreCard(ctx, card, req.MonthlySpend, slugToID, slugToName)
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
	slugToID map[string]string,
	slugToName map[string]string,
) CardScore {
	cpp := card.LoyaltyProgram.BaseCPP

	var grossAnnualValue float64
	var catReturns []CategoryReturn
	var totalMonthlySpend float64

	for _, amt := range monthlySpend {
		totalMonthlySpend += amt
	}

	for slug, monthly := range monthlySpend {
		if monthly <= 0 {
			continue
		}

		catID, ok := slugToID[slug]
		if !ok {
			catID = slugToID["everything-else"]
		}

		multiplier, err := s.cardRepo.GetMultiplierForCard(ctx, card.ID, catID)
		if err != nil {
			var fallbackErr error
			multiplier, fallbackErr = s.cardRepo.GetEverythingElseMultiplier(ctx, card.ID)
			if fallbackErr != nil {
				continue
			}
		}

		var monthlyValue float64
		if multiplier.EarnType == "cashback_pct" {
			monthlyValue = monthly * (multiplier.EarnRate / 100)
		} else {
			pointsPerMonth := monthly * multiplier.EarnRate
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
			EarnRate:     multiplier.EarnRate,
			EarnType:     multiplier.EarnType,
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
	}
}
