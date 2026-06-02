package service

import (
	"context"
	"strings"
	"testing"

	"maplerewards/internal/model"
)

type fakeTransferLookup struct{ routes []model.TransferPartner }

func (f fakeTransferLookup) GetTransferRoutesFrom(context.Context, string) ([]model.TransferPartner, error) {
	return f.routes, nil
}

type fakeProgramLookup struct{}

func (fakeProgramLookup) GetProgramBySlug(_ context.Context, slug string) (*model.LoyaltyProgram, error) {
	return &model.LoyaltyProgram{ID: "p-" + slug, Slug: slug}, nil
}

// bestInboundPartner picks the strongest program you can transfer INTO the
// award's currency: highest ratio, tie-broken by source-currency base value,
// skipping inactive routes. Nil lookups (worker path) yield no hint.
func TestBestInboundPartner(t *testing.T) {
	routes := []model.TransferPartner{
		{TransferRatio: 1.0, IsActive: true, FromProgram: &model.LoyaltyProgram{Name: "Amex MR", Slug: "amex-mr-ca", BaseCPP: 1.65}},
		{TransferRatio: 0.75, IsActive: true, FromProgram: &model.LoyaltyProgram{Name: "Capital One", Slug: "c1", BaseCPP: 1.50}},
		{TransferRatio: 1.0, IsActive: true, FromProgram: &model.LoyaltyProgram{Name: "RBC Avion", Slug: "rbc-avion", BaseCPP: 1.40}},
		{TransferRatio: 2.0, IsActive: false, FromProgram: &model.LoyaltyProgram{Name: "Inactive", Slug: "x", BaseCPP: 9}}, // best ratio but inactive → skipped
	}
	svc := &AwardSearchService{transferRepo: fakeTransferLookup{routes: routes}, programRepo: fakeProgramLookup{}}
	cache := map[string]string{}

	// Highest ACTIVE ratio is 1.0 (Amex MR vs RBC Avion tie) → tie-broken by
	// base cpp → Amex MR (1.65 > 1.40). The 2.0 route is inactive and skipped.
	if got := svc.bestInboundPartner(context.Background(), "aeroplan", cache); got != "Amex MR" {
		t.Fatalf("want Amex MR, got %q", got)
	}
	if cache["aeroplan"] != "Amex MR" {
		t.Errorf("result must be cached, got %q", cache["aeroplan"])
	}
	// Nil lookups (the worker path) must yield no hint, not panic.
	if got := (&AwardSearchService{}).bestInboundPartner(context.Background(), "aeroplan", map[string]string{}); got != "" {
		t.Errorf("nil lookups must yield empty hint, got %q", got)
	}
}

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

// netCashCAD subtracts cash taxes (CAD) from the fare before CPP pricing,
// treats a nil taxes pointer as "unknown" (subtract nothing), and clamps at 0
// when surcharges meet or exceed the fare.
func TestNetCashCAD(t *testing.T) {
	p := func(v float64) *float64 { return &v }
	cases := []struct {
		name  string
		cash  float64
		taxes *float64
		want  float64
	}{
		{"nil taxes unchanged", 800, nil, 800},
		{"subtracts taxes", 800, p(120), 680},
		{"clamps when taxes exceed fare", 100, p(150), 0},
		{"zero when taxes equal fare", 150, p(150), 0},
	}
	for _, c := range cases {
		if got := netCashCAD(c.cash, c.taxes); got != c.want {
			t.Errorf("%s: netCashCAD(%.0f) = %.2f, want %.2f", c.name, c.cash, got, c.want)
		}
	}
}

// The headline CPP prices points on cash NET of surcharges: a $1000 fare with
// $300 cash taxes on 50k points is worth ($1000-$300)/50000 = 1.4¢, not the
// pre-fix 2.0¢ that ignored the taxes the user still pays on redemption.
func TestComputeCPP_NetsAwardTaxes(t *testing.T) {
	taxes := 300.0
	got := computeCPP(netCashCAD(1000, &taxes), 50_000)
	if diff := got - 1.4; diff > 0.001 || diff < -0.001 {
		t.Fatalf("net CPP = %.4f, want 1.4", got)
	}
	if old := computeCPP(1000, 50_000); old <= got {
		t.Fatalf("taxes-ignored CPP (%.2f) should exceed the netted CPP (%.2f)", old, got)
	}
}
