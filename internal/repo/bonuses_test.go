package repo

import (
	"context"
	"testing"
	"time"
)

// TestActivateBonus_ReturnsCardName guards P3-19: the activate response must
// carry the joined card name so the UI never falls back to a literal "Card".
// Skipped unless MAPLEREWARDS_TEST_DB is set.
func TestActivateBonus_ReturnsCardName(t *testing.T) {
	pool := chatTestDB(t)
	userID := seedTestUser(t, pool)

	b, err := NewBonusRepo(pool).ActivateBonus(context.Background(), userID, cobaltCardID)
	if err != nil {
		t.Fatalf("ActivateBonus: %v", err)
	}
	if b.CardName != "Amex Cobalt" {
		t.Errorf("CardName = %q, want Amex Cobalt", b.CardName)
	}
	if b.CardIssuer == "" {
		t.Error("CardIssuer is empty, want the joined issuer")
	}
}

// TestInclusiveDaysLeft pins bug #10: "days left" must count the deadline day
// itself and must not truncate a fractional day off a mid-day `now`.
func TestInclusiveDaysLeft(t *testing.T) {
	tests := []struct {
		name     string
		now      time.Time
		deadline time.Time
		want     int
	}{
		{
			name:     "deadline tomorrow, now is 6pm today",
			now:      time.Date(2026, 6, 10, 18, 0, 0, 0, time.UTC),
			deadline: time.Date(2026, 6, 11, 0, 0, 0, 0, time.UTC),
			want:     2,
		},
		{
			name:     "deadline today, now is 6pm today",
			now:      time.Date(2026, 6, 10, 18, 0, 0, 0, time.UTC),
			deadline: time.Date(2026, 6, 10, 0, 0, 0, 0, time.UTC),
			want:     1,
		},
		{
			name:     "deadline today, now is one second past midnight",
			now:      time.Date(2026, 6, 10, 0, 0, 1, 0, time.UTC),
			deadline: time.Date(2026, 6, 10, 0, 0, 0, 0, time.UTC),
			want:     1,
		},
		{
			name:     "deadline yesterday, floored at 0",
			now:      time.Date(2026, 6, 10, 6, 0, 0, 0, time.UTC),
			deadline: time.Date(2026, 6, 9, 0, 0, 0, 0, time.UTC),
			want:     0,
		},
		{
			name:     "deadline a week out",
			now:      time.Date(2026, 6, 3, 23, 59, 0, 0, time.UTC),
			deadline: time.Date(2026, 6, 10, 0, 0, 0, 0, time.UTC),
			want:     8,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := inclusiveDaysLeft(tt.now, tt.deadline); got != tt.want {
				t.Errorf("inclusiveDaysLeft(%s, %s) = %d, want %d",
					tt.now.Format(time.RFC3339), tt.deadline.Format("2006-01-02"), got, tt.want)
			}
		})
	}
}
