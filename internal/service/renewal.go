package service

import (
	"context"
	"fmt"
	"math"
	"time"

	"maplerewards/internal/model"
)

// Repo dependencies are interfaces (DI per .claude/rules/go-service.md).
type renewalWalletRepo interface {
	GetUserBySession(ctx context.Context, sessionID string) (*model.User, error)
	GetUserCards(ctx context.Context, userID string) ([]model.UserCard, error)
}

type renewalSpendRepo interface {
	GetSpendStats(ctx context.Context, userID string) (*model.SpendStats, error)
	// SpendMonthsObserved is the data-window signal: how many distinct calendar
	// months the user has logged spend in. The same signal the churn planner
	// uses to avoid extrapolating one short window into an annual figure.
	SpendMonthsObserved(ctx context.Context, userID string) (int, error)
}

// minMonthsForCancelVerdict is the data-window floor below which a "cancel"
// verdict is softened to insufficient_history. With fewer than this many
// distinct logged months the annual value math is extrapolated from too short
// a window to recommend cancelling a card (a churner who logs one day of
// spend should not be told to cancel everything three tiles above a scorecard
// that says the cards earn their fee — QA P1-9/P2-11).
const minMonthsForCancelVerdict = 3

type renewalCreditRepo interface {
	ListUserCardCredits(ctx context.Context, userID string) ([]model.CardCreditStatus, error)
}

type renewalCardRepo interface {
	DowngradeCandidates(ctx context.Context, issuer, loyaltyProgramID string, belowFee float64, excludeCardID string) ([]model.Card, error)
}

// RenewalService decides, for each card a user holds, whether to keep it, use
// unused statement credits before the fee posts, or downgrade/cancel — based on
// the user's real reward value, credits, and the card's annual fee.
type RenewalService struct {
	wallet renewalWalletRepo
	spend  renewalSpendRepo
	credit renewalCreditRepo
	card   renewalCardRepo
}

func NewRenewalService(wallet renewalWalletRepo, spend renewalSpendRepo, credit renewalCreditRepo, card renewalCardRepo) *RenewalService {
	return &RenewalService{wallet: wallet, spend: spend, credit: credit, card: card}
}

