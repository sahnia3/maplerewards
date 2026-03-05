package service

import (
	"context"
	"fmt"
	"sort"
	"sync"

	"maplerewards/internal/cache"
	"maplerewards/internal/model"
	"maplerewards/internal/repo"
)

type OptimizerService struct {
	cardRepo      *repo.CardRepo
	walletRepo    *repo.WalletRepo
	valuationRepo *repo.ValuationRepo
	cache         *cache.Cache
}

func NewOptimizerService(
	cardRepo *repo.CardRepo,
	walletRepo *repo.WalletRepo,
	valuationRepo *repo.ValuationRepo,
	c *cache.Cache,
) *OptimizerService {
	return &OptimizerService{
		cardRepo:      cardRepo,
		walletRepo:    walletRepo,
		valuationRepo: valuationRepo,
		cache:         c,
	}
}

// GetBestCard scores all cards in the user's wallet for a given spend and returns
// them ranked by effective CAD return (highest first).
func (s *OptimizerService) GetBestCard(
	ctx context.Context,
	req model.OptimizeRequest,
) ([]model.CardRecommendation, error) {
	// ── 1. Resolve category ───────────────────────────────────────────────
	var (
		category *model.Category
		err      error
	)
	if req.MCCCode != nil {
		category, err = s.cardRepo.GetCategoryByMCC(ctx, *req.MCCCode)
	} else {
		category, err = s.cardRepo.GetCategoryBySlug(ctx, req.CategorySlug)
	}
	if err != nil {
		// Unknown category → fall back to catch-all so we still rank cards
		category, err = s.cardRepo.GetCategoryBySlug(ctx, "everything-else")
		if err != nil {
			return nil, fmt.Errorf("could not resolve category: %w", err)
		}
	}

	// ── 2. Load wallet ────────────────────────────────────────────────────
	user, err := s.walletRepo.GetUserBySession(ctx, req.SessionID)
	if err != nil {
		return nil, fmt.Errorf("session not found: %w", err)
	}
	userCards, err := s.walletRepo.GetUserCards(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	if len(userCards) == 0 {
		return nil, fmt.Errorf("wallet is empty — add cards first")
	}

	// ── 3. Fan-out: score all cards concurrently ──────────────────────────
	type result struct {
		rec model.CardRecommendation
		err error
	}
	results := make([]result, len(userCards))
	var wg sync.WaitGroup
	wg.Add(len(userCards))

	for i, uc := range userCards {
		go func(idx int, userCard model.UserCard) {
			defer wg.Done()
			rec, err := s.scoreCard(ctx, userCard, category.ID, req.SpendAmount)
			results[idx] = result{rec: rec, err: err}
		}(i, uc)
	}
	wg.Wait()

	// ── 4. Collect & sort ─────────────────────────────────────────────────
	var recs []model.CardRecommendation
	for _, r := range results {
		if r.err == nil {
			recs = append(recs, r.rec)
		}
	}
	sort.Slice(recs, func(i, j int) bool {
		return recs[i].EffectiveReturn > recs[j].EffectiveReturn
	})
	return recs, nil
}

// scoreCard calculates the CAD value and effective return for one card+spend pair.
func (s *OptimizerService) scoreCard(
	ctx context.Context,
	uc model.UserCard,
	categoryID string,
	spendAmount float64,
) (model.CardRecommendation, error) {
	if uc.Card == nil || uc.Card.LoyaltyProgram == nil {
		return model.CardRecommendation{}, fmt.Errorf("card %s missing program data", uc.CardID)
	}

	// Multiplier: try category-specific, fall back to everything-else
	multiplier, err := s.cardRepo.GetMultiplierForCard(ctx, uc.CardID, categoryID)
	if err != nil {
		multiplier, err = s.cardRepo.GetEverythingElseMultiplier(ctx, uc.CardID)
		if err != nil {
			return model.CardRecommendation{}, err
		}
	}

	// CPP: Redis first, then DB, then base_cpp from card data
	cpp, err := s.getCPP(ctx, uc.Card.LoyaltyProgram.Slug)
	if err != nil {
		cpp = uc.Card.LoyaltyProgram.BaseCPP
	}

	// ── Cap logic ─────────────────────────────────────────────────────────
	effectiveRate := multiplier.EarnRate
	isCapHit := false
	note := ""

	if multiplier.CapAmount != nil && *multiplier.CapAmount > 0 {
		// TODO Week 3: inject real monthly spend from user_monthly_spend table.
		// For now, cap is treated as not hit to unblock the Spend Optimizer feature.
		note = fmt.Sprintf("Cap: $%.0f/%s — monthly tracking coming soon",
			*multiplier.CapAmount, safeStr(multiplier.CapPeriod))
	}

	// ── Cashback cards (Rogers Platinum, Tangerine, etc.) ────────────────
	if multiplier.EarnType == "cashback_pct" {
		dollarValue := spendAmount * (effectiveRate / 100)
		return model.CardRecommendation{
			CardID:          uc.CardID,
			CardName:        uc.Card.Name,
			ProgramName:     uc.Card.LoyaltyProgram.Name,
			EarnRate:        effectiveRate,
			ProgramCPP:      1.0,
			EffectiveReturn: effectiveRate,
			PointsEarned:    0,
			DollarValue:     dollarValue,
			IsCapHit:        isCapHit,
			Note:            note,
		}, nil
	}

	// ── Points / miles cards ──────────────────────────────────────────────
	pointsEarned := spendAmount * effectiveRate
	dollarValue := pointsEarned * (cpp / 100) // cpp in cents → CAD dollars
	effectiveReturn := (dollarValue / spendAmount) * 100

	return model.CardRecommendation{
		CardID:          uc.CardID,
		CardName:        uc.Card.Name,
		ProgramName:     uc.Card.LoyaltyProgram.Name,
		EarnRate:        effectiveRate,
		ProgramCPP:      cpp,
		EffectiveReturn: effectiveReturn,
		PointsEarned:    pointsEarned,
		DollarValue:     dollarValue,
		IsCapHit:        isCapHit,
		Note:            note,
	}, nil
}

// getCPP fetches from Redis; on miss, hits the DB and re-warms the cache.
func (s *OptimizerService) getCPP(ctx context.Context, programSlug string) (float64, error) {
	cpp, err := s.cache.GetValuation(ctx, programSlug, "base")
	if err == nil {
		return cpp, nil
	}
	cpp, err = s.valuationRepo.GetCPP(ctx, programSlug, "base")
	if err != nil {
		return 0, err
	}
	// Fire-and-forget cache warm
	go s.cache.SetValuation(context.Background(), programSlug, "base", cpp) //nolint:errcheck
	return cpp, nil
}

func safeStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
