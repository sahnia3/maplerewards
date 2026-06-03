package service

import (
	"strings"
	"testing"
	"time"

	"maplerewards/internal/model"
)

func TestEnrichOnTrack(t *testing.T) {
	now := time.Date(2026, 5, 15, 12, 0, 0, 0, time.UTC)
	b := model.WelcomeBonus{
		CardName:     "Amex Cobalt",
		MinSpend:     3000,
		CurrentSpend: 1600, // 53% in
		ActivatedAt:  now.Add(-30 * 24 * time.Hour).Format("2006-01-02"),
		DeadlineAt:   now.Add(60 * 24 * time.Hour).Format("2006-01-02"),
		DaysLeft:     60,
		BonusPoints:  30000,
	}
	item := enrich(b, now)
	if item.Severity != "on-track" {
		t.Errorf("expected on-track, got %q (velocity=%v projected=%v)",
			item.Severity, item.DailyVelocityCAD, item.ProjectedTotalCAD)
	}
	if item.WillMiss {
		t.Error("on-track item should not be flagged as will-miss")
	}
}

func TestEnrichCriticalProjection(t *testing.T) {
	now := time.Date(2026, 5, 15, 12, 0, 0, 0, time.UTC)
	b := model.WelcomeBonus{
		CardName:     "TD Aeroplan Visa",
		MinSpend:     5000,
		CurrentSpend: 800, // only 16% after half the window
		ActivatedAt:  now.Add(-45 * 24 * time.Hour).Format("2006-01-02"),
		DeadlineAt:   now.Add(45 * 24 * time.Hour).Format("2006-01-02"),
		DaysLeft:     45,
		BonusPoints:  60000,
	}
	item := enrich(b, now)
	if item.Severity != "critical" && item.Severity != "tight" {
		t.Errorf("expected critical/tight severity, got %q", item.Severity)
	}
	if !item.WillMiss {
		t.Errorf("expected WillMiss=true given low velocity")
	}
	if item.RequiredDailyCAD <= 0 {
		t.Errorf("required daily should be positive, got %v", item.RequiredDailyCAD)
	}
	if !strings.Contains(item.Recommendation, "TD Aeroplan Visa") {
		t.Errorf("recommendation should name the card, got %q", item.Recommendation)
	}
}

func TestEnrichMissedAfterDeadline(t *testing.T) {
	now := time.Date(2026, 5, 15, 12, 0, 0, 0, time.UTC)
	b := model.WelcomeBonus{
		CardName:     "CIBC Aventura",
		MinSpend:     2000,
		CurrentSpend: 1500,
		ActivatedAt:  now.Add(-100 * 24 * time.Hour).Format("2006-01-02"),
		DeadlineAt:   now.Add(-10 * 24 * time.Hour).Format("2006-01-02"), // expired
		DaysLeft:     0,
		BonusPoints:  20000,
	}
	item := enrich(b, now)
	if item.Severity != "missed" {
		t.Errorf("expected missed, got %q", item.Severity)
	}
	if !strings.Contains(item.Recommendation, "Deadline passed") {
		t.Errorf("recommendation should announce the missed deadline, got %q", item.Recommendation)
	}
}

func TestEnrichNotMissedOnDeadlineDay(t *testing.T) {
	// Bug #8: a bonus whose deadline is *today* must NOT be flagged "missed".
	// The user still has all of the deadline day to make the qualifying purchase.
	// The boundary case (the day AFTER the deadline) must flip to "missed".
	base := model.WelcomeBonus{
		CardName:     "Amex Cobalt",
		MinSpend:     3000,
		CurrentSpend: 1000, // short of the minimum
		ActivatedAt:  "2026-05-11",
		DeadlineAt:   "2026-06-10",
		DaysLeft:     1,
		BonusPoints:  30000,
	}

	tests := []struct {
		name          string
		now           time.Time
		wantNotMissed bool // true => severity must NOT be "missed"
	}{
		{
			name:          "midday on the deadline date is not missed",
			now:           time.Date(2026, 6, 10, 12, 0, 0, 0, time.UTC),
			wantNotMissed: true,
		},
		{
			name:          "one second past midnight on the deadline date is not missed",
			now:           time.Date(2026, 6, 10, 0, 0, 1, 0, time.UTC),
			wantNotMissed: true,
		},
		{
			name:          "the day after the deadline is missed",
			now:           time.Date(2026, 6, 11, 0, 0, 1, 0, time.UTC),
			wantNotMissed: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			item := enrich(base, tt.now)
			if tt.wantNotMissed && item.Severity == "missed" {
				t.Errorf("now=%s: severity should not be \"missed\" on/before the deadline day, got %q",
					tt.now.Format(time.RFC3339), item.Severity)
			}
			if !tt.wantNotMissed && item.Severity != "missed" {
				t.Errorf("now=%s: severity should be \"missed\" after the deadline day, got %q",
					tt.now.Format(time.RFC3339), item.Severity)
			}
		})
	}
}

func TestEnrichZeroDaysElapsed(t *testing.T) {
	// Edge: bonus activated today. Velocity should be 0, no panic.
	now := time.Date(2026, 5, 15, 12, 0, 0, 0, time.UTC)
	b := model.WelcomeBonus{
		CardName:     "BMO eclipse",
		MinSpend:     4000,
		CurrentSpend: 0,
		ActivatedAt:  now.Format("2006-01-02"),
		DeadlineAt:   now.Add(90 * 24 * time.Hour).Format("2006-01-02"),
		DaysLeft:     90,
		BonusPoints:  40000,
	}
	item := enrich(b, now)
	if item.DailyVelocityCAD != 0 {
		t.Errorf("velocity should be 0 with 0 days elapsed, got %v", item.DailyVelocityCAD)
	}
	if item.RequiredDailyCAD <= 0 {
		t.Errorf("required daily should be positive at start, got %v", item.RequiredDailyCAD)
	}
}