// Assess builds the renewal report for the wallet behind sessionID.
func (s *RenewalService) Assess(ctx context.Context, sessionID string) (*model.RenewalReport, error) {
	report := &model.RenewalReport{Year: time.Now().Year(), Assessments: []model.RenewalAssessment{}}

	user, err := s.wallet.GetUserBySession(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("renewal: lookup user: %w", err)
	}
	if user == nil {
		return report, nil
	}

	cards, err := s.wallet.GetUserCards(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("renewal: load cards: %w", err)
	}
	stats, err := s.spend.GetSpendStats(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("renewal: load spend: %w", err)
	}
	credits, err := s.credit.ListUserCardCredits(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("renewal: load credits: %w", err)
	}
	monthsObserved, err := s.spend.SpendMonthsObserved(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("renewal: load spend window: %w", err)
	}
	thinHistory := monthsObserved < minMonthsForCancelVerdict
	report.SpendMonthsObserved = monthsObserved
	report.ThinSpendHistory = thinHistory

	spendByCard := make(map[string]float64)
	if stats != nil {
		for _, cs := range stats.ByCard {
			spendByCard[cs.CardName] = cs.TotalValue
		}
	}

	type creditAgg struct {
		value, used float64
		renewal     *string
		days        *int
	}
	creditByCard := make(map[string]*creditAgg)
	for _, cr := range credits {
		a := creditByCard[cr.CardID]
		if a == nil {
			a = &creditAgg{}
			creditByCard[cr.CardID] = a
		}
		a.value += annualizedCreditValue(cr.ValueCAD, cr.Recurrence)
		a.used += cr.RedeemedAmount
		if a.renewal == nil && cr.FeeRenewalDate != nil {
			a.renewal = cr.FeeRenewalDate
			a.days = cr.DaysToRenewal
		}
	}

	for _, uc := range cards {
		if uc.Card == nil {
			continue
		}
		c := uc.Card

		fee := c.AnnualFee
		if uc.CustomAnnualFee != nil {
			fee = *uc.CustomAnnualFee
		}

		spendVal := spendByCard[c.Name]
		var creditsVal, creditsUsed float64
		var renewal *string
		var days *int
		if a := creditByCard[c.ID]; a != nil {
			creditsVal, creditsUsed, renewal, days = a.value, a.used, a.renewal, a.days
		}

		realizedNet := spendVal + creditsUsed - fee
		potentialNet := spendVal + creditsVal - fee
		verdict, rationale := classifyRenewal(fee, spendVal, creditsVal, creditsUsed, realizedNet, potentialNet)

		// Data-window guard: a hard "cancel" verdict on a thin spend history is
		// extrapolating an annual picture from too short a window. Soften it to
		// insufficient_history with a caveat instead of telling the user to
		// cancel a card the value math hasn't actually had a chance to justify.
		if verdict == "downgrade_or_cancel" && thinHistory {
			verdict = "insufficient_history"
			rationale = fmt.Sprintf(
				"Not enough logged spend yet (%s) to judge this $%.0f fee — the numbers extrapolate from a short window. Log a few more months before deciding to cancel.",
				monthsLabel(monthsObserved), fee)
		}

		var downs []model.RenewalDowngradeOption
		if verdict == "downgrade_or_cancel" && fee > 0 {
			if cands, derr := s.card.DowngradeCandidates(ctx, c.Issuer, c.LoyaltyProgramID, fee, c.ID); derr == nil {
				for _, dc := range cands {
					downs = append(downs, model.RenewalDowngradeOption{
						CardID:    dc.ID,
						CardName:  dc.Name,
						AnnualFee: dc.AnnualFee,
						FeeSaved:  renewalRound(fee - dc.AnnualFee),
					})
				}
			}
		}

		programName := ""
		if c.LoyaltyProgram != nil {
			programName = c.LoyaltyProgram.Name
		}

		report.Assessments = append(report.Assessments, model.RenewalAssessment{
			CardID:           c.ID,
			CardName:         c.Name,
			Issuer:           c.Issuer,
			ProgramName:      programName,
			AnnualFee:        renewalRound(fee),
			FeeRenewalDate:   renewal,
			DaysToRenewal:    days,
			SpendValue:       renewalRound(spendVal),
			CreditsValue:     renewalRound(creditsVal),
			CreditsUsed:      renewalRound(creditsUsed),
			RealizedNet:      renewalRound(realizedNet),
			PotentialNet:     renewalRound(potentialNet),
			Verdict:          verdict,
			Rationale:        rationale,
			DowngradeOptions: downs,
		})

		report.TotalAnnualFees += fee
		report.TotalNetValue += realizedNet
		if verdict == "downgrade_or_cancel" {
			saved := fee // cancel recovers the whole fee
			if len(downs) > 0 {
				saved = downs[0].FeeSaved // cheapest downgrade target = biggest saving
			}
			report.PotentialSavings += saved
		}
	}

	report.TotalAnnualFees = renewalRound(report.TotalAnnualFees)
	report.TotalNetValue = renewalRound(report.TotalNetValue)
	report.PotentialSavings = renewalRound(report.PotentialSavings)
	return report, nil
}

// annualizedCreditValue amortizes a credit's face value over its recurrence
// period so a quadrennial credit (e.g. $100 NEXUS every 4 years) contributes
// ~$25/yr to the annual renewal decision instead of its full value every year.
func annualizedCreditValue(valueCAD float64, recurrence string) float64 {
	switch recurrence {
	case "biennial":
		return valueCAD / 2
	case "quadrennial":
		return valueCAD / 4
	}
	return valueCAD
}

// classifyRenewal turns the value/fee math into a verdict + plain-language reason.
func classifyRenewal(fee, spendVal, creditsVal, creditsUsed, realizedNet, potentialNet float64) (string, string) {
	if fee <= 0 {
		return "keep_no_fee", "No annual fee — keep it; holding it costs nothing."
	}
	if realizedNet >= 0 {
		return "keep", fmt.Sprintf("Pays for itself: about $%.0f in rewards and credits used vs the $%.0f fee.", spendVal+creditsUsed, fee)
	}
	if potentialNet >= 0 {
		unused := creditsVal - creditsUsed
		if unused < 0 {
			unused = 0
		}
		return "use_credits", fmt.Sprintf("About $%.0f short of breaking even — but you have ~$%.0f in unused credits. Use them before the fee posts.", -realizedNet, unused)
	}
	return "downgrade_or_cancel", fmt.Sprintf("Even using every credit, value (~$%.0f) trails the $%.0f fee. Consider a lower-fee card or cancelling.", spendVal+creditsVal, fee)
}

func renewalRound(v float64) float64 { return math.Round(v*100) / 100 }

// monthsLabel renders the observed data window in plain language for the
// insufficient_history caveat.
func monthsLabel(months int) string {
	switch {
	case months <= 0:
		return "no spend logged"
	case months == 1:
		return "1 month logged"
	default:
		return fmt.Sprintf("%d months logged", months)
	}
}
