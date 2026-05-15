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
