package service

import (
	"context"
	"fmt"

	"maplerewards/internal/model"
)

// defaultMaxAnnualPointsPurchase is a conservative guardrail until per-program
// purchase ceilings are modelled (docs/OPTIMIZER-CAP-AUDIT.md). Most Canadian-
// relevant programs cap bought points well under this; anything above is
// flagged as likely un-purchasable in a single year rather than endorsed.
const defaultMaxAnnualPointsPurchase = 200000

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
	// A nil promo OR a non-positive promo price means "no usable promo".
	// Without the price check, promo.PromoCentsPerPoint == 0 makes
	// BuyCostCAD == 0 and BreakEven > 0 always, yielding a confident "buy"
	// recommendation for effectively free points — clearly a data error,
	// not a real offer. Treat it as no promo.
	if promo == nil || promo.PromoCentsPerPoint <= 0 {
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

	// PURCHASE CEILING (sibling of the optimizer cap bug — see
	// docs/OPTIMIZER-CAP-AUDIT.md). Every loyalty program caps how many
	// points you can BUY per year, so a request for an impossible quantity
	// (e.g. 2,000,000 pts) must not return a confident "buy". Migration
	// 000049 seeds the real per-program ceiling; use it when present,
	// otherwise fall back to the conservative default.
	purchaseCap := defaultMaxAnnualPointsPurchase
	capVerified := false
	if promo.MaxPurchasablePerYear != nil && *promo.MaxPurchasablePerYear > 0 {
		purchaseCap = *promo.MaxPurchasablePerYear
		capVerified = true
	}
	if req.PointsNeeded > purchaseCap && verdict.Verdict == "buy" {
		verdict.Verdict = "earn"
		if capVerified {
			verdict.Rationale = fmt.Sprintf(
				"%d points exceeds %s's published annual point-purchase limit of %d/yr — the full amount cannot be purchased in one year. Earn the balance organically or split the purchase across calendar years. (If split/feasible: %s)",
				req.PointsNeeded, promo.PromoLabel, purchaseCap, verdict.Rationale,
			)
		} else {
			verdict.Rationale = fmt.Sprintf(
				"%d points likely exceeds %s's annual point-purchase limit (most programs cap well under %d/yr) — the full amount may not be purchasable in one year. Verify the program's purchase cap; earn the balance organically or split across years. (If it IS purchasable: %s)",
				req.PointsNeeded, promo.PromoLabel, purchaseCap, verdict.Rationale,
			)
		}
	}
	return verdict, nil
}
