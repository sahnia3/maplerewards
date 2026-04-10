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
// Produced by SeatsAeroService.SearchAwards().
type AwardItem struct {
	Date           string         `json:"date"`
	Issuer         string         `json:"issuer"`          // e.g. "aeroplan"
	Origin         string         `json:"origin"`
	Destination    string         `json:"destination"`
	Cabin          string         `json:"cabin"`
	MileageCost    int            `json:"mileageCost"`
	TaxesCash      float64        `json:"taxesCash"`       // in dollars
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
