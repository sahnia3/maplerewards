package service

import (
	"testing"
)

// The Apify flight-award-scraper actor's output schema drifts without notice
// (totalDuration and segments[].duration have flipped JSON string ↔ number in
// production, twice). parseApifyResults is the single seam every Apify award
// response flows through, and its contract is: NO input may panic; a malformed
// or drifted body yields an empty/partial []AwardItem, never a panic and never
// a hard error.
//
// These tests feed it a battery of adversarial bodies and assert that contract.
// They run under `go test -race`. If any case panicked, the recover() inside
// parseApifyResults is the LAST line of defense — but every case here is
// designed to pass WITHOUT relying on it (the defensive accessors handle the
// shape), so a panic surfacing in the logs during this test means the by-hand
// parsing regressed.

// TestParseApifyResults_NoPanicBattery throws structurally hostile inputs at
// the parser. For each, the only assertion is "did not panic + returned a sane
// (possibly empty) slice and a nil error". A panic would propagate out of the
// call and fail the test (and the -race run) outright.
func TestParseApifyResults_NoPanicBattery(t *testing.T) {
	cases := []struct {
		name string
		body string
	}{
		// ── Degenerate top-level shapes ─────────────────────────────────────
		{"empty body", ""},
		{"whitespace only", "   \n\t  "},
		{"literal null", `null`},
		{"empty object", `{}`},
		{"empty array", `[]`},
		{"literal true", `true`},
		{"bare number", `42`},
		{"bare string", `"hello"`},
		{"array of nulls", `[null, null]`},
		{"array of scalars", `[1, "two", false, 3.14]`},
		{"array of arrays (object expected)", `[[], [1,2,3]]`},
		{"object where array expected at top", `{"foo":"bar"}`},

		// ── Truncated / invalid JSON ────────────────────────────────────────
		{"truncated array", `[{"date":"2026-06-25",`},
		{"truncated object", `{"date":`},
		{"unterminated string", `[{"date":"2026`},
		{"garbage", `}{not json at all`},
		{"just opening brace", `{`},
		{"just opening bracket", `[`},

		// ── Envelope shapes (drift could wrap items) ────────────────────────
		{"items envelope empty", `{"items":[]}`},
		{"items envelope with nulls", `{"items":[null,1,"x"]}`},
		{"data envelope empty", `{"data":[]}`},
		{"data envelope wrong type", `{"data":"not an array"}`},

		// ── Item objects with missing fields ────────────────────────────────
		{"item missing everything", `[{}]`},
		{"item only date", `[{"date":"2026-06-25"}]`},
		{"item null cabins", `[{"date":"2026-06-25","cabins":null,"itineraries":null}]`},
		{"item cabins is object not array", `[{"cabins":{"name":"business"}}]`},
		{"item itineraries is string", `[{"itineraries":"oops"}]`},
		{"item itineraries is number", `[{"itineraries":12345}]`},

		// ── Wrong-typed scalar fields (the drift that bit us) ───────────────
		{"date is number", `[{"date":20260625,"cabins":[{"name":"business","available":true,"mileage":60000}]}]`},
		{"issuer is array", `[{"issuer":["aeroplan"],"cabins":[{"name":"business","available":true,"mileage":60000}]}]`},
		{"mileage is string-number", `[{"cabins":[{"name":"business","available":true,"mileage":"60000"}]}]`},
		{"mileage is null", `[{"cabins":[{"name":"business","available":true,"mileage":null}]}]`},
		{"mileage is object", `[{"cabins":[{"name":"business","available":true,"mileage":{"x":1}}]}]`},
		{"mileage is bool", `[{"cabins":[{"name":"business","available":true,"mileage":true}]}]`},
		{"available is string", `[{"cabins":[{"name":"business","available":"true","mileage":60000}]}]`},
		{"available is number", `[{"cabins":[{"name":"business","available":1,"mileage":60000}]}]`},
		{"taxes is string", `[{"cabins":[{"name":"business","available":true,"mileage":60000,"taxes":"4500"}]}]`},
		{"name is null", `[{"cabins":[{"name":null,"available":true,"mileage":60000}]}]`},
		{"name is number", `[{"cabins":[{"name":99,"available":true,"mileage":60000}]}]`},

		// ── Itinerary / cabin / segment shape drift ─────────────────────────
		{"itinerary cabins is null", `[{"itineraries":[{"cabins":null}]}]`},
		{"itinerary cabins is scalar array", `[{"itineraries":[{"cabins":[1,2,3]}]}]`},
		{"itinerary is null in array", `[{"itineraries":[null]}]`},
		{"itinerary is scalar in array", `[{"itineraries":["x", 5]}]`},
		{"mileageCost wrong type", `[{"itineraries":[{"cabins":[{"name":"business","mileageCost":"60000","totalTaxes":"4500","remainingSeats":"4"}]}]}]`},
		{"segments is null", `[{"itineraries":[{"cabins":[{"name":"business","mileageCost":60000}],"segments":null}]}]`},
		{"segments is object", `[{"itineraries":[{"cabins":[{"name":"business","mileageCost":60000}],"segments":{"flightNumber":"AC1"}}]}]`},
		{"segment is scalar", `[{"itineraries":[{"cabins":[{"name":"business","mileageCost":60000}],"segments":[1,"x",null]}]}]`},
		{"totalDuration as number (drift)", `[{"itineraries":[{"totalDuration":450,"cabins":[{"name":"business","mileageCost":60000}]}]}]`},
		{"totalDuration as string (drift)", `[{"itineraries":[{"totalDuration":"PT7H30M","cabins":[{"name":"business","mileageCost":60000}]}]}]`},
		{"segment duration number (drift)", `[{"itineraries":[{"cabins":[{"name":"business","mileageCost":60000}],"segments":[{"duration":90,"flightNumber":"AC1"}]}]}]`},

		// ── Extra unknown fields must be ignored, not choke ─────────────────
		{"extra unknown top-level fields", `[{"date":"2026-06-25","issuer":"aeroplan","weirdNewField":{"nested":[1,2,3]},"anotherOne":42,"cabins":[{"name":"business","available":true,"mileage":60000,"surpriseField":"x"}]}]`},
		{"deeply nested unknown", `[{"cabins":[{"name":"business","available":true,"mileage":60000,"meta":{"a":{"b":{"c":[null,{}]}}}}]}]`},

		// ── Numeric edge cases that could blow up int conversion ────────────
		{"mileage NaN-ish string", `[{"cabins":[{"name":"business","available":true,"mileage":"NaN"}]}]`},
		{"mileage huge number", `[{"cabins":[{"name":"business","available":true,"mileage":1e308}]}]`},
		{"mileage negative", `[{"cabins":[{"name":"business","available":true,"mileage":-5}]}]`},
		{"mileage zero (skip)", `[{"cabins":[{"name":"business","available":true,"mileage":0}]}]`},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// A panic inside parseApifyResults is recovered internally, but if a
			// regression made one ESCAPE the function, it would unwind through
			// here. Convert that to a test failure with a clear message rather
			// than a raw stack so the failing case name is obvious.
			defer func() {
				if rec := recover(); rec != nil {
					t.Fatalf("parseApifyResults PANICKED on %q: %v", tc.name, rec)
				}
			}()

			items, err := parseApifyResults([]byte(tc.body), "business")
			if err != nil {
				t.Fatalf("parseApifyResults returned a hard error on %q: %v (contract: never errors)", tc.name, err)
			}
			// Output must be a usable slice — every element well-formed. We do
			// NOT require it to be empty (some hostile-but-parseable inputs DO
			// yield a valid item, e.g. the duration-drift cases); we require it
			// to be SANE: positive mileage, no panic touching the fields.
			for i, it := range items {
				if it.MileageCost <= 0 {
					t.Errorf("%q: item %d has non-positive MileageCost %d (must be filtered out)", tc.name, i, it.MileageCost)
				}
				if it.Cabin != "business" {
					t.Errorf("%q: item %d cabin = %q, want the requested target %q", tc.name, i, it.Cabin, "business")
				}
				// Touch every field + nested slice to prove none is a landmine.
				_ = it.Date + it.Issuer + it.Origin + it.Destination
				if it.TaxesCash != nil {
					_ = *it.TaxesCash
				}
				for _, seg := range it.Segments {
					_ = seg.Origin + seg.Destination + seg.FlightNumber + seg.Aircraft + seg.DepartureTime + seg.ArrivalTime
				}
			}
		})
	}
}

