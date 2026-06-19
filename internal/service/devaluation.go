package service

import (
	"context"
	"fmt"
	"math"
	"time"

	"maplerewards/internal/model"
	"maplerewards/internal/repo"
)

type DevaluationRepository interface {
	ListUpcoming(ctx context.Context, userPrograms map[string]bool) ([]model.DevaluationEvent, error)
}

// DevaluationAlertStore is the repo surface for persisted per-user devaluation
// alert subscriptions. Satisfied by repo.DevaluationAlertRepo.
type DevaluationAlertStore interface {
	ListByUser(ctx context.Context, userID string) ([]repo.DevaluationAlert, error)
	Upsert(ctx context.Context, userID, programSlug string) (*repo.DevaluationAlert, error)
	Delete(ctx context.Context, userID, programSlug string) error
}

type DevaluationService struct {
	walletRepo WalletRepository
	devRepo    DevaluationRepository
	alertStore DevaluationAlertStore
}

func NewDevaluationService(walletRepo WalletRepository, devRepo DevaluationRepository, alertStore DevaluationAlertStore) *DevaluationService {
	return &DevaluationService{walletRepo: walletRepo, devRepo: devRepo, alertStore: alertStore}
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
	Program       string  `json:"program"`        // "aeroplan"
	EffectiveDate string  `json:"effective_date"` // "2026-06-01"
	DaysUntil     int     `json:"days_until"`     // can be negative if past
	Balance       int64   `json:"balance"`        // total aeroplan points across user's cards
	CPP           float64 `json:"cpp"`            // cents-per-point today
	ValueToday    float64 `json:"value_today"`    // CAD
	ValueAfter    float64 `json:"value_after"`    // CAD after chart hike
	Exposure      float64 `json:"exposure"`       // CAD = today - after
	Headline      string  `json:"headline"`       // human-friendly one-liner
	BurnFraction  float64 `json:"burn_fraction"`  // assumption: % of balance typically used for long-haul biz
	HikePercent   float64 `json:"hike_percent"`   // assumption: chart-hike severity
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
//
//	value_today    = balance × CPP / 100
//	exposure       = value_today × burnFraction × (hike / (1 + hike))
//	value_after    = value_today - exposure
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

// devaluationAnchorPoints is the canonical UI award-cost anchor. Since
// devaluation_events has no per-event magnitude column, every projection is
// expressed against this fixed representative award cost (e.g. "75K → 88K")
// rather than a real per-route booking quote.
const devaluationAnchorPoints int64 = 75000

// deriveHikePercent maps an event's severity to an assumed points-required hike.
// 'major' = 0.171, anchored to the real Aeroplan June-2026 +17.1% chart hike;
// 'minor' = 0.05. These are documented assumptions surfaced in the response, not
// per-event data.
func deriveHikePercent(severity string) float64 {
	if severity == "major" {
		return 0.171
	}
	return 0.05
}

// deriveBurnFraction maps severity to the assumed fraction of a held balance a
// user would burn on the affected redemption type. Surfaced in the response.
func deriveBurnFraction(severity string) float64 {
	if severity == "major" {
		return 0.30
	}
	return 0.15
}

// buildTrend emits a 6-point synthetic monthly series ending at the event's
// effective-date month, linearly interpolating today → after. This is purely
// directional projection data (NOT a historical award chart) so the UI can draw
// a sloped before/after line; the projection is labelled as such in the headline.
func buildTrend(today, after int64, effectiveDate string) []model.DevaluationTrendPoint {
	const n = 6
	eff, err := time.Parse("2006-01-02", effectiveDate)
	if err != nil {
		eff = time.Now()
	}
	out := make([]model.DevaluationTrendPoint, 0, n)
	for i := 0; i < n; i++ {
		// Step i runs from (n-1) months before the effective month up to it, so
		// the final point lands on effective_date's month.
		m := eff.AddDate(0, -(n - 1 - i), 0)
		frac := float64(i) / float64(n-1)
		pts := int64(math.Round(float64(today) + frac*float64(after-today)))
		out = append(out, model.DevaluationTrendPoint{
			Month:  m.Format("2006-01"),
			Points: pts,
		})
	}
	return out
}

// devaluationProjectionHeadline mirrors aeroplanProjectionHeadline's tone but
// generalizes to any program/event, handling the zero-balance case by surfacing
// the points projection without implying a misleading $0 exposure.
func devaluationProjectionHeadline(title string, today, after int64, exposure float64, holds bool, daysUntil int) string {
	if !holds || exposure == 0 {
		return fmt.Sprintf("%s — projected ~%dK → ~%dK points. You hold no balance here, so no direct exposure.", title, today/1000, after/1000)
	}
	if daysUntil <= 0 {
		return fmt.Sprintf("%s is now in effect — projected ~%dK → ~%dK points.", title, today/1000, after/1000)
	}
	if exposure < 5 {
		return fmt.Sprintf("%s is %d days away — your exposure is minimal.", title, daysUntil)
	}
	return fmt.Sprintf("You're ~$%.2f exposed to %s — %d days to redeem at current rates.", exposure, title, daysUntil)
}

// ListProjections returns a per-program "Today → After" award-cost projection
// for every upcoming devaluation event the user holds. The hike/burn magnitudes
// are derived from severity (no numeric column exists); today_points is the
// fixed anchor and trend is synthetic/directional. When the program is in the
// user's wallet, the CAD value_today/value_after/exposure are filled via the
// same buying-power formula ProjectAeroplanJune2026 uses.
func (s *DevaluationService) ListProjections(ctx context.Context, sessionID string) ([]model.DevaluationProjection, error) {
	var userPrograms map[string]bool
	// balances[slug] = total point balance; cpps[slug] = first non-zero BaseCPP.
	balances := map[string]int64{}
	cpps := map[string]float64{}
	enabled := map[string]bool{}

	if sessionID != "" {
		user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
		if err != nil {
			return nil, fmt.Errorf("session lookup: %w", err)
		}
		if user != nil {
			userPrograms = map[string]bool{}
			cards, err := s.walletRepo.GetUserCards(ctx, user.ID)
			if err == nil {
				for _, c := range cards {
					if c.Card == nil || c.Card.LoyaltyProgram == nil {
						continue
					}
					slug := c.Card.LoyaltyProgram.Slug
					userPrograms[slug] = true
					balances[slug] += c.PointBalance
					if cpps[slug] == 0 && c.Card.LoyaltyProgram.BaseCPP > 0 {
						cpps[slug] = c.Card.LoyaltyProgram.BaseCPP
					}
				}
			}
			// Alert subscriptions flag alert_enabled per program.
			if s.alertStore != nil {
				subs, err := s.alertStore.ListByUser(ctx, user.ID)
				if err == nil {
					for _, a := range subs {
						enabled[a.ProgramSlug] = true
					}
				}
			}
		}
	}

	events, err := s.devRepo.ListUpcoming(ctx, userPrograms)
	if err != nil {
		return nil, err
	}

	out := make([]model.DevaluationProjection, 0, len(events))
	for _, e := range events {
		hike := deriveHikePercent(e.Severity)
		burn := deriveBurnFraction(e.Severity)
		todayPoints := devaluationAnchorPoints
		afterPoints := int64(math.Round(float64(todayPoints) * (1 + hike)))

		p := model.DevaluationProjection{
			ID:            e.ID,
			ProgramSlug:   e.ProgramSlug,
			Title:         e.Title,
			Severity:      e.Severity,
			EffectiveDate: e.EffectiveDate,
			DaysUntil:     e.DaysUntil,
			HikePercent:   hike,
			BurnFraction:  burn,
			TodayPoints:   todayPoints,
			AfterPoints:   afterPoints,
			AlertEnabled:  enabled[e.ProgramSlug],
			Trend:         buildTrend(todayPoints, afterPoints, e.EffectiveDate),
		}

		if bal, ok := balances[e.ProgramSlug]; ok && bal > 0 {
			cpp := cpps[e.ProgramSlug]
			if cpp == 0 {
				cpp = defaultAeroplanCPP
			}
			valueToday := math.Round(float64(bal)*cpp/100.0*100) / 100
			exposure := math.Round(valueToday*burn*(hike/(1+hike))*100) / 100
			valueAfter := math.Round((valueToday-exposure)*100) / 100
			p.UserHolds = true
			p.Balance = bal
			p.CPP = cpp
			p.ValueToday = valueToday
			p.ValueAfter = valueAfter
			p.Exposure = exposure
		}

		p.Headline = devaluationProjectionHeadline(e.Title, todayPoints, afterPoints, p.Exposure, p.UserHolds, e.DaysUntil)
		out = append(out, p)
	}
	return out, nil
}

// Subscribe persists a "Set devaluation alert" toggle for one program.
func (s *DevaluationService) Subscribe(ctx context.Context, sessionID, programSlug string) (*model.DevaluationAlert, error) {
	userID, err := s.resolveUser(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	if programSlug == "" {
		return nil, fmt.Errorf("program_slug required")
	}
	row, err := s.alertStore.Upsert(ctx, userID, programSlug)
	if err != nil {
		return nil, err
	}
	return &model.DevaluationAlert{
		ProgramSlug: row.ProgramSlug,
		CreatedAt:   row.CreatedAt.Format("2006-01-02"),
	}, nil
}

// Unsubscribe clears the user's alert toggle for one program.
func (s *DevaluationService) Unsubscribe(ctx context.Context, sessionID, programSlug string) error {
	userID, err := s.resolveUser(ctx, sessionID)
	if err != nil {
		return err
	}
	return s.alertStore.Delete(ctx, userID, programSlug)
}

// ListSubscriptions returns every program the user has an alert toggle on.
func (s *DevaluationService) ListSubscriptions(ctx context.Context, sessionID string) ([]model.DevaluationAlert, error) {
	userID, err := s.resolveUser(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	rows, err := s.alertStore.ListByUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := make([]model.DevaluationAlert, 0, len(rows))
	for _, r := range rows {
		out = append(out, model.DevaluationAlert{
			ProgramSlug: r.ProgramSlug,
			CreatedAt:   r.CreatedAt.Format("2006-01-02"),
		})
	}
	return out, nil
}

func (s *DevaluationService) resolveUser(ctx context.Context, sessionID string) (string, error) {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil || user == nil {
		return "", fmt.Errorf("session not found")
	}
	return user.ID, nil
}
