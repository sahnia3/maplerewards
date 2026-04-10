package handler

import "testing"

func TestIsValidSpendAmount(t *testing.T) {
	tests := []struct {
		amount float64
		valid  bool
	}{
		{0, false},
		{-1, false},
		{0.009, false},
		{0.01, true},
		{1, true},
		{100, true},
		{999999.99, true},
		{1_000_000, true},
		{1_000_001, false},
	}
	for _, tc := range tests {
		if got := isValidSpendAmount(tc.amount); got != tc.valid {
			t.Errorf("isValidSpendAmount(%v) = %v, want %v", tc.amount, got, tc.valid)
		}
	}
}

func TestIsValidUUID(t *testing.T) {
	tests := []struct {
		id    string
		valid bool
	}{
		{"550e8400-e29b-41d4-a716-446655440000", true},
		{"00000000-0000-0000-0000-000000000000", true},
		{"550e8400e29b41d4a716446655440000", false}, // no dashes
		{"not-a-uuid", false},
		{"", false},
		{"550e8400-e29b-41d4-a716-44665544000g", false}, // invalid char 'g'
	}
	for _, tc := range tests {
		if got := isValidUUID(tc.id); got != tc.valid {
			t.Errorf("isValidUUID(%q) = %v, want %v", tc.id, got, tc.valid)
		}
	}
}

func TestIsValidSessionID(t *testing.T) {
	tests := []struct {
		id    string
		valid bool
	}{
		{"abcdef0123456789abcdef0123456789", true},
		{"00000000000000000000000000000000", true},
		{"ABCDEF0123456789abcdef0123456789", false}, // uppercase
		{"abcdef0123456789", false},                  // too short
		{"abcdef0123456789abcdef01234567890", false}, // too long
		{"", false},
		{"zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz", false}, // invalid chars
	}
	for _, tc := range tests {
		if got := isValidSessionID(tc.id); got != tc.valid {
			t.Errorf("isValidSessionID(%q) = %v, want %v", tc.id, got, tc.valid)
		}
	}
}

func TestIsValidSlug(t *testing.T) {
	tests := []struct {
		slug  string
		valid bool
	}{
		{"groceries", true},
		{"dining-out", true},
		{"everything-else", true},
		{"gas-station-fuel", true},
		{"a", true},
		{"1category", true},
		{"-starts-with-dash", false},
		{"HAS-UPPERCASE", false},
		{"has spaces", false},
		{"has_underscore", false},
		{"drop table;--", false},
		{"", false},
		{"a-very-long-slug-that-exceeds-sixty-characters-which-should-not-pass-validation", false},
	}
	for _, tc := range tests {
		if got := isValidSlug(tc.slug); got != tc.valid {
			t.Errorf("isValidSlug(%q) = %v, want %v", tc.slug, got, tc.valid)
		}
	}
}