// TestParseApifyResults_ValidBaseline asserts the happy path still extracts the
// right values from a well-formed body — both the itinerary-level cabin path
// (preferred: mileage + taxes + seats + segments) and the route-level cabin
// summary fallback. This guards against the defensive rewrite silently
// dropping data ("parses but returns zero" was the exact production failure the
// smoke-checker was built to catch).
func TestParseApifyResults_ValidBaseline(t *testing.T) {
	// Two results:
	//  1. aeroplan — full itinerary-level cabin (business) + two segments.
	//     totalTaxes 4500 cents → $45.00. remainingSeats 4.
	//  2. united — NO itinerary cabin match; falls back to the route-level
	//     "cabins" summary (business, available, mileage 70000, taxes 2500c).
	body := `[
	  {
	    "date": "2026-06-25",
	    "issuer": "aeroplan",
	    "origin": "YYZ",
	    "destination": "LHR",
	    "cabins": [
	      {"name": "economy", "available": true, "mileage": 25000, "taxes": 3000}
	    ],
	    "itineraries": [
	      {
	        "origin": "YYZ",
	        "destination": "LHR",
	        "totalDuration": "PT7H30M",
	        "cabins": [
	          {"name": "business", "mileageCost": 60000, "totalTaxes": 4500, "remainingSeats": 4}
	        ],
	        "segments": [
	          {"flightNumber": "AC856", "origin": "YYZ", "destination": "LHR", "departure": "2026-06-25T21:00", "arrival": "2026-06-26T09:00", "aircraftName": "Boeing 787", "duration": 450},
	          {"flightNumber": "AC857", "origin": "LHR", "destination": "MAN", "departure": "2026-06-26T11:00", "arrival": "2026-06-26T12:00", "aircraftName": "Airbus A320", "duration": 60}
	        ]
	      }
	    ]
	  },
	  {
	    "date": "2026-06-26",
	    "issuer": "united",
	    "origin": "YYZ",
	    "destination": "LHR",
	    "cabins": [
	      {"name": "business", "available": true, "mileage": 70000, "taxes": 2500}
	    ],
	    "itineraries": []
	  }
	]`

	items, err := parseApifyResults([]byte(body), "business")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("got %d items, want 2: %+v", len(items), items)
	}

	// ── Item 1: itinerary-level business cabin ──────────────────────────────
	a := items[0]
	if a.Issuer != "aeroplan" {
		t.Errorf("item0 Issuer = %q, want aeroplan", a.Issuer)
	}
	if a.Date != "2026-06-25" {
		t.Errorf("item0 Date = %q, want 2026-06-25", a.Date)
	}
	if a.Origin != "YYZ" || a.Destination != "LHR" {
		t.Errorf("item0 route = %s→%s, want YYZ→LHR", a.Origin, a.Destination)
	}
	if a.Cabin != "business" {
		t.Errorf("item0 Cabin = %q, want business", a.Cabin)
	}
	// Itinerary cabin (60000) must win over the route-level economy summary.
	if a.MileageCost != 60000 {
		t.Errorf("item0 MileageCost = %d, want 60000 (itinerary cabin must win)", a.MileageCost)
	}
	if a.SeatsAvailable != 4 {
		t.Errorf("item0 SeatsAvailable = %d, want 4", a.SeatsAvailable)
	}
	if a.TaxesCash == nil {
		t.Fatalf("item0 TaxesCash is nil, want a value")
	}
	if *a.TaxesCash != 45.0 { // 4500 cents → $45.00
		t.Errorf("item0 TaxesCash = %v, want 45.0 (4500 cents)", *a.TaxesCash)
	}
	if !a.TaxesIncluded {
		t.Errorf("item0 TaxesIncluded = false, want true")
	}
	if len(a.Segments) != 2 {
		t.Fatalf("item0 got %d segments, want 2", len(a.Segments))
	}
	if a.Segments[0].FlightNumber != "AC856" || a.Segments[0].Origin != "YYZ" || a.Segments[0].Aircraft != "Boeing 787" {
		t.Errorf("item0 segment0 mismatch: %+v", a.Segments[0])
	}
	if a.Segments[1].Destination != "MAN" {
		t.Errorf("item0 segment1 Destination = %q, want MAN", a.Segments[1].Destination)
	}

	// ── Item 2: route-level cabin fallback ──────────────────────────────────
	u := items[1]
	if u.Issuer != "united" {
		t.Errorf("item1 Issuer = %q, want united", u.Issuer)
	}
	if u.MileageCost != 70000 {
		t.Errorf("item1 MileageCost = %d, want 70000 (route-level fallback)", u.MileageCost)
	}
	if u.SeatsAvailable != 0 {
		t.Errorf("item1 SeatsAvailable = %d, want 0 (route summary has no seats)", u.SeatsAvailable)
	}
	if u.TaxesCash == nil || *u.TaxesCash != 25.0 { // 2500 cents → $25.00
		t.Errorf("item1 TaxesCash = %v, want 25.0", u.TaxesCash)
	}
	if len(u.Segments) != 0 {
		t.Errorf("item1 got %d segments, want 0 (empty itineraries)", len(u.Segments))
	}
}

