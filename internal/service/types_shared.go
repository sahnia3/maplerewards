package service

// ── Shared output types used by multiple services ────────────────────────────
// These types are produced by data source services (SerpAPI, Seats.aero) and
// consumed by orchestrators (award_search.go, trip.go).

// FlightResult represents a parsed flight option with a cash price.
// Produced by SerpAPIService.SearchFlights().
type FlightResult struct {
	Airline       string  // Primary airline name
	Price         float64 // In CAD (actual price for the requested cabin class)
	Stops         int     // 0 = nonstop
	TotalDuration int     // minutes
	FlightNumber  string  // e.g. "AC 856"
}

// AwardItem represents one normalized award flight result.
// Produced by SeatsAeroService.SearchAwards() and ApifyAwardService.
//
// TaxesCash is a pointer so the difference between "we know it's $0" (rare —
// some Avios short-hauls) and "we don't know" (Seats.aero never returns
// taxes) is explicit. TaxesIncluded flips to true only when an upstream
// source actually returned a number; otherwise the UI should show "+ taxes"
// instead of pretending the redemption is fee-free.
type AwardItem struct {
	Date           string         `json:"date"`
	Issuer         string         `json:"issuer"`          // e.g. "aeroplan"
	Origin         string         `json:"origin"`
	Destination    string         `json:"destination"`
	Cabin          string         `json:"cabin"`
	MileageCost    int            `json:"mileageCost"`
	TaxesCash      *float64       `json:"taxesCash,omitempty"`   // CAD; nil when unknown
	TaxesIncluded  bool           `json:"taxesIncluded"`         // true only if an upstream source supplied taxes
	SeatsAvailable int            `json:"seatsAvailable"`
	Segments       []AwardSegment `json:"segments"`
}

// AwardSegment is one flight leg within an award itinerary.
type AwardSegment struct {
	Origin        string `json:"origin"`
	Destination   string `json:"destination"`
	Airline       string `json:"airline"`
	FlightNumber  string `json:"flightNumber"`
	DepartureTime string `json:"departureTime"`
	ArrivalTime   string `json:"arrivalTime"`
	Aircraft      string `json:"aircraft"`
}

// ── Shared helpers ───────────────────────────────────────────────────────────

// truncateStr truncates a string to max characters (used for error logging).
func truncateStr(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}
