package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// SerpAPIService calls the SerpAPI Google Flights engine for real cash flight prices.
// Free tier: 250 searches/month.
type SerpAPIService struct {
	apiKey string
	client *http.Client
}

// NewSerpAPIService creates the SerpAPI service.
func NewSerpAPIService(apiKey string) *SerpAPIService {
	return &SerpAPIService{
		apiKey: apiKey,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// IsAvailable returns true if the SerpAPI key is configured.
func (s *SerpAPIService) IsAvailable() bool {
	return s.apiKey != ""
}

// ── SerpAPI Google Flights response types ──────────────────────────────────

type serpFlightsResponse struct {
	BestFlights  []serpFlightGroup `json:"best_flights"`
	OtherFlights []serpFlightGroup `json:"other_flights"`
	Error        string           `json:"error"`
}

type serpFlightGroup struct {
	Flights       []serpFlight `json:"flights"`
	TotalDuration int         `json:"total_duration"` // minutes
	Price         int         `json:"price"`          // integer CAD
	Type          string      `json:"type"`           // "One way"
}

type serpFlight struct {
	Airline          string     `json:"airline"`
	AirlineLogo      string     `json:"airline_logo"`
	FlightNumber     string     `json:"flight_number"`
	DepartureAirport serpAirport `json:"departure_airport"`
	ArrivalAirport   serpAirport `json:"arrival_airport"`
	Duration         int        `json:"duration"` // minutes
	Airplane         string     `json:"airplane"`
	TravelClass      string     `json:"travel_class"`
}

type serpAirport struct {
	Name string `json:"name"`
	ID   string `json:"id"`
	Time string `json:"time"`
}

// ── SearchFlights ────────────────────────────────────────────────────────────

// SearchFlights calls SerpAPI Google Flights and returns results as []FlightResult.
// Same interface as the former AmadeusService for drop-in replacement.
func (s *SerpAPIService) SearchFlights(
	ctx context.Context,
	origin, dest, date, cabin string,
	passengers int,
) ([]FlightResult, error) {
	if !s.IsAvailable() {
		return nil, fmt.Errorf("SERPAPI_KEY not configured")
	}

	start := time.Now()
	slog.Info("[serpapi] searching flights",
		"origin", origin, "dest", dest,
		"date", date, "cabin", cabin,
		"passengers", passengers,
	)

	// Build query
	params := url.Values{
		"engine":       {"google_flights"},
		"departure_id": {strings.ToUpper(origin)},
		"arrival_id":   {strings.ToUpper(dest)},
		"outbound_date": {date},
		"type":         {"2"}, // one-way
		"travel_class": {serpCabinClass(cabin)},
		"currency":     {"CAD"},
		"hl":           {"en"},
		"gl":           {"ca"},
		"api_key":      {s.apiKey},
	}
	if passengers > 1 {
		params.Set("adults", fmt.Sprintf("%d", passengers))
	}

	searchURL := "https://serpapi.com/search.json?" + params.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, searchURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("serpapi call: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		slog.Error("[serpapi] API error",
			"status", resp.StatusCode,
			"body", truncateStr(string(body), 500),
		)
		return nil, fmt.Errorf("serpapi HTTP %d: %s", resp.StatusCode, truncateStr(string(body), 300))
	}

	var flightsResp serpFlightsResponse
	if err := json.Unmarshal(body, &flightsResp); err != nil {
		return nil, fmt.Errorf("decode serpapi response: %w", err)
	}

	if flightsResp.Error != "" {
		return nil, fmt.Errorf("serpapi error: %s", flightsResp.Error)
	}

	// Combine best_flights and other_flights
	allGroups := append(flightsResp.BestFlights, flightsResp.OtherFlights...)

	slog.Info("[serpapi] response received",
		"bestFlights", len(flightsResp.BestFlights),
		"otherFlights", len(flightsResp.OtherFlights),
		"elapsed", time.Since(start),
	)

	// Convert to []FlightResult, deduplicate by airline
	seen := map[string]bool{}
	var results []FlightResult

	for _, group := range allGroups {
		if group.Price <= 0 || len(group.Flights) == 0 {
			continue
		}

		firstFlight := group.Flights[0]
		airline := firstFlight.Airline
		if airline == "" {
			continue
		}

		// Deduplicate: one result per airline (cheapest first since SerpAPI sorts by price)
		airlineKey := strings.ToLower(airline)
		if seen[airlineKey] {
			continue
		}
		seen[airlineKey] = true

		stops := len(group.Flights) - 1
		if stops < 0 {
			stops = 0
		}

		results = append(results, FlightResult{
			Airline:       airline,
			Price:         float64(group.Price),
			Stops:         stops,
			TotalDuration: group.TotalDuration,
			FlightNumber:  firstFlight.FlightNumber,
		})
	}

	slog.Info("[serpapi] parsed results",
		"count", len(results), "totalElapsed", time.Since(start),
	)

	return results, nil
}

// serpCabinClass maps our cabin names to SerpAPI travel_class values.
// 1=Economy, 2=Premium economy, 3=Business, 4=First
func serpCabinClass(cabin string) string {
	switch strings.ToLower(cabin) {
	case "business":
		return "3"
	case "first":
		return "4"
	case "premium_economy", "premium economy", "premium":
		return "2"
	default:
		return "1"
	}
}