// TestParseApifyResults_CabinFiltering verifies that only the requested cabin
// is returned and that an unavailable route-level cabin is rejected.
func TestParseApifyResults_CabinFiltering(t *testing.T) {
	// Route-level economy is available; business is present but NOT available.
	body := `[
	  {
	    "issuer": "delta",
	    "cabins": [
	      {"name": "economy",  "available": true,  "mileage": 30000, "taxes": 1000},
	      {"name": "business", "available": false, "mileage": 90000, "taxes": 5000}
	    ]
	  }
	]`

	// Asking for business → the only business cabin is unavailable → no item.
	bizItems, err := parseApifyResults([]byte(body), "business")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(bizItems) != 0 {
		t.Errorf("business: got %d items, want 0 (business cabin is unavailable): %+v", len(bizItems), bizItems)
	}

	// Asking for economy → one available economy item, case-insensitive match.
	ecoItems, err := parseApifyResults([]byte(body), "ECONOMY")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(ecoItems) != 1 {
		t.Fatalf("economy: got %d items, want 1", len(ecoItems))
	}
	if ecoItems[0].MileageCost != 30000 {
		t.Errorf("economy MileageCost = %d, want 30000", ecoItems[0].MileageCost)
	}
	if ecoItems[0].Cabin != "ECONOMY" {
		t.Errorf("economy Cabin = %q, want the requested target ECONOMY", ecoItems[0].Cabin)
	}
}

