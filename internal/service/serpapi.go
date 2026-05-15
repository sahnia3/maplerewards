package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"maplerewards/internal/quota"
)

// ErrQuotaExhausted is returned by SearchFlights when SerpAPI's free-tier
// monthly call budget has been spent. Callers should surface this clearly
// rather than retry — the next reset is on the 1st of the next month.
var ErrQuotaExhausted = errors.New("serpapi monthly quota exhausted")

// QuotaSpender is the minimal interface SerpAPIService needs from the
// quota client. Kept narrow so tests can inject a fake without touching
// Redis.
type QuotaSpender interface {
	Spend(ctx context.Context, provider string) (remaining int, exhausted bool, err error)
}

// SerpAPIService calls the SerpAPI Google Flights engine for real cash flight prices.
// Free tier: 250 searches/month — protected by the quota client so we don't
// silently fall through to a stale zone fallback after exhausting the budget.
type SerpAPIService struct {
	apiKey string
	client *http.Client
	quota  QuotaSpender
}

// NewSerpAPIService creates the SerpAPI service. quotaClient may be nil in
// unit tests; when nil the quota check is skipped (treated as unlimited).
func NewSerpAPIService(apiKey string, quotaClient QuotaSpender) *SerpAPIService {
	return &SerpAPIService{
		apiKey: apiKey,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
		quota: quotaClient,
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

// ── Request struct ──────────────────────────────────────────────────────────

// SerpFlightRequest is the typed input for the struct-based search path.
// Use it via SearchFlightsReq for round-trip support; the positional
// SearchFlights wrapper continues to default to one-way.
type SerpFlightRequest struct {
	Origin       string
	Destination  string
	OutboundDate string // YYYY-MM-DD
	ReturnDate   string // optional; when non-empty switches to round-trip
	Cabin        string
	Passengers   int
}

// ── SearchFlights ────────────────────────────────────────────────────────────

// SearchFlights is the legacy positional API kept for existing callers in
// ai.go / ai_tools.go / trip.go. It defaults to one-way (ReturnDate="").
func (s *SerpAPIService) SearchFlights(
	ctx context.Context,
	origin, dest, date, cabin string,
	passengers int,
) ([]FlightResult, error) {
	return s.SearchFlightsReq(ctx, SerpFlightRequest{
		Origin:       origin,
		Destination:  dest,
		OutboundDate: date,
		Cabin:        cabin,
		Passengers:   passengers,
	})
}

// SearchFlightsReq runs the actual query. When both OutboundDate and
// ReturnDate are present the call switches to round-trip (type=1) and
// includes return_date; otherwise it stays one-way (type=2).
//
// Before issuing the HTTP request the function debits one unit from the
// shared monthly quota. An exhausted quota returns ErrQuotaExhausted
// without contacting SerpAPI so we don't silently rack up overage charges
// or pretend the zone-fallback estimate is real-time data.
func (s *SerpAPIService) SearchFlightsReq(
	ctx context.Context,
	req SerpFlightRequest,
) ([]FlightResult, error) {
	if !s.IsAvailable() {
		return nil, fmt.Errorf("SERPAPI_KEY not configured")
	}

	// Quota check — only when wired in. nil client means tests/dev override.
	if s.quota != nil {
		remaining, exhausted, err := s.quota.Spend(ctx, "serpapi")
		if err != nil {
			slog.Warn("[serpapi] quota check failed; allowing request", "err", err)
		} else if exhausted {
			slog.Warn("[serpapi] monthly quota exhausted; skipping HTTP call",
				"remaining", remaining)
			return nil, ErrQuotaExhausted
		} else {
			slog.Info("[serpapi] quota debited", "remaining", remaining)
		}
	}

	start := time.Now()
	roundTrip := req.OutboundDate != "" && req.ReturnDate != ""
	slog.Info("[serpapi] searching flights",
		"origin", req.Origin, "dest", req.Destination,
		"outbound", req.OutboundDate, "return", req.ReturnDate,
		"cabin", req.Cabin, "passengers", req.Passengers,
		"roundTrip", roundTrip,
	)

	// type values:  1 = round-trip, 2 = one-way
	tripType := "2"
	if roundTrip {
		tripType = "1"
	}

	params := url.Values{
		"engine":        {"google_flights"},
		"departure_id":  {strings.ToUpper(req.Origin)},
		"arrival_id":    {strings.ToUpper(req.Destination)},
		"outbound_date": {req.OutboundDate},
		"type":          {tripType},
		"travel_class":  {serpCabinClass(req.Cabin)},
		"currency":      {"CAD"},
		"hl":            {"en"},
		"gl":            {"ca"},
		"api_key":       {s.apiKey},
	}
	if roundTrip {
		params.Set("return_date", req.ReturnDate)
	}
	if req.Passengers > 1 {
		params.Set("adults", fmt.Sprintf("%d", req.Passengers))
	}

	searchURL := "https://serpapi.com/search.json?" + params.Encode()

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, searchURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	resp, err := s.client.Do(httpReq)
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

// Compile-time check: *quota.Client satisfies QuotaSpender.
var _ QuotaSpender = (*quota.Client)(nil)

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
