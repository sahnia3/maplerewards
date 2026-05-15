package service

import (
	"context"
	"fmt"
	"math"
	"time"

	"maplerewards/internal/model"
)

// WelcomeBonusMissionService enriches the raw bonus-tracking rows with
// velocity, projected completion, and miss-risk math so a Pro user can
// see "you will miss your Cobalt 30K bonus by $470 unless you redirect
// $X/week of grocery spend".
//
// All numbers are deterministic given the inputs — no AI here. The math
// stays in code so the UI can show its work.
type WelcomeBonusMissionService struct {
	walletRepo WalletRepository
	bonusRepo  BonusRepository
}

func NewWelcomeBonusMissionService(walletRepo WalletRepository, bonusRepo BonusRepository) *WelcomeBonusMissionService {
	return &WelcomeBonusMissionService{walletRepo: walletRepo, bonusRepo: bonusRepo}
}

// MissionItem is one card's enriched bonus state.
type MissionItem struct {
	model.WelcomeBonus
	DaysElapsed         int     `json:"days_elapsed"`
	DaysTotal           int     `json:"days_total"`
	DailyVelocityCAD    float64 `json:"daily_velocity_cad"`     // current_spend / days_elapsed
	RequiredDailyCAD    float64 `json:"required_daily_cad"`     // (min - current) / days_left
	ProjectedTotalCAD   float64 `json:"projected_total_cad"`    // velocity × days_total
	ProjectedShortfallCAD float64 `json:"projected_shortfall_cad"` // max(0, min - projected_total)
	WillMiss            bool    `json:"will_miss"`              // projected_total < min_spend
	WillMissByCAD       float64 `json:"will_miss_by_cad"`       // diagnostic = projected_shortfall_cad
	Severity            string  `json:"severity"`               // "on-track" | "tight" | "critical" | "missed"
	Recommendation      string  `json:"recommendation"`         // human-friendly action sentence
}

// MissionReport is the top-level payload — a list of active missions sorted
// most-urgent-first plus a roll-up of total at-risk dollars and points.
type MissionReport struct {
	Items                []MissionItem `json:"items"`
	TotalActive          int           `json:"total_active"`
	TotalAtRiskPoints    int           `json:"total_at_risk_points"`
	TotalRequiredDailyCAD float64      `json:"total_required_daily_cad"`
}

// Compute returns the mission report for a session. Completed bonuses are
// excluded — they're already won, no action needed.
func (s *WelcomeBonusMissionService) Compute(ctx context.Context, sessionID string) (*MissionReport, error) {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil || user == nil {
		return nil, fmt.Errorf("session lookup: %w", err)
	}
	bonuses, err := s.bonusRepo.GetUserBonuses(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("bonus lookup: %w", err)
	}

	now := time.Now()
	out := &MissionReport{Items: []MissionItem{}}
	for _, b := range bonuses {
		if b.IsCompleted {
			continue
		}
		item := enrich(b, now)
		out.Items = append(out.Items, item)
		if item.WillMiss {
			out.TotalAtRiskPoints += b.BonusPoints
		}
		out.TotalRequiredDailyCAD += item.RequiredDailyCAD
	}
	out.TotalActive = len(out.Items)

	// Sort: missed first (most urgent), then critical, then tight, then on-track.
	severityRank := map[string]int{"missed": 0, "critical": 1, "tight": 2, "on-track": 3}
	for i := 1; i < len(out.Items); i++ {
		for j := i; j > 0 && severityRank[out.Items[j].Severity] < severityRank[out.Items[j-1].Severity]; j-- {
			out.Items[j], out.Items[j-1] = out.Items[j-1], out.Items[j]
		}
	}
	return out, nil
}

func enrich(b model.WelcomeBonus, now time.Time) MissionItem {
	activated, _ := time.Parse("2006-01-02", b.ActivatedAt)
	deadline, _ := time.Parse("2006-01-02", b.DeadlineAt)

	daysTotal := int(deadline.Sub(activated).Hours() / 24)
	if daysTotal < 1 {
		daysTotal = 1
	}
	daysElapsed := int(now.Sub(activated).Hours() / 24)
	if daysElapsed < 0 {
		daysElapsed = 0
	}
	if daysElapsed > daysTotal {
		daysElapsed = daysTotal
	}

	var velocity float64
	if daysElapsed > 0 {
		velocity = b.CurrentSpend / float64(daysElapsed)
	}
	projectedTotal := velocity * float64(daysTotal)
	if b.CurrentSpend > projectedTotal {
		// Edge case: current_spend already exceeds linear projection from
		// elapsed days (e.g. they just made a big one-time charge today).
		// Use current_spend as the floor.
		projectedTotal = b.CurrentSpend
	}

	shortfall := math.Max(0, b.MinSpend-projectedTotal)

	var requiredDaily float64
	if b.DaysLeft > 0 && shortfall > 0 {
		requiredDaily = (b.MinSpend - b.CurrentSpend) / float64(b.DaysLeft)
		if requiredDaily < 0 {
			requiredDaily = 0
		}
	}

	willMiss := projectedTotal < b.MinSpend
	severity := severityOf(b, projectedTotal, shortfall, requiredDaily, velocity, now)
	rec := recommendationFor(b, severity, shortfall, requiredDaily)

	return MissionItem{
		WelcomeBonus:          b,
		DaysElapsed:           daysElapsed,
		DaysTotal:             daysTotal,
		DailyVelocityCAD:      roundCents(velocity),
		RequiredDailyCAD:      roundCents(requiredDaily),
		ProjectedTotalCAD:     roundCents(projectedTotal),
		ProjectedShortfallCAD: roundCents(shortfall),
		WillMiss:              willMiss,
		WillMissByCAD:         roundCents(shortfall),
		Severity:              severity,
		Recommendation:        rec,
	}
}

func severityOf(b model.WelcomeBonus, projected, shortfall, required, velocity float64, now time.Time) string {
	deadline, _ := time.Parse("2006-01-02", b.DeadlineAt)
	if now.After(deadline) && b.CurrentSpend < b.MinSpend {
		return "missed"
	}
	if projected < b.MinSpend*0.85 {
		return "critical"
	}
	if shortfall > 0 || required > velocity*1.5 {
		return "tight"
	}
	return "on-track"
}

func recommendationFor(b model.WelcomeBonus, severity string, shortfall, required float64) string {
	switch severity {
	case "missed":
		return fmt.Sprintf("Deadline passed — you fell $%.0f short of the %s minimum. Consider downgrading or cancelling before next year's annual fee.", b.MinSpend-b.CurrentSpend, b.CardName)
	case "critical":
		return fmt.Sprintf("At your current pace you'll miss the %s bonus by $%.0f. You need to spend $%.0f/day on this card from today.", b.CardName, shortfall, required)
	case "tight":
		return fmt.Sprintf("You're cutting it close on %s. Hit $%.0f/day on this card to lock in the bonus comfortably.", b.CardName, required)
	default:
		return fmt.Sprintf("On track to earn the %s bonus.", b.CardName)
	}
}

func roundCents(v float64) float64 {
	return math.Round(v*100) / 100
}
