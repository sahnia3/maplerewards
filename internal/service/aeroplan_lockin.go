package service

import (
	"strings"
	"time"
)

// AeroplanRouting is one pre-/post-hike data row for the public June-1
// lock-in calculator. Numbers come from the Aeroplan award chart published
// 2026-04 (the long-haul-biz devaluation effective 2026-06-01).
//
// Source data is intentionally hardcoded — not pulled from `devaluation_events`
// — because the calculator is a public marketing surface and we want the
// numbers to be stable + reviewable in a code diff, not subject to DB
// re-seeding.
type AeroplanRouting struct {
	Region          string  `json:"region"`            // "europe" | "asia-pacific" | "south-america" | "middle-east-india-africa" | "north-america"
	Origin          string  `json:"origin"`            // "YYZ" | "YVR" | "YUL" | "any" — calculator key
	OriginLabel     string  `json:"origin_label"`      // human-friendly e.g. "Toronto"
	DestinationLabel string `json:"destination_label"` // human-friendly e.g. "London, Paris, Amsterdam"
	Cabin           string  `json:"cabin"`             // "economy" | "business" | "first"
	PointsBefore    int     `json:"points_before"`     // pre-June-1 cost
	PointsAfter     int     `json:"points_after"`      // post-June-1 cost
	PointsSaved     int     `json:"points_saved"`      // PointsAfter - PointsBefore (positive = savings if booked now)
	SavingsCAD      float64 `json:"savings_cad"`       // PointsSaved × CPP / 100 (CPP=2.0)
	Notes           string  `json:"notes,omitempty"`
}

// aeroplanJune2026Chart is the published-data table backing the lock-in
// calculator. Order is the display order for "any origin" queries — the
// frontend filters and re-sorts when an origin is specified.
//
// Pricing source: Air Canada Aeroplan published award chart, May 2026.
// All "Business" tickets are one-way per Aeroplan's usual chart convention.
// CPP is held at 2.0¢ matching the catalog refresh in migration 38.
var aeroplanJune2026Chart = []AeroplanRouting{
	// ── Long-haul business: where the hike actually applies ──────────────
	{Region: "europe", Origin: "YYZ", OriginLabel: "Toronto", DestinationLabel: "London / Paris / Amsterdam (LHR, CDG, AMS)", Cabin: "business", PointsBefore: 70_000, PointsAfter: 82_500, PointsSaved: 12_500, SavingsCAD: 250.00, Notes: "Star Alliance partners (Lufthansa, SWISS, Brussels) often have flat-bed availability"},
	{Region: "europe", Origin: "YVR", OriginLabel: "Vancouver", DestinationLabel: "London / Frankfurt / Paris", Cabin: "business", PointsBefore: 70_000, PointsAfter: 82_500, PointsSaved: 12_500, SavingsCAD: 250.00},
	{Region: "europe", Origin: "YUL", OriginLabel: "Montréal", DestinationLabel: "Paris / Frankfurt / Zurich", Cabin: "business", PointsBefore: 70_000, PointsAfter: 82_500, PointsSaved: 12_500, SavingsCAD: 250.00},

	{Region: "asia-pacific", Origin: "YYZ", OriginLabel: "Toronto", DestinationLabel: "Tokyo / Seoul / Hong Kong", Cabin: "business", PointsBefore: 87_500, PointsAfter: 102_500, PointsSaved: 15_000, SavingsCAD: 300.00, Notes: "ANA (Tokyo) is the sweetest spot; book 355 days out for J availability"},
	{Region: "asia-pacific", Origin: "YVR", OriginLabel: "Vancouver", DestinationLabel: "Tokyo / Seoul / Hong Kong", Cabin: "business", PointsBefore: 75_000, PointsAfter: 87_750, PointsSaved: 12_750, SavingsCAD: 255.00, Notes: "YVR is the closest CA gateway — 12.75K saved is the cheapest Pacific lock-in"},

	{Region: "middle-east-india-africa", Origin: "YYZ", OriginLabel: "Toronto", DestinationLabel: "Mumbai / Dubai / Cape Town", Cabin: "business", PointsBefore: 85_000, PointsAfter: 99_500, PointsSaved: 14_500, SavingsCAD: 290.00, Notes: "Air India ex-DEL/BOM Star route reopened 2025; Lufthansa via FRA is the reliable path"},
	{Region: "middle-east-india-africa", Origin: "YVR", OriginLabel: "Vancouver", DestinationLabel: "Dubai / Mumbai", Cabin: "business", PointsBefore: 87_500, PointsAfter: 102_500, PointsSaved: 15_000, SavingsCAD: 300.00},

	{Region: "south-america", Origin: "YYZ", OriginLabel: "Toronto", DestinationLabel: "Buenos Aires / São Paulo / Lima", Cabin: "business", PointsBefore: 55_000, PointsAfter: 64_500, PointsSaved: 9_500, SavingsCAD: 190.00, Notes: "Copa via Panama City is the bread-and-butter route"},

	// ── Long-haul economy: smaller hike but still real ────────────────────
	{Region: "europe", Origin: "any", OriginLabel: "Anywhere in Canada", DestinationLabel: "Europe (any)", Cabin: "economy", PointsBefore: 35_000, PointsAfter: 41_000, PointsSaved: 6_000, SavingsCAD: 120.00, Notes: "Economy hike is gentler but still ~17% more points"},
	{Region: "asia-pacific", Origin: "any", OriginLabel: "Anywhere in Canada", DestinationLabel: "Asia-Pacific (any)", Cabin: "economy", PointsBefore: 47_500, PointsAfter: 55_750, PointsSaved: 8_250, SavingsCAD: 165.00},

	// ── North America short-haul ──────────────────────────────────────────
	// Largely unchanged but include for completeness so the calculator doesn't
	// look broken when a user picks "North America" + economy.
	{Region: "north-america", Origin: "any", OriginLabel: "Anywhere in Canada", DestinationLabel: "Continental North America", Cabin: "economy", PointsBefore: 10_000, PointsAfter: 10_000, PointsSaved: 0, SavingsCAD: 0, Notes: "Short-haul economy unchanged — no urgency to lock in"},
	{Region: "north-america", Origin: "any", OriginLabel: "Anywhere in Canada", DestinationLabel: "Continental North America", Cabin: "business", PointsBefore: 25_000, PointsAfter: 25_000, PointsSaved: 0, SavingsCAD: 0, Notes: "Short-haul biz unchanged"},
}

