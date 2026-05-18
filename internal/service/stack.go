package service

import (
	"context"
	"fmt"
	"strings"

	"maplerewards/internal/model"
)

type StackRepository interface {
	ListMerchants(ctx context.Context) ([]model.Merchant, error)
	GetMerchant(ctx context.Context, slug string) (*model.Merchant, error)
	BestPortalRate(ctx context.Context, merchantSlug string) (*model.PortalRate, error)
	ActiveOffersForMerchant(ctx context.Context, merchantSlug string) ([]model.NetworkOffer, error)
}

// defaultMaxOfferCreditCAD conservatively bounds a percentage/points network
// offer that has no modelled max-credit (typical Amex/RBC/Scene+ offers cap
// the credit, e.g. "20% back up to $40"). Prevents an impossible projected
// discount on large spend; replaced by per-offer caps in the gated remediation.
const defaultMaxOfferCreditCAD = 50.0

// StackService computes the [portal × card × network-offer] triple-stack for a
// given merchant + spend.
type StackService struct {
	walletRepo WalletRepository
	stackRepo  StackRepository
	optimizer  OptimizerForMissed
}

func NewStackService(walletRepo WalletRepository, stackRepo StackRepository, optimizer OptimizerForMissed) *StackService {
	return &StackService{walletRepo: walletRepo, stackRepo: stackRepo, optimizer: optimizer}
}

func (s *StackService) ListMerchants(ctx context.Context) ([]model.Merchant, error) {
	out, err := s.stackRepo.ListMerchants(ctx)
	if out == nil {
		out = []model.Merchant{}
	}
	return out, err
}

func (s *StackService) Recommend(ctx context.Context, req model.StackRecommendRequest) (*model.StackRecommendation, error) {
	if req.MerchantSlug == "" || req.SpendAmount <= 0 {
		return nil, fmt.Errorf("merchant_slug and spend_amount > 0 required")
	}
	merchant, err := s.stackRepo.GetMerchant(ctx, req.MerchantSlug)
	if err != nil {
		return nil, fmt.Errorf("merchant not found: %w", err)
	}
	rec := &model.StackRecommendation{
		MerchantSlug:  merchant.Slug,
		MerchantName:  merchant.Name,
		SpendAmount:   req.SpendAmount,
		NetworkOffers: []model.NetworkOffer{},
		Components:    []model.StackComponent{},
	}

	// Layer 1: best portal cashback.
	if portal, err := s.stackRepo.BestPortalRate(ctx, req.MerchantSlug); err == nil && portal != nil {
		rec.BestPortal = portal
		val := req.SpendAmount * portal.RatePct / 100
		rec.Components = append(rec.Components, model.StackComponent{
			Layer:     "portal",
			Source:    portalLabel(portal.Portal),
			ValueCAD:  val,
			Detail:    fmt.Sprintf("%.2f%% cashback via %s", portal.RatePct, portalLabel(portal.Portal)),
			SourceURL: portal.SourceURL,
		})
		rec.TotalValueCAD += val
	}

	// Layer 2: best card multiplier (uses optimizer).
	if req.SessionID != "" && merchant.CategorySlug != "" {
		recs, err := s.optimizer.GetBestCard(ctx, model.OptimizeRequest{
			SessionID:    req.SessionID,
			CategorySlug: merchant.CategorySlug,
			SpendAmount:  req.SpendAmount,
		})
		if err == nil && len(recs) > 0 {
			best := recs[0]
			rec.BestCard = &best
			rec.Components = append(rec.Components, model.StackComponent{
				Layer:    "card",
				Source:   best.CardName,
				ValueCAD: best.DollarValue,
				Detail:   fmt.Sprintf("%.1f×/cashback in %s = %.2f%% effective", best.EarnRate, merchant.CategorySlug, best.EffectiveReturn),
			})
			rec.TotalValueCAD += best.DollarValue
		}
	}

	// Layer 3: network offers (potentially multiple — Amex offer + Visa offer + MC offer can each fire if user holds those cards).
	offers, err := s.stackRepo.ActiveOffersForMerchant(ctx, req.MerchantSlug)
	if err == nil {
		rec.NetworkOffers = offers
		for _, o := range offers {
			if o.MinSpend > 0 && req.SpendAmount < o.MinSpend {
				rec.Warnings = append(rec.Warnings, fmt.Sprintf("Spend $%.0f for the %s %s offer (you have $%.0f)", o.MinSpend, o.Network, o.Title, req.SpendAmount))
				continue
			}
			var val float64
			switch o.RewardType {
			case "statement_credit":
				val = o.RewardValue // flat $ — already bounded
			case "merchant_discount":
				val = req.SpendAmount * o.RewardValue / 100
			case "bonus_points":
				// Approximate at 1¢/pt.
				val = req.SpendAmount * o.RewardValue * 0.01
			}
			if val == 0 {
				continue
			}
			// SAFETY GUARDRAIL — same unbounded-projection class as the
			// optimizer/buy-points caps (docs/OPTIMIZER-CAP-AUDIT.md). Real
			// network offers ("20% back, up to $40") carry a max-credit cap
			// we don't model yet, so a %/points offer on large spend would
			// project an impossible value ($20k off $100k). Until per-offer
			// caps land, percentage/points offers are bounded by a
			// conservative default and the truncation is disclosed.
			if o.RewardType != "statement_credit" && val > defaultMaxOfferCreditCAD {
				val = defaultMaxOfferCreditCAD
				rec.Warnings = append(rec.Warnings, fmt.Sprintf(
					"%s offer value capped at $%.0f (estimate — most network offers cap the credit; verify the offer's max).",
					o.Title, defaultMaxOfferCreditCAD))
			}
			rec.Components = append(rec.Components, model.StackComponent{
				Layer:     "network_offer",
				Source:    fmt.Sprintf("%s — %s", strings.ToUpper(o.Network), o.Title),
				ValueCAD:  val,
				Detail:    o.Title,
				SourceURL: o.SourceURL,
			})
			rec.TotalValueCAD += val
		}
	}

	// Stack-conflict warning: portal + browser-extension overlap.
	if rec.BestPortal != nil {
		rec.Warnings = append(rec.Warnings, "Last-click attribution wins — only activate ONE portal/extension. If Honey or Capital One Shopping is installed, disable it on this purchase.")
	}

	if req.SpendAmount > 0 {
		rec.EffectiveReturn = (rec.TotalValueCAD / req.SpendAmount) * 100
	}
	return rec, nil
}

func portalLabel(slug string) string {
	switch slug {
	case "rakuten_ca":
		return "Rakuten.ca"
	case "gcr":
		return "Great Canadian Rebates"
	case "topcashback":
		return "TopCashback"
	}
	return slug
}
