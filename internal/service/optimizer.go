package service

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"sync"
	"time"

	"maplerewards/internal/model"
)

type OptimizerService struct {
	cardRepo      CardRepository
	walletRepo    WalletRepository
	valuationRepo ValuationRepository
	transferRepo  TransferRepository
	spendRepo     SpendRepository
	cache         ValuationCache
}

func NewOptimizerService(
	cardRepo CardRepository,
	walletRepo WalletRepository,
	valuationRepo ValuationRepository,
	transferRepo TransferRepository,
	spendRepo SpendRepository,
	c ValuationCache,
) *OptimizerService {
	return &OptimizerService{
		cardRepo:      cardRepo,
		walletRepo:    walletRepo,
		valuationRepo: valuationRepo,
		transferRepo:  transferRepo,
		spendRepo:     spendRepo,
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

	// Default redemption segment
	segment := req.RedemptionSegment
	if segment == "" {
		segment = "base"
	}

	// ── 2. Load wallet ────────────────────────────────────────────────────
	user, err := s.walletRepo.GetUserBySession(ctx, req.SessionID)
	if err != nil {
		return nil, fmt.Errorf("session not found: %w", err)
	}
	// pgx returns (nil, nil) for "no row matches" — this branch was missing
	// before and a typo'd session_id panicked the whole API process when
	// dereferencing user.ID below.
	if user == nil {
		return nil, ErrSessionNotFound
	}
	userCards, err := s.walletRepo.GetUserCards(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	if len(userCards) == 0 {
		return nil, fmt.Errorf("wallet is empty — add cards first")
	}

	// ── 2.5 Network-routing rules (merchant constraints) ─────────────────
	// Canada-specific: Costco Canada accepts Mastercard only (since 2014).
	// Filter out non-MC cards when merchant=costco_ca; if no MC cards remain,
	// surface a clear error instead of silently zero-result-ing.
	if req.Merchant == "costco_ca" {
		filtered := userCards[:0]
		for _, uc := range userCards {
			if uc.Card != nil && uc.Card.Network == "mastercard" {
				filtered = append(filtered, uc)
			}
		}
		if len(filtered) == 0 {
			return nil, fmt.Errorf("no Mastercard in wallet — Costco Canada accepts only Mastercard. Add a Mastercard or pay another way.")
		}
		userCards = filtered
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
			// Per-card scoring is fan-out: a panic in one (nil multiplier deref,
			// bad transfer-partner data) would otherwise crash the whole process.
			// Record the panic as a scoring error so the result row is simply
			// dropped and the optimizer still returns the survivors.
			defer func() {
				if r := recover(); r != nil {
					slog.Error("optimizer card-score panic recovered",
						"err", r, "card_id", userCard.CardID)
					results[idx] = result{err: fmt.Errorf("card-score panic: %v", r)}
				}
			}()
			rec, err := s.scoreCard(ctx, userCard, category.ID, req.SpendAmount, segment)
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
	segment string,
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
	cpp, err := s.getCPP(ctx, uc.Card.LoyaltyProgram.Slug, segment)
	if err != nil {
		// Fall back to base segment if requested segment not found
		cpp, err = s.getCPP(ctx, uc.Card.LoyaltyProgram.Slug, "base")
		if err != nil {
			cpp = uc.Card.LoyaltyProgram.BaseCPP
		}
	}

	// ── Cap logic ─────────────────────────────────────────────────────────
	effectiveRate := multiplier.EarnRate
	isCapHit := false
	note := ""

	if multiplier.CapAmount != nil && *multiplier.CapAmount > 0 {
		currentMonth := beginningOfMonth(time.Now())

		// Check if this category belongs to a shared cap group
		capGroup, capErr := s.spendRepo.GetCapGroupForCard(ctx, uc.CardID, categoryID)
		if capErr == nil && capGroup != nil {
			// Shared cap group: sum spend across all grouped categories
			monthlySpend, _ := s.spendRepo.GetMonthlySpend(ctx, uc.UserID, uc.CardID, currentMonth)
			var totalCappedSpend float64
			for _, catID := range capGroup.CategoryIDs {
				totalCappedSpend += monthlySpend[catID]
			}
			effectiveRate, isCapHit, note = calculateBlendedRate(
				spendAmount, totalCappedSpend, capGroup.CapAmount, capGroup.CapPeriod,
				multiplier.EarnRate, multiplier.FallbackEarnRate,
			)
		} else {
			// Per-category cap (no shared group)
			monthlySpend, _ := s.spendRepo.GetMonthlySpend(ctx, uc.UserID, uc.CardID, currentMonth)
			currentSpend := monthlySpend[categoryID]
			effectiveRate, isCapHit, note = calculateBlendedRate(
				spendAmount, currentSpend, *multiplier.CapAmount, safeStr(multiplier.CapPeriod),
				multiplier.EarnRate, multiplier.FallbackEarnRate,
			)
		}
	}

	// ── Cashback cards (Rogers Platinum, Tangerine, etc.) ────────────────
	if multiplier.EarnType == "cashback_pct" {
		dollarValue := spendAmount * (effectiveRate / 100)
		return model.CardRecommendation{
			CardID:            uc.CardID,
			CardName:          uc.Card.Name,
			ProgramName:       uc.Card.LoyaltyProgram.Name,
			EarnRate:          effectiveRate,
			ProgramCPP:        1.0,
			EffectiveReturn:   effectiveRate,
			PointsEarned:      0,
			DollarValue:       dollarValue,
			IsCapHit:          isCapHit,
			Note:              note,
			RedemptionSegment: segment,
		}, nil
	}

	// ── Points / miles cards ──────────────────────────────────────────────
	pointsEarned := spendAmount * effectiveRate
	dollarValue := pointsEarned * (cpp / 100) // cpp in cents → CAD dollars
	effectiveReturn := (dollarValue / spendAmount) * 100

	rec := model.CardRecommendation{
		CardID:            uc.CardID,
		CardName:          uc.Card.Name,
		ProgramName:       uc.Card.LoyaltyProgram.Name,
		EarnRate:          effectiveRate,
		ProgramCPP:        cpp,
		EffectiveReturn:   effectiveReturn,
		PointsEarned:      pointsEarned,
		DollarValue:       dollarValue,
		IsCapHit:          isCapHit,
		Note:              note,
		RedemptionSegment: segment,
	}

	// ── Transfer partner optimization ────────────────────────────────────
	// Check if transferring points to a partner program yields higher value
	transfers, transferErr := s.transferRepo.GetTransferRoutes(ctx, uc.Card.LoyaltyProgramID)
	if transferErr == nil {
		for _, tp := range transfers {
			destCPP, destErr := s.getCPP(ctx, tp.ToProgram.Slug, segment)
			if destErr != nil {
				// Try base segment as fallback
				destCPP, destErr = s.getCPP(ctx, tp.ToProgram.Slug, "base")
				if destErr != nil {
					continue
				}
			}

			transferredPoints := pointsEarned * tp.TransferRatio
			transferValue := transferredPoints * (destCPP / 100)

			if transferValue > rec.DollarValue {
				rec.DollarValue = transferValue
				rec.EffectiveReturn = (transferValue / spendAmount) * 100
				rec.ProgramCPP = destCPP
				rec.TransferPartner = tp.ToProgram.Name
				rec.TransferRatio = tp.TransferRatio
				rec.TransferCPP = destCPP
				if note != "" {
					note += " | "
				}
				note += fmt.Sprintf("Best via %s (%.0f:1 transfer, %.2f¢/pt)",
					tp.ToProgram.Name, tp.TransferRatio, destCPP)
				rec.Note = note
			}
		}
	}

	return rec, nil
}

// calculateBlendedRate computes the effective earn rate when a cap may be partially hit.
// Returns the effective rate, whether the cap was hit, and a descriptive note.
func calculateBlendedRate(
	spendAmount, currentSpend, capAmount float64,
	capPeriod string,
	bonusRate, fallbackRate float64,
) (effectiveRate float64, isCapHit bool, note string) {
	remainingCap := capAmount - currentSpend

	if remainingCap <= 0 {
		// Cap fully exhausted — all spend at fallback rate
		return fallbackRate, true, fmt.Sprintf("Cap hit: $%.0f/%s fully spent", capAmount, capPeriod)
	}

	if spendAmount <= remainingCap {
		// Entire spend within cap — full bonus rate
		note = fmt.Sprintf("Cap: $%.0f of $%.0f/%s remaining", remainingCap, capAmount, capPeriod)
		return bonusRate, false, note
	}

	// Partial cap hit — blended rate
	bonusPortion := remainingCap
	fallbackPortion := spendAmount - remainingCap
	blended := (bonusPortion*bonusRate + fallbackPortion*fallbackRate) / spendAmount

	note = fmt.Sprintf("$%.0f at %.1fx + $%.0f at %.1fx (cap: $%.0f/%s)",
		bonusPortion, bonusRate, fallbackPortion, fallbackRate, capAmount, capPeriod)
	return blended, true, note
}

// getCPP fetches from Redis; on miss, hits the DB and re-warms the cache.
func (s *OptimizerService) getCPP(ctx context.Context, programSlug, segment string) (float64, error) {
	cpp, err := s.cache.GetValuation(ctx, programSlug, segment)
	if err == nil {
		return cpp, nil
	}
	cpp, err = s.valuationRepo.GetCPP(ctx, programSlug, segment)
	if err != nil {
		return 0, err
	}
	// Fire-and-forget cache warm
	go s.cache.SetValuation(context.Background(), programSlug, segment, cpp) //nolint:errcheck
	return cpp, nil
}

func safeStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func beginningOfMonth(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, t.Location())
}