// TestParseApifyResults_DriftStringNumbers proves the specific production drift
// — numeric fields arriving as JSON strings — is tolerated and still yields a
// correct item, not a dropped one. This is the exact failure mode that bit
// twice and is the reason the parser walks generic JSON instead of decoding
// into typed structs.
func TestParseApifyResults_DriftStringNumbers(t *testing.T) {
	body := `[
	  {
	    "issuer": "flyingblue",
	    "date": "2026-07-01",
	    "itineraries": [
	      {
	        "cabins": [
	          {"name": "business", "mileageCost": "55000", "totalTaxes": "3300", "remainingSeats": "2"}
	        ]
	      }
	    ]
	  }
	]`

	items, err := parseApifyResults([]byte(body), "business")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("got %d items, want 1 (string-encoded numbers must be tolerated)", len(items))
	}
	if items[0].MileageCost != 55000 {
		t.Errorf("MileageCost = %d, want 55000 (parsed from string)", items[0].MileageCost)
	}
	if items[0].SeatsAvailable != 2 {
		t.Errorf("SeatsAvailable = %d, want 2 (parsed from string)", items[0].SeatsAvailable)
	}
	if items[0].TaxesCash == nil || *items[0].TaxesCash != 33.0 { // 3300 cents → $33.00
		t.Errorf("TaxesCash = %v, want 33.0 (parsed from string cents)", items[0].TaxesCash)
	}
}

// TestParseApifyResults_EnvelopeAndSingleObject verifies the two non-array
// top-level shapes the parser accepts: an {"items":[...]} envelope and a single
// bare item object (drift could collapse a 1-result array into a lone object).
func TestParseApifyResults_EnvelopeAndSingleObject(t *testing.T) {
	itemJSON := `{"issuer":"aeroplan","cabins":[{"name":"business","available":true,"mileage":60000,"taxes":4500}]}`

	t.Run("items envelope", func(t *testing.T) {
		items, err := parseApifyResults([]byte(`{"items":[`+itemJSON+`]}`), "business")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(items) != 1 || items[0].MileageCost != 60000 {
			t.Fatalf("envelope parse failed: %+v", items)
		}
	})

	t.Run("single bare object", func(t *testing.T) {
		items, err := parseApifyResults([]byte(itemJSON), "business")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(items) != 1 || items[0].MileageCost != 60000 {
			t.Fatalf("single-object parse failed: %+v", items)
		}
	})
}
