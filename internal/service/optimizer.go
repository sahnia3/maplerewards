package service

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"strconv"
	"sync"
	"time"

	"maplerewards/internal/model"
)

// defaultUnverifiedAnnualCap bounds an accelerated multiplier that has no
// modelled cap (incomplete catalog data — docs/OPTIMIZER-CAP-AUDIT.md). It is
// intentionally conservative: it changes nothing for normal per-category
// spend (a few $k) but prevents the optimizer from ever projecting an
// unbounded, impossible accelerated total. Replaced per-card by verified
// terms once the gated cap-data remediation lands.
const defaultUnverifiedAnnualCap = 20000.0

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
	// Canada-specific network blackouts: Costco in-warehouse = Mastercard
	// only; the Loblaws empire (No Frills, Superstore, Shoppers, T&T…) does
	// not take Amex. Rules live in merchant_routing.go. An empty wallet after
	// filtering surfaces a clear, store-specific error rather than a silent
	// zero-result — see filterByMerchantAcceptance.
	if req.Merchant != "" {
		filtered, _, ferr := filterByMerchantAcceptance(userCards, req.Merchant)
		if ferr != nil {
			return nil, ferr
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
			rec, err := s.scoreCard(ctx, userCard, category.ID, req.SpendAmount, segment, req.PerPurchase)
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
	perPurchase bool,
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
	// A card's spend cap is modelled one of two mutually-exclusive ways:
	//   1. Shared cap group — several categories share one cap (Amex Cobalt:
	//      groceries+dining+streaming share $2,500/mo). The per-multiplier
	//      cap_amount is NULL; the cap lives in cap_groups (migration 000038
	//      moved Cobalt to this model).
	//   2. Per-multiplier cap — cap_amount set on the card_multipliers row
	//      (still used by 31 multipliers).
	// The shared-group check MUST run independent of multiplier.CapAmount.
	// Gating it behind cap_amount != nil (the old bug) made group-capped
	// cards skip cap enforcement entirely and rank on their uncapped headline
	// rate — e.g. Cobalt winning $10k spend at a flat 5x when its 5x is
	// capped at $2,500/mo.
	var effectiveRate float64
	isCapHit := false
	note := ""

	capGroup, capErr := s.spendRepo.GetCapGroupForCard(ctx, uc.CardID, categoryID)
	// perPurchase scores each call as an independent single transaction:
	// prior accumulated spend is treated as 0. The missed-rewards replay
	// uses this — applying the *current* live month's running cap state to
	// a transaction from months ago made "$X left on the table"
	// systematically wrong and non-deterministic (it changed as the month
	// accumulated). Per-purchase is the correct, deterministic semantics
	// for "which card should you have used for THIS purchase".
	switch {
	case capErr == nil && capGroup != nil:
		// Shared cap group: sum spend across all grouped categories.
		// Period-aware basis: year-to-date for an `annual` cap, month-to-date
		// for `monthly` (docs/OPTIMIZER-CAP-AUDIT.md §"Secondary code bug").
		var totalCappedSpend float64
		if !perPurchase {
			priorSpend, spendErr := s.spendRepo.GetSpendSince(
				ctx, uc.UserID, uc.CardID, capPeriodStart(capGroup.CapPeriod))
			if spendErr != nil {
				// Conservative fallback: previously this error was swallowed
				// and prior spend defaulted to 0, treating a fully-capped
				// user as having the WHOLE cap available — over-projecting
				// the bonus and ranking the wrong card #1. Assume the cap is
				// consumed so the card scores at its fallback rate:
				// under-promise on a transient blip, never over-promise.
				slog.Warn("optimizer: prior-spend lookup failed, assuming cap consumed",
					"card_id", uc.CardID, "err", spendErr)
				totalCappedSpend = capGroup.CapAmount
			} else {
				for _, catID := range capGroup.CategoryIDs {
					totalCappedSpend += priorSpend[catID]
				}
			}
		}
		effectiveRate, isCapHit, note = calculateBlendedRate(
			spendAmount, totalCappedSpend, capGroup.CapAmount, capGroup.CapPeriod,
			multiplier.EarnRate, multiplier.FallbackEarnRate,
		)
	case multiplier.CapAmount != nil && *multiplier.CapAmount > 0:
		// Per-multiplier cap (no shared group). Period-aware basis as above.
		var currentSpend float64
		if !perPurchase {
			priorSpend, spendErr := s.spendRepo.GetSpendSince(
				ctx, uc.UserID, uc.CardID, capPeriodStart(safeStr(multiplier.CapPeriod)))
			if spendErr != nil {
				// Conservative fallback (see shared-cap branch above):
				// assume the cap is consumed rather than defaulting prior
				// spend to 0 and over-projecting on a transient DB error.
				slog.Warn("optimizer: prior-spend lookup failed, assuming cap consumed",
					"card_id", uc.CardID, "err", spendErr)
				currentSpend = *multiplier.CapAmount
			} else {
				currentSpend = priorSpend[categoryID]
			}
		}
		effectiveRate, isCapHit, note = calculateBlendedRate(
			spendAmount, currentSpend, *multiplier.CapAmount, safeStr(multiplier.CapPeriod),
			multiplier.EarnRate, multiplier.FallbackEarnRate,
		)
	default:
		// SAFETY GUARDRAIL (unconditional). ~181 bonus multipliers across 72
		// cards have no modelled cap (the catalog data is incomplete — see
		// docs/OPTIMIZER-CAP-AUDIT.md). Almost every real Canadian card caps
		// accelerated earn; without a cap the optimizer projected absurd,
		// credibility-destroying numbers (e.g. Scotiabank Gold = 500,000 pts
		// on $100k).
		//
		// Every no-cap multiplier is now routed through calculateBlendedRate
		// with a conservative default annual cap and the card's own fallback
		// as the post-cap rate — UNCONDITIONALLY. This is provably bounded for
		// ALL cases regardless of how EarnRate/FallbackEarnRate are modelled:
		//   - Accelerated (bonus > fallback): the bonus portion is capped, the
		//     rest blends down to fallback. Cannot project unbounded points.
		//   - Flat / true unlimited (bonus == fallback): the blend is
		//     mathematically identical to the flat rate (bonus*cap +
		//     fallback*rest)/spend == rate, so legit unlimited cards are
		//     UNAFFECTED in value — no under-promising.
		//   - Mis-modelled (bonus <= fallback, or bonus <= 1): still bounded;
		//     the previous heuristic let these escape entirely.
		// Errs LOW (under-promise) and discloses the estimate only when the
		// bound actually changed the value (genuine accelerated earn).
		accelerated := multiplier.EarnRate > multiplier.FallbackEarnRate
		effectiveRate, isCapHit, note = calculateBlendedRate(
			spendAmount, 0, defaultUnverifiedAnnualCap, "annual",
			multiplier.EarnRate, multiplier.FallbackEarnRate,
		)
		if isCapHit && accelerated {
			note = "Estimate — accelerated earn assumed capped at $" +
				strconv.Itoa(int(defaultUnverifiedAnnualCap)) +
				"/yr pending verified card terms. " + note
		} else if !accelerated {
			// Flat/unlimited or mis-modelled: value is unchanged by the bound,
			// so don't show a misleading "cap hit" note or flag.
			isCapHit = false
			note = ""
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
		baseNote := note // the cap/blended note, before any transfer suffix
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
				// Rebuild from baseNote so only the CURRENT winning partner is
				// listed — appending left superseded partners in the note.
				suffix := fmt.Sprintf("Best via %s (%.0f:1 transfer, %.2f¢/pt)",
					tp.ToProgram.Name, tp.TransferRatio, destCPP)
				if baseNote != "" {
					rec.Note = baseNote + " | " + suffix
				} else {
					rec.Note = suffix
				}
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

func beginningOfYear(t time.Time) time.Time {
	return time.Date(t.Year(), 1, 1, 0, 0, 0, 0, t.Location())
}

// capPeriodStart returns the accumulation-window start for a cap period:
// year-start for "annual", month-start otherwise (the safe default for
// "monthly" and any unset/unknown period).
func capPeriodStart(period string) time.Time {
	now := time.Now()
	if period == "annual" {
		return beginningOfYear(now)
	}
	return beginningOfMonth(now)
}
