package service

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"

	"maplerewards/internal/model"
)

// Repo dependencies are interfaces (DI per .claude/rules/go-service.md).
type householdWalletRepo interface {
	GetUserBySession(ctx context.Context, sessionID string) (*model.User, error)
	GetUserCards(ctx context.Context, userID string) ([]model.UserCard, error)
}

type householdSpendRepo interface {
	GetSpendStats(ctx context.Context, userID string) (*model.SpendStats, error)
}

type householdCardRepo interface {
	GetCard(ctx context.Context, id string) (*model.Card, error)
	ListCategories(ctx context.Context) ([]model.Category, error)
	ListPrograms(ctx context.Context) ([]model.LoyaltyProgram, error)
	GetMultiplierForCard(ctx context.Context, cardID, categoryID string) (*model.CardMultiplier, error)
	GetEverythingElseMultiplier(ctx context.Context, cardID string) (*model.CardMultiplier, error)
}

// householdMaxPartnerCards bounds the partner-card array. Keeps the per-category
// scan (cards × categories × multiplier lookups) cheap and rejects a payload
// that tries to score a large slice of the catalog as a fake "partner".
const householdMaxPartnerCards = 12

// ErrHouseholdTooManyPartnerCards is returned when partner_card_ids exceeds the bound.
var ErrHouseholdTooManyPartnerCards = fmt.Errorf("at most %d partner cards may be supplied", householdMaxPartnerCards)

// householdNote is stamped on every report so the UI is honest about the model:
// it uses the *user's* logged spend as the household spend proxy, values it at
// each card's category rate, and deliberately ignores monthly caps.
const householdNote = "Estimates use your logged spend as a household proxy, valued at each card's category earn rate. Monthly category caps are ignored, so a capped accelerator card may read slightly high."

// ownerYou / ownerPartner tag each combined card with which side of the
// household holds it.
const (
	ownerYou     = "you"
	ownerPartner = "partner"
)

// HouseholdService optimizes a household's combined wallet: the user's held
// cards plus a partner's cards (supplied as catalog ids, never another user's
// account). It scores every combined card against the user's logged spend per
// category, names the best card + owner for each category, and flags
// fee-carrying cards that are redundant (a saving you could cut). Read-only over
// the wallet, spend history, and the card catalog.
//
// SECURITY: the partner is represented solely by catalog card ids in the
// request body. No second user, wallet, or session is ever resolved — the only
// session touched is {sessionID}, guarded by RequireSessionOwner.
type HouseholdService struct {
	wallet householdWalletRepo
	spend  householdSpendRepo
	card   householdCardRepo
}

func NewHouseholdService(wallet householdWalletRepo, spend householdSpendRepo, card householdCardRepo) *HouseholdService {
	return &HouseholdService{wallet: wallet, spend: spend, card: card}
}

// householdCard is one card in the combined household wallet plus which side
// owns it. Owner travels with the card through scoring so coverage and cancel
// rows can name whose card it is.
type householdCard struct {
	card  *model.Card
	owner string
}

// householdScore is the best card (by annual dollar value) for one category and
// the runner-up's value, so redundancy can ask "does removing the winner drop
// this category's best value?" without re-scanning.
type householdScore struct {
	bestID     string
	bestName   string
	bestOwner  string
	bestValue  float64
	secondBest float64 // value of the next-best card (0 if none)
}

