package main

import (
	"testing"
	"time"
)

func TestShouldEmailForAlert(t *testing.T) {
	now := time.Date(2026, 5, 15, 12, 0, 0, 0, time.UTC)

	cases := []struct {
		name string
		prev *string
		want bool
	}{
		{
			name: "never alerted before",
			prev: nil,
			want: true,
		},
		{
			name: "alerted 25h ago — past cooldown",
			prev: ptr(now.Add(-25 * time.Hour).Format(time.RFC3339)),
			want: true,
		},
		{
			name: "alerted exactly 24h ago — boundary, should email",
			prev: ptr(now.Add(-24 * time.Hour).Format(time.RFC3339)),
			want: true,
		},
		{
			name: "alerted 23h ago — still in cooldown",
			prev: ptr(now.Add(-23 * time.Hour).Format(time.RFC3339)),
			want: false,
		},
		{
			name: "alerted 5 minutes ago — definitely cooldown",
			prev: ptr(now.Add(-5 * time.Minute).Format(time.RFC3339)),
			want: false,
		},
		{
			name: "unparseable timestamp — fail safe, send",
			prev: ptr("not a timestamp"),
			want: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := shouldEmailForAlert(tc.prev, now)
			if got != tc.want {
				t.Errorf("shouldEmailForAlert(%v, %v): got %v, want %v", tc.prev, now, got, tc.want)
			}
		})
	}
}

func ptr(s string) *string { return &s }
