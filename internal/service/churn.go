package service

import (
	"context"
	"fmt"
	"math"
	"sort"
	"time"

	"maplerewards/internal/model"
)

// Repo dependencies are interfaces (DI per .claude/rules/go-service.md).
type churnWalletRepo interface {
	GetUserBySession(ctx context.Context, sessionID string) (*model.User, error)
	GetUserCards(ctx context.Context, userID string) ([]model.UserCard, error)
}

type churnCardRepo interface {
	ListCards(ctx context.Context) ([]model.Card, error)
}

type churnSpendRepo interface {
	GetSpendStats(ctx context.Context, userID string) (*model.SpendStats, error)
	SpendMonthsObserved(ctx context.Context, userID string) (int, error)
}

// churnEligibilityChecker is the existing application-eligibility logic, reused
// rather than reimplemented. *ApplicationService satisfies this; CheckEligibility
// already consults issuer_rules (cooldown_days) + the user's application history
// and returns the cooldown verdict. The planner only interprets that verdict.
type churnEligibilityChecker interface {
	CheckEligibility(ctx context.Context, sessionID, cardID string) (*EligibilityResult, error)
}

// churnMaxRecommendations caps the eligible list so the tile stays readable; the
// best cards are at the top after ranking, so the tail is the long-shot stuff.
const churnMaxRecommendations = 8

// churnMaxBlocked caps the blocked list to the most attractive cooldown-locked
// cards (ranked by bonus value), so a user sees what's worth waiting for without
// a wall of every card they can't get today.
const churnMaxBlocked = 5

// ChurnPlannerService recommends the best NEXT card to apply for: it maximizes
// welcome-bonus value, subject to (a) the issuer's cooldown eligibility rules
// (reused from ApplicationService.CheckEligibility — not duplicated) and (b) the
// user's demonstrated ability to hit the card's minimum spend. Read-only over
// the wallet (held cards excluded as candidates), the card catalog, the user's
// spend history, and the application/eligibility logic.
type ChurnPlannerService struct {
	wallet      churnWalletRepo
	cards       churnCardRepo
	spend       churnSpendRepo
	eligibility churnEligibilityChecker
}

func NewChurnPlannerService(wallet churnWalletRepo, cards churnCardRepo, spend churnSpendRepo, eligibility churnEligibilityChecker) *ChurnPlannerService {
	return &ChurnPlannerService{wallet: wallet, cards: cards, spend: spend, eligibility: eligibility}
}

// Plan builds the churn plan for the wallet behind sessionID.
func (s *ChurnPlannerService) Plan(ctx context.Context, sessionID string) (*model.ChurnPlan, error) {
	plan := &model.ChurnPlan{
		Year:            time.Now().Year(),
		Recommendations: []model.ChurnCandidate{},
		Blocked:         []model.ChurnCandidate{},
	}

	user, err := s.wallet.GetUserBySession(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("churn: lookup user: %w", err)
	}
	if user == nil {
		return plan, nil
	}

	held, err := s.wallet.GetUserCards(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("churn: load held cards: %w", err)
	}
	catalog, err := s.cards.ListCards(ctx)
	if err != nil {
		return nil, fmt.Errorf("churn: load catalog: %w", err)
	}
	stats, err := s.spend.GetSpendStats(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("churn: load spend stats: %w", err)
	}
	months, err := s.spend.SpendMonthsObserved(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("churn: load spend months: %w", err)
	}

	heldCardIDs := make(map[string]bool, len(held))
	for _, uc := range held {
		heldCardIDs[uc.CardID] = true
	}

	// Average monthly spend = total spend / months observed. No history → 0,
	// which marks every min-spend feasibility false (we can't claim a user who
	// has logged nothing can hit a $4,500/4mo bonus).
	var avgMonthlySpend float64
	if stats != nil && months > 0 {
		avgMonthlySpend = stats.TotalSpend / float64(months)
	}

	var eligible, blocked []model.ChurnCandidate
	for _, c := range catalog {
		// Candidate = active card the user does NOT already hold, with a bonus.
		if heldCardIDs[c.ID] || !c.IsActive || c.WelcomeBonusPoints <= 0 {
			continue
		}

		cand := s.scoreCandidate(c, avgMonthlySpend)

		// Reuse existing eligibility logic per candidate.
		elig, err := s.eligibility.CheckEligibility(ctx, sessionID, c.ID)
		if err != nil {
			return nil, fmt.Errorf("churn: eligibility for %s: %w", c.ID, err)
		}
		applyEligibility(&cand, elig)

		if cand.Eligible {
			eligible = append(eligible, cand)
		} else {
			blocked = append(blocked, cand)
		}
	}

	// Eligible: feasible-to-hit bonuses first, then by net first-year value desc.
	sort.SliceStable(eligible, func(i, j int) bool {
		if eligible[i].MinSpendFeasible != eligible[j].MinSpendFeasible {
			return eligible[i].MinSpendFeasible // feasible (true) sorts first
		}
		return eligible[i].NetFirstYearValueCAD > eligible[j].NetFirstYearValueCAD
	})
	// Blocked: most attractive (by raw bonus value) first.
	sort.SliceStable(blocked, func(i, j int) bool {
		return blocked[i].WelcomeBonusValueCAD > blocked[j].WelcomeBonusValueCAD
	})

	// total_potential_bonus_value = sum of eligible AND feasible bonus values.
	// This is the realistically-bankable haul, not the full eligible list (which
	// may include bonuses the user's spend can't actually unlock).
	var totalPotential float64
	for _, c := range eligible {
		if c.MinSpendFeasible {
			totalPotential += c.WelcomeBonusValueCAD
		}
	}
	plan.TotalPotentialBonusValueCAD = churnRound(totalPotential)

	if len(eligible) > 0 {
		plan.BestNextCard = eligible[0].CardName
	}

	plan.Recommendations = capCandidates(eligible, churnMaxRecommendations)
	plan.Blocked = capCandidates(blocked, churnMaxBlocked)
	return plan, nil
}