// Analyze builds the household optimizer report for the wallet behind
// sessionID, treating partnerCardIDs as the partner's catalog cards.
func (s *HouseholdService) Analyze(ctx context.Context, sessionID string, partnerCardIDs []string) (*model.HouseholdReport, error) {
	out := &model.HouseholdReport{
		CategoryCoverage: []model.HouseholdCategoryCoverage{},
		CancelCandidates: []model.HouseholdCancelCandidate{},
		Note:             householdNote,
	}

	// De-dupe + reject blank/garbage ids up front, then bound the array.
	partnerCardIDs = cleanIDs(partnerCardIDs)
	if len(partnerCardIDs) > householdMaxPartnerCards {
		return nil, ErrHouseholdTooManyPartnerCards
	}

	user, err := s.wallet.GetUserBySession(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("household: lookup user: %w", err)
	}
	if user == nil {
		return out, nil
	}

	held, err := s.wallet.GetUserCards(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("household: load held cards: %w", err)
	}
	stats, err := s.spend.GetSpendStats(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("household: load spend: %w", err)
	}
	programs, err := s.card.ListPrograms(ctx)
	if err != nil {
		return nil, fmt.Errorf("household: load programs: %w", err)
	}
	categories, err := s.card.ListCategories(ctx)
	if err != nil {
		return nil, fmt.Errorf("household: load categories: %w", err)
	}

	// program_id → base_cpp (cents per point). Source of truth for the points →
	// dollars conversion, mirroring simulator/portfolio/churn.
	cppByProgram := make(map[string]float64, len(programs))
	for _, p := range programs {
		cppByProgram[p.ID] = p.BaseCPP
	}
	// category_name → category (we need the ID to look up multipliers; spend
	// stats only carry the name). Case-insensitive to be resilient to
	// display-name casing, exactly like the simulator.
	catByName := make(map[string]model.Category, len(categories))
	for _, c := range categories {
		catByName[strings.ToLower(c.Name)] = c
	}

	// Combined household wallet = your held cards (tagged "you") + the partner's
	// catalog cards (tagged "partner"). De-dupe within each set and across them:
	// a card the user already holds is never double-counted as a partner card.
	combined := make([]householdCard, 0, len(held)+len(partnerCardIDs))
	seen := make(map[string]bool)
	for _, uc := range held {
		if uc.Card == nil || seen[uc.CardID] {
			continue
		}
		seen[uc.CardID] = true
		combined = append(combined, householdCard{card: uc.Card, owner: ownerYou})
		out.YouCardCount++
	}
	for _, id := range partnerCardIDs {
		if seen[id] {
			// Already in the household as your card — skip silently rather than
			// inflate the partner count with a duplicate.
			continue
		}
		c, err := s.card.GetCard(ctx, id)
		if err != nil || c == nil {
			return nil, fmt.Errorf("household: partner card %q: %w", id, errOrNotFound(err))
		}
		if !c.IsActive {
			return nil, fmt.Errorf("household: partner card %q is not active", id)
		}
		seen[id] = true
		combined = append(combined, householdCard{card: c, owner: ownerPartner})
		out.PartnerCardCount++
	}

	// Score each spend category once across the whole combined wallet. We keep
	// the full score (winner + runner-up) so the redundancy pass is O(cards ×
	// categories) without re-scoring.
	type catScore struct {
		name  string
		score householdScore
	}
	var scored []catScore
	if stats != nil {
		for _, cs := range stats.ByCategory {
			annualSpend := cs.TotalSpend
			if annualSpend <= 0 {
				continue
			}
			cat, ok := catByName[strings.ToLower(cs.CategoryName)]
			catID := ""
			if ok {
				catID = cat.ID
			}
			sc, err := s.scoreCategory(ctx, combined, cppByProgram, catID, annualSpend)
			if err != nil {
				return nil, err
			}
			if sc.bestID == "" {
				// No card earns anything here (e.g. empty wallet) — nothing to
				// cover, skip.
				continue
			}
			scored = append(scored, catScore{name: cs.CategoryName, score: sc})
			out.CategoryCoverage = append(out.CategoryCoverage, model.HouseholdCategoryCoverage{
				CategoryName:   cs.CategoryName,
				BestCardID:     sc.bestID,
				BestCardName:   sc.bestName,
				Owner:          sc.bestOwner,
				EffectiveValue: householdRound(sc.bestValue),
			})
		}
	}

	// Highest-value category first so the UI leads with where the household
	// earns most.
	sort.SliceStable(out.CategoryCoverage, func(i, j int) bool {
		return out.CategoryCoverage[i].EffectiveValue > out.CategoryCoverage[j].EffectiveValue
	})

	// soleBest[cardID] is true when that card is the *only* best card for some
	// category the user spends in (removing it would strictly lower that
	// category's best household value). Such a card is never redundant.
	soleBest := make(map[string]bool)
	for _, sc := range scored {
		// The winner is "sole" iff dropping it leaves a strictly lower best
		// value — i.e. the runner-up earns less than the winner here.
		if sc.score.bestValue-sc.score.secondBest > 0.005 {
			soleBest[sc.score.bestID] = true
		}
	}

	// Redundancy / cancel candidates. A card is redundant when it is the sole
	// best for no category. For redundant cards carrying an annual fee, surface
	// the fee as a potential saving (its owner travels with it). Iterate the
	// combined wallet in order so output is deterministic.
	for _, hc := range combined {
		c := hc.card
		if soleBest[c.ID] {
			continue
		}
		if c.AnnualFee <= 0 {
			// Redundant but free — holding it costs nothing, not a cancel
			// candidate.
			continue
		}
		whose := "Your"
		if hc.owner == ownerPartner {
			whose = "Partner's"
		}
		out.CancelCandidates = append(out.CancelCandidates, model.HouseholdCancelCandidate{
			CardID:    c.ID,
			CardName:  c.Name,
			Owner:     hc.owner,
			AnnualFee: householdRound(c.AnnualFee),
			Reason:    fmt.Sprintf("%s card isn't the best for any category you spend in — another household card covers it. Cancelling saves the $%.0f fee.", whose, c.AnnualFee),
		})
		out.TotalFeeSavingsOpportunityCAD += c.AnnualFee
	}

	// Biggest fee saving first.
	sort.SliceStable(out.CancelCandidates, func(i, j int) bool {
		return out.CancelCandidates[i].AnnualFee > out.CancelCandidates[j].AnnualFee
	})

	out.TotalFeeSavingsOpportunityCAD = householdRound(out.TotalFeeSavingsOpportunityCAD)
	return out, nil
}

