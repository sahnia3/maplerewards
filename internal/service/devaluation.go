package service

import (
	"context"
	"fmt"
	"math"
	"time"

	"maplerewards/internal/model"
)

type DevaluationRepository interface {
	ListUpcoming(ctx context.Context, userPrograms map[string]bool) ([]model.DevaluationEvent, error)
}

type DevaluationService struct {
	walletRepo WalletRepository
	devRepo    DevaluationRepository
}

func NewDevaluationService(walletRepo WalletRepository, devRepo DevaluationRepository) *DevaluationService {
	return &DevaluationService{walletRepo: walletRepo, devRepo: devRepo}
}

// ListAlerts returns events with `user_holds_balance` flagged when applicable.
// If sessionID is empty, returns all events without user-context filtering.
func (s *DevaluationService) ListAlerts(ctx context.Context, sessionID string) ([]model.DevaluationEvent, error) {
	var userPrograms map[string]bool
	if sessionID != "" {
		user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
		if err == nil && user != nil {
			userPrograms = map[string]bool{}
			cards, err := s.walletRepo.GetUserCards(ctx, user.ID)
			if err == nil {
				for _, c := range cards {
					if c.Card != nil && c.Card.LoyaltyProgram != nil {
						userPrograms[c.Card.LoyaltyProgram.Slug] = true
					}
				}
			}
		} else if err != nil {
			return nil, fmt.Errorf("session lookup: %w", err)
		}
	}
	out, err := s.devRepo.ListUpcoming(ctx, userPrograms)
	if err != nil {
		return nil, err
	}
	if out == nil {
		out = []model.DevaluationEvent{}
	}
	return out, nil
}

// AeroplanProjection is a per-user dollar-denominated exposure to the Aeroplan
// June-2026 long-haul-business chart hike. The number is directional, not a
// precise booking quote — real exposure depends on which routes the user
// actually plans to redeem on. The display purpose is to make the
// "book by May 31" urgency tangible.
type AeroplanProjection struct {
	Program        string  `json:"program"`         // "aeroplan"
	EffectiveDate  string  `json:"effective_date"`  // "2026-06-01"
	DaysUntil      int     `json:"days_until"`      // can be negative if past
	Balance        int64   `json:"balance"`         // total aeroplan points across user's cards
	CPP            float64 `json:"cpp"`             // cents-per-point today
	ValueToday     float64 `json:"value_today"`     // CAD
	ValueAfter     float64 `json:"value_after"`     // CAD after chart hike
	Exposure       float64 `json:"exposure"`        // CAD = today - after
	Headline       string  `json:"headline"`        // human-friendly one-liner
	BurnFraction   float64 `json:"burn_fraction"`   // assumption: % of balance typically used for long-haul biz
	HikePercent    float64 `json:"hike_percent"`    // assumption: chart-hike severity
}

// June 1 2026 Aeroplan chart hike constants. Sourced from
// https://onemileatatime.com/news/aeroplan-updating-award-chart-devaluation/
// (long-haul biz NA→Pacific 87.5K → 102.5K = ~17.1% more points required).
const (
	aeroplanJune2026Date         = "2026-06-01"
	aeroplanJune2026HikePercent  = 0.171 // 17.1%
	aeroplanJune2026BurnFraction = 0.30  // assume ~30% of typical balance gets used for long-haul biz
	defaultAeroplanCPP           = 2.1   // ¢ per point fallback
)

// ProjectAeroplanJune2026 returns the dollar exposure the user faces from the
// June 1 2026 Aeroplan long-haul-business chart hike, given their current
// Aeroplan point balance summed across all wallet cards.
//
// Formula:
//   value_today    = balance × CPP / 100
//   exposure       = value_today × burnFraction × (hike / (1 + hike))
//   value_after    = value_today - exposure
//
// Where burnFraction ≈ 0.30 (rough proportion of a typical Aeroplan balance
// allocated to long-haul biz redemptions) and hike ≈ 0.171 (the actual chart
// increase). A hike of H in points-required cuts buying power by H/(1+H), not
// H, so `exposure` is the CAD buying-power lost — not the raw H fraction, which
// overstated it. Both assumptions are surfaced in the response so the UI can
// explain its math.
func (s *DevaluationService) ProjectAeroplanJune2026(ctx context.Context, sessionID string) (*AeroplanProjection, error) {
	if sessionID == "" {
		return nil, fmt.Errorf("session_id required")
	}
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil || user == nil {
		return nil, fmt.Errorf("session lookup: %w", err)
	}
	cards, err := s.walletRepo.GetUserCards(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("wallet lookup: %w", err)
	}

	// Sum point balance for any card whose loyalty program is Aeroplan.
	// User may hold Aeroplan via TD Aeroplan Visa, CIBC Aeroplan, AMEX
	// Aeroplan Reserve, etc. — different cards, one shared currency.
	var balance int64
	var cpp float64
	for _, c := range cards {
		if c.Card == nil || c.Card.LoyaltyProgram == nil {
			continue
		}
		if c.Card.LoyaltyProgram.Slug != "aeroplan" {
			continue
		}
		balance += c.PointBalance
		if cpp == 0 && c.Card.LoyaltyProgram.BaseCPP > 0 {
			cpp = c.Card.LoyaltyProgram.BaseCPP
		}
	}
	if cpp == 0 {
		cpp = defaultAeroplanCPP
	}

	valueToday := float64(balance) * cpp / 100.0
	// A hike of H in points-required cuts the buying power of the affected
	// (burned) balance by H/(1+H), not H: the same award now costs (1+H)× the
	// points, so each point you hold buys 1/(1+H) as much. Using H directly
	// overstated the loss and made ValueAfter too low. `exposure` is the CAD
	// buying-power lost on the long-haul-business portion the user would burn.
	hike := aeroplanJune2026HikePercent
	exposure := valueToday * aeroplanJune2026BurnFraction * (hike / (1 + hike))
	exposure = math.Round(exposure*100) / 100 // cents
	valueToday = math.Round(valueToday*100) / 100
	valueAfter := math.Round((valueToday-exposure)*100) / 100

	effective, _ := time.Parse("2006-01-02", aeroplanJune2026Date)
	daysUntil := int(time.Until(effective).Hours() / 24)

	headline := aeroplanProjectionHeadline(balance, exposure, daysUntil)

	return &AeroplanProjection{
		Program:       "aeroplan",
		EffectiveDate: aeroplanJune2026Date,
		DaysUntil:     daysUntil,
		Balance:       balance,
		CPP:           cpp,
		ValueToday:    valueToday,
		ValueAfter:    valueAfter,
		Exposure:      exposure,
		Headline:      headline,
		BurnFraction:  aeroplanJune2026BurnFraction,
		HikePercent:   aeroplanJune2026HikePercent,
	}, nil
}

func aeroplanProjectionHeadline(balance int64, exposure float64, daysUntil int) string {
	if balance == 0 {
		return "No Aeroplan points on file — no June 1 exposure."
	}
	if daysUntil <= 0 {
		return "Aeroplan chart hike is now in effect — long-haul biz costs ~17% more points."
	}
	if exposure < 5 {
		return fmt.Sprintf("Aeroplan chart hike is %d days away — your exposure is minimal.", daysUntil)
	}
	return fmt.Sprintf("You're $%.2f exposed to the Aeroplan chart hike — %d days to redeem at current rates.", exposure, daysUntil)
}
