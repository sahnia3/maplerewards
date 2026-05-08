package service

import (
	"context"
	"fmt"

	"maplerewards/internal/model"
)

type BuyPromoRepository interface {
	CurrentPromos(ctx context.Context) ([]model.BuyPromo, error)
}

type BuyPointsService struct {
	promoRepo BuyPromoRepository
}

func NewBuyPointsService(promoRepo BuyPromoRepository) *BuyPointsService {
	return &BuyPointsService{promoRepo: promoRepo}
}

func (s *BuyPointsService) ListPromos(ctx context.Context) ([]model.BuyPromo, error) {
	out, err := s.promoRepo.CurrentPromos(ctx)
	if err != nil {
		return nil, err
	}
	if out == nil {
		out = []model.BuyPromo{}
	}
	return out, nil
}

// Evaluate computes the buy-vs-earn verdict for a planned redemption.
func (s *BuyPointsService) Evaluate(ctx context.Context, req model.BuyPointsRequest) (*model.BuyPointsVerdict, error) {
	if req.PointsNeeded <= 0 {
		return nil, fmt.Errorf("points_needed must be > 0")
	}
	if req.CashAlternative <= 0 {
		return nil, fmt.Errorf("cash_alternative_cad must be > 0")
	}
	promos, err := s.promoRepo.CurrentPromos(ctx)
	if err != nil {
		return nil, err
	}
	var promo *model.BuyPromo
	for i, p := range promos {
		if p.ProgramSlug == req.ProgramSlug {
			promo = &promos[i]
			break
		}
	}
	verdict := &model.BuyPointsVerdict{
		ProgramSlug:           req.ProgramSlug,
		PointsNeeded:          req.PointsNeeded,
		CashAlternative:       req.CashAlternative,
		BreakEvenCentsPerPoint: req.CashAlternative * 100 / float64(req.PointsNeeded),
	}
	if promo == nil {
		verdict.Verdict = "pay_cash"
		verdict.Rationale = fmt.Sprintf("No active buy-promo recorded for %s. Either earn the points organically or pay cash.", req.ProgramSlug)
		return verdict, nil
	}
	verdict.PromoLabel = promo.PromoLabel
	verdict.SourceURL = promo.SourceURL
	verdict.BasePurchaseCPP = promo.BaseCentsPerPoint
	verdict.CurrentPromoCPP = promo.PromoCentsPerPoint
	verdict.BuyCostCAD = float64(req.PointsNeeded) * promo.PromoCentsPerPoint / 100

	// Decision: buy if break-even CPP > promo CPP (you're effectively "saving" by buying).
	if verdict.BreakEvenCentsPerPoint > promo.PromoCentsPerPoint {
		verdict.Verdict = "buy"
		verdict.Rationale = fmt.Sprintf(
			"At %s (%.2f¢/pt), buying %d points costs $%.2f vs $%.2f cash — save $%.2f.",
			promo.PromoLabel, promo.PromoCentsPerPoint, req.PointsNeeded, verdict.BuyCostCAD,
			req.CashAlternative, req.CashAlternative-verdict.BuyCostCAD,
		)
	} else if verdict.BreakEvenCentsPerPoint > promo.PromoCentsPerPoint*0.85 {
		verdict.Verdict = "earn"
		verdict.Rationale = fmt.Sprintf(
			"Buy-cost ($%.2f) is close to cash ($%.2f). Earning these points organically is the safer call unless you're under time pressure.",
			verdict.BuyCostCAD, req.CashAlternative,
		)
	} else {
		verdict.Verdict = "pay_cash"
		verdict.Rationale = fmt.Sprintf(
			"Buying these points (%.2f¢/pt) costs more than the cash alternative (%.2f¢/pt break-even). Pay cash.",
			promo.PromoCentsPerPoint, verdict.BreakEvenCentsPerPoint,
		)
	}
	return verdict, nil
}