// scoreCategory finds the best and second-best household card (by annual dollar
// value) for one category's annual spend. Caps are intentionally not applied —
// this is a hypothetical estimate (see householdNote). The runner-up value lets
// the caller decide whether the winner is the *sole* cover for the category.
func (s *HouseholdService) scoreCategory(
	ctx context.Context,
	cards []householdCard,
	cppByProgram map[string]float64,
	categoryID string,
	annualSpend float64,
) (householdScore, error) {
	var best householdScore
	for _, hc := range cards {
		c := hc.card
		if c == nil {
			continue
		}
		rate, err := s.effectiveReturn(ctx, c, cppByProgram, categoryID)
		if err != nil {
			return best, err
		}
		val := annualSpend * rate
		switch {
		case val > best.bestValue:
			best.secondBest = best.bestValue
			best.bestID = c.ID
			best.bestName = c.Name
			best.bestOwner = hc.owner
			best.bestValue = val
		case val > best.secondBest:
			best.secondBest = val
		}
	}
	return best, nil
}

// effectiveReturn is a card's decimal return rate for a category (e.g. 0.04 =
// 4%). Identical scoring to the simulator: cashback uses the percentage
// directly; points/miles/dollars convert the earn rate through the program's
// base_cpp; falls back to the card's everything-else multiplier when no
// category-specific multiplier exists.
func (s *HouseholdService) effectiveReturn(
	ctx context.Context,
	c *model.Card,
	cppByProgram map[string]float64,
	categoryID string,
) (float64, error) {
	var mult *model.CardMultiplier
	if categoryID != "" {
		m, err := s.card.GetMultiplierForCard(ctx, c.ID, categoryID)
		if err == nil {
			mult = m
		} else if !errors.Is(err, pgx.ErrNoRows) {
			// A real DB error must NOT be silently priced as $0 — that would
			// wrongly flag a card as redundant ("cancel it"). Propagate it.
			return 0, fmt.Errorf("multiplier lookup (card %s, cat %s): %w", c.ID, categoryID, err)
		}
	}
	if mult == nil {
		m, err := s.card.GetEverythingElseMultiplier(ctx, c.ID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return 0, nil // genuinely no rate for this card → 0 is correct
			}
			return 0, fmt.Errorf("everything-else multiplier (card %s): %w", c.ID, err)
		}
		if m == nil {
			return 0, nil
		}
		mult = m
	}

	if mult.EarnType == "cashback_pct" {
		return mult.EarnRate / 100, nil
	}
	// points / miles / dollars: earn_rate × base_cpp / 100.
	cpp := cppByProgram[c.LoyaltyProgramID]
	if cpp == 0 && c.LoyaltyProgram != nil {
		// Fall back to the program embedded on the card if it wasn't in the
		// ListPrograms map.
		cpp = c.LoyaltyProgram.BaseCPP
	}
	return mult.EarnRate * cpp / 100, nil
}

func householdRound(v float64) float64 { return math.Round(v*100) / 100 }