// scoreCandidate computes the welcome-bonus value, fee math, and min-spend
// feasibility for one catalog card. Eligibility is layered on separately.
func (s *ChurnPlannerService) scoreCandidate(c model.Card, avgMonthlySpend float64) model.ChurnCandidate {
	programName, baseCPP := "", 0.0
	if c.LoyaltyProgram != nil {
		programName = c.LoyaltyProgram.Name
		baseCPP = c.LoyaltyProgram.BaseCPP
	}

	bonusValue := welcomeBonusValueCAD(c.WelcomeBonusPoints, baseCPP)
	netFirstYear := bonusValue - c.AnnualFee

	months := c.WelcomeBonusMonths
	if months < 1 {
		months = 1
	}
	monthlyNeeded := c.WelcomeBonusMinSpend / float64(months)
	// No min spend on the bonus → trivially feasible. Otherwise the user's
	// average monthly spend must cover the required monthly pace.
	feasible := c.WelcomeBonusMinSpend <= 0 || avgMonthlySpend >= monthlyNeeded

	return model.ChurnCandidate{
		CardID:                c.ID,
		CardName:              c.Name,
		Issuer:                c.Issuer,
		ProgramName:           programName,
		WelcomeBonusPoints:    c.WelcomeBonusPoints,
		WelcomeBonusValueCAD:  churnRound(bonusValue),
		AnnualFee:             churnRound(c.AnnualFee),
		NetFirstYearValueCAD:  churnRound(netFirstYear),
		MinSpend:              churnRound(c.WelcomeBonusMinSpend),
		MinSpendMonths:        c.WelcomeBonusMonths,
		MonthlySpendNeededCAD: churnRound(monthlyNeeded),
		MinSpendFeasible:      feasible,
	}
}

// welcomeBonusValueCAD converts a welcome bonus into CAD. base_cpp is cents per
// point and is the single source of truth for the conversion, so this one
// formula handles points/miles AND cashback gracefully:
//   - points/miles programs: e.g. 75,000 pts × 2.0¢ / 100 = $1,500.
//   - cashback programs: base_cpp encodes the cash value of one "point"
//     (Air Miles = 10.5¢/mile; a $-denominated cashback program would carry
//     base_cpp = 100, i.e. 1 point = $1 face value). Either way points × cpp /
//     100 yields the correct dollar figure — we never special-case by name.
func welcomeBonusValueCAD(points int, baseCPP float64) float64 {
	return float64(points) * baseCPP / 100
}

// applyEligibility folds the reused EligibilityResult into the candidate.
// CheckEligibility severities: "ok"/"unknown" → can apply today; "warn" →
// within issuer cooldown (blocked) with EligibleAt set to the clear date.
func applyEligibility(cand *model.ChurnCandidate, elig *EligibilityResult) {
	if elig == nil || elig.Severity != "warn" {
		cand.Eligible = true
		return
	}
	cand.Eligible = false
	cand.BlockReason = elig.Reason
	if elig.EligibleAt != nil {
		d := elig.EligibleAt.Format("2006-01-02")
		cand.EarliestEligibleDate = &d
	}
}

func capCandidates(cands []model.ChurnCandidate, n int) []model.ChurnCandidate {
	if len(cands) > n {
		cands = cands[:n]
	}
	if cands == nil {
		return []model.ChurnCandidate{}
	}
	return cands
}

func churnRound(v float64) float64 { return math.Round(v*100) / 100 }