// LockInQuery is the filter input from the frontend. All fields optional;
// empty strings act as wildcards. A typical call: airport=YYZ, region=europe,
// cabin=business.
type LockInQuery struct {
	Airport string
	Region  string
	Cabin   string
}

// LockInResult is the response shape. Top is the best 3 matching routings;
// AllMatched is the broader filtered set so the frontend can render a "more
// routings" table below the highlights.
type LockInResult struct {
	GeneratedAt string            `json:"generated_at"`
	HikeDate    string            `json:"hike_date"`
	DaysUntil   int               `json:"days_until"`
	Top         []AeroplanRouting `json:"top"`
	AllMatched  []AeroplanRouting `json:"all_matched"`
	Filters     map[string]string `json:"filters"`
}

// QueryAeroplanLockIn filters the static chart by the supplied query and
// returns the result envelope. Pure function — no DB, no network. Safe to
// call from any handler.
func QueryAeroplanLockIn(q LockInQuery) *LockInResult {
	airport := strings.ToUpper(strings.TrimSpace(q.Airport))
	region := strings.ToLower(strings.TrimSpace(q.Region))
	cabin := strings.ToLower(strings.TrimSpace(q.Cabin))

	matched := []AeroplanRouting{}
	for _, r := range aeroplanJune2026Chart {
		if region != "" && r.Region != region {
			continue
		}
		if cabin != "" && r.Cabin != cabin {
			continue
		}
		if airport != "" && r.Origin != "any" && r.Origin != airport {
			continue
		}
		matched = append(matched, r)
	}

	// Top 3 by absolute CAD savings descending. Stable order ensures the
	// "most urgent" routings surface first.
	top := append([]AeroplanRouting{}, matched...)
	sortRoutingsBySavings(top)
	if len(top) > 3 {
		top = top[:3]
	}

	return &LockInResult{
		HikeDate:   aeroplanJune2026Date,
		DaysUntil:  daysUntilAeroplanHike(),
		Top:        top,
		AllMatched: matched,
		Filters: map[string]string{
			"airport": airport,
			"region":  region,
			"cabin":   cabin,
		},
	}
}

func sortRoutingsBySavings(rows []AeroplanRouting) {
	for i := 1; i < len(rows); i++ {
		for j := i; j > 0 && rows[j].SavingsCAD > rows[j-1].SavingsCAD; j-- {
			rows[j], rows[j-1] = rows[j-1], rows[j]
		}
	}
}

func daysUntilAeroplanHike() int {
	d, err := time.Parse("2006-01-02", aeroplanJune2026Date)
	if err != nil {
		return 0
	}
	return int(time.Until(d).Hours() / 24)
}
