package service

import (
	"strings"
	"testing"
)

// googleFlightsDated must always carry the exact route AND the searched date
// so a program with no real award deep link still lands the user on "all
// flights that day" rather than a bare airline homepage.
func TestGoogleFlightsDated_CarriesRouteAndDate(t *testing.T) {
	got := googleFlightsDated("YYZ", "CDG", "2026-06-25")
	for _, want := range []string{"google.com/travel/flights", "YYZ", "CDG", "2026-06-25"} {
		if !strings.Contains(got, want) {
			t.Fatalf("googleFlightsDated missing %q: %s", want, got)
		}
	}
	// No date → still route-scoped, no dangling "on".
	g2 := googleFlightsDated("YYZ", "CDG", "")
	if !strings.Contains(g2, "YYZ") || !strings.Contains(g2, "CDG") {
		t.Fatalf("dateless variant lost the route: %s", g2)
	}
	if strings.Contains(g2, "%20on%20") {
		t.Fatalf("dateless variant left a dangling 'on': %s", g2)
	}
}

// awardBookingURL: programs WITHOUT a usable dated award deep link must fall
// through to a dated Google Flights view (the user-reported defect: Air France
// / Virgin / Lufthansa links went to useless or US homepages with no date).
// Programs WITH a real dated deep link must keep it and include the date.
func TestAwardBookingURL_DeepLinkVsDatedFallback(t *testing.T) {
	const date = "2026-06-25"

	weak := []string{"flyingblue", "virginatlantic", "lufthansa", "singapore", "emirates", "turkish", "qatar", "etihad", "unknown-prog"}
	for _, prog := range weak {
		got := awardBookingURL(prog, "YYZ", "CDG", date, "business", 1)
		if !strings.Contains(got, "google.com/travel/flights") {
			t.Errorf("%s: expected dated Google Flights fallback, got %s", prog, got)
		}
		if !strings.Contains(got, date) {
			t.Errorf("%s: fallback dropped the date: %s", prog, got)
		}
		if strings.Contains(got, "airfrance.us") || strings.Contains(got, "#book-with-miles") {
			t.Errorf("%s: still points at the old dead/US homepage: %s", prog, got)
		}
	}

	// Strong programs keep their real award deep link AND embed the date.
	strong := map[string]string{
		"aeroplan": "aircanada.com",
		"united":   "united.com",
		"avios":    "britishairways.com",
		"delta":    "delta.com",
		"american": "aa.com",
	}
	for prog, host := range strong {
		got := awardBookingURL(prog, "YYZ", "CDG", date, "business", 1)
		if !strings.Contains(got, host) {
			t.Errorf("%s: lost its real deep link (want host %s), got %s", prog, host, got)
		}
		if !strings.Contains(got, date) && !strings.Contains(got, "25/06/26") {
			t.Errorf("%s: deep link missing the searched date: %s", prog, got)
		}
		if strings.Contains(got, "google.com/travel/flights") {
			t.Errorf("%s: regressed to generic fallback instead of its deep link: %s", prog, got)
		}
	}
}
