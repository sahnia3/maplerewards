package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// SeatsAeroService calls the Seats.aero Partner API for live award availability.
// It returns mileage costs, seat counts, and airline info per loyalty program.
type SeatsAeroService struct {
	apiKey string
	client *http.Client
}

// NewSeatsAeroService creates the Seats.aero service.
func NewSeatsAeroService(apiKey string) *SeatsAeroService {
	return &SeatsAeroService{
		apiKey: apiKey,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// IsAvailable returns true if the Seats.aero API key is configured.
func (s *SeatsAeroService) IsAvailable() bool {
	return s.apiKey != ""
}

// ── Response types from Seats.aero Cached Search ─────────────────────────────

type seatsAeroResponse struct {
	Data    []seatsAeroAvailability `json:"data"`
	Count   int                    `json:"count"`
	HasMore bool                   `json:"hasMore"`
	Cursor  int                    `json:"cursor"`
}

type seatsAeroAvailability struct {
	ID    string         `json:"ID"`
	Route seatsAeroRoute `json:"Route"`
	Date  string         `json:"Date"` // "YYYY-MM-DD"

	// Per-cabin availability
	YAvailable bool   `json:"YAvailable"`
	WAvailable bool   `json:"WAvailable"`
	JAvailable bool   `json:"JAvailable"`
	FAvailable bool   `json:"FAvailable"`

	// Per-cabin mileage costs (strings — e.g. "30000" or "")
	YMileageCost string `json:"YMileageCost"`
	WMileageCost string `json:"WMileageCost"`
	JMileageCost string `json:"JMileageCost"`
	FMileageCost string `json:"FMileageCost"`

	// Per-cabin remaining seats
	YRemainingSeats int `json:"YRemainingSeats"`
	WRemainingSeats int `json:"WRemainingSeats"`
	JRemainingSeats int `json:"JRemainingSeats"`
	FRemainingSeats int `json:"FRemainingSeats"`

	// Per-cabin airlines (comma-separated IATA codes)
	YAirlines string `json:"YAirlines"`
	WAirlines string `json:"WAirlines"`
	JAirlines string `json:"JAirlines"`
	FAirlines string `json:"FAirlines"`

	// Per-cabin direct flight availability
	YDirect bool `json:"YDirect"`
	WDirect bool `json:"WDirect"`
	JDirect bool `json:"JDirect"`
	FDirect bool `json:"FDirect"`

	Source    string `json:"Source"`    // loyalty program (e.g. "aeroplan")
	UpdatedAt string `json:"UpdatedAt"`
}

type seatsAeroRoute struct {
	OriginAirport      string `json:"OriginAirport"`
	DestinationAirport string `json:"DestinationAirport"`
	OriginRegion       string `json:"OriginRegion"`
	DestinationRegion  string `json:"DestinationRegion"`
	Distance           int    `json:"Distance"`
	Source             string `json:"Source"`
}

// ── SearchAwards ─────────────────────────────────────────────────────────────

// SearchAwards calls the Seats.aero Cached Search API and returns award
// availability as []AwardItem (same struct used by the old Apify service).
func (s *SeatsAeroService) SearchAwards(
	ctx context.Context,
	origin, dest string,
	startDate, endDate string,
	cabin string,
	sources []string,
) ([]AwardItem, error) {
	if !s.IsAvailable() {
		return nil, fmt.Errorf("SEATSAERO_API_KEY not configured")
	}

	start := time.Now()
	slog.Info("[seats.aero] searching awards",
		"origin", origin, "dest", dest,
		"dates", startDate+".."+endDate,
		"cabin", cabin, "sources", sources,
	)

	// Build query parameters
	params := url.Values{
		"origin_airport":      {strings.ToUpper(origin)},
		"destination_airport": {strings.ToUpper(dest)},
		"take":                {"100"},
	}
	if startDate != "" {
		params.Set("start_date", startDate)
	}
	if endDate != "" {
		params.Set("end_date", endDate)
	}
	if len(sources) > 0 {
		params.Set("sources", strings.Join(sources, ","))
	}

	// Map cabin to Seats.aero cabin letter for filtering
	cabinLetter := cabinToLetter(cabin)
	if cabinLetter != "" {
		params.Set("cabins", cabinLetter)
	}

	searchURL := "https://seats.aero/partnerapi/search?" + params.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, searchURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Partner-Authorization", s.apiKey)

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("seats.aero API call: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		slog.Error("[seats.aero] API error",
			"status", resp.StatusCode,
			"body", truncateStr(string(respBody), 500),
		)
		return nil, fmt.Errorf("seats.aero HTTP %d: %s", resp.StatusCode, truncateStr(string(respBody), 300))
	}

	// Parse response
	var saResp seatsAeroResponse
	if err := json.Unmarshal(respBody, &saResp); err != nil {
		slog.Error("[seats.aero] JSON unmarshal failed",
			"bodyLen", len(respBody),
			"bodyPreview", truncateStr(string(respBody), 500),
			"err", err,
		)
		return nil, fmt.Errorf("decode seats.aero response: %w", err)
	}

	slog.Info("[seats.aero] response received",
		"count", saResp.Count,
		"hasMore", saResp.HasMore,
		"elapsed", time.Since(start),
	)

	// Convert to []AwardItem
	var items []AwardItem
	for _, avail := range saResp.Data {
		item := s.convertAvailability(avail, cabin)
		if item == nil {
			continue
		}
		items = append(items, *item)

		slog.Debug("[seats.aero] parsed item",
			"source", avail.Source, "date", avail.Date,
			"mileage", item.MileageCost, "seats", item.SeatsAvailable,
		)
	}

	slog.Info("[seats.aero] parsed results", "itemCount", len(items), "totalElapsed", time.Since(start))
	return items, nil
}

// convertAvailability converts one Seats.aero result to an AwardItem for the
// requested cabin. Returns nil if the cabin has no availability.
func (s *SeatsAeroService) convertAvailability(avail seatsAeroAvailability, cabin string) *AwardItem {
	var (
		available      bool
		mileageCostStr string
		remainingSeats int
		airlines       string
	)

	switch cabinToLetter(cabin) {
	case "first":
		available = avail.FAvailable
		mileageCostStr = avail.FMileageCost
		remainingSeats = avail.FRemainingSeats
		airlines = avail.FAirlines
	case "business":
		available = avail.JAvailable
		mileageCostStr = avail.JMileageCost
		remainingSeats = avail.JRemainingSeats
		airlines = avail.JAirlines
	case "premium":
		available = avail.WAvailable
		mileageCostStr = avail.WMileageCost
		remainingSeats = avail.WRemainingSeats
		airlines = avail.WAirlines
	default: // economy
		available = avail.YAvailable
		mileageCostStr = avail.YMileageCost
		remainingSeats = avail.YRemainingSeats
		airlines = avail.YAirlines
	}

	if !available {
		return nil
	}

	mileageCost := parseMileageCost(mileageCostStr)
	if mileageCost <= 0 {
		return nil
	}

	// Build a minimal segment from the airlines info
	var segments []AwardSegment
	if airlines != "" {
		for _, code := range strings.Split(airlines, ",") {
			code = strings.TrimSpace(code)
			if code != "" {
				segments = append(segments, AwardSegment{
					Origin:      avail.Route.OriginAirport,
					Destination: avail.Route.DestinationAirport,
					Airline:     code,
				})
			}
		}
	}

	// Seats.aero does not return taxes — leaving TaxesCash nil and
	// TaxesIncluded=false makes the missing data explicit instead of lying
	// to the UI that this redemption is fee-free. award_search will merge
	// an Apify-supplied tax value on top when both sources land the same
	// (issuer|date) pair.
	return &AwardItem{
		Date:           avail.Date,
		Issuer:         avail.Source,
		Origin:         avail.Route.OriginAirport,
		Destination:    avail.Route.DestinationAirport,
		Cabin:          cabin,
		MileageCost:    mileageCost,
		TaxesCash:      nil,
		TaxesIncluded:  false,
		SeatsAvailable: remainingSeats,
		Segments:       segments,
	}
}

// cabinToLetter maps our cabin name to Seats.aero cabin identifier.
// Used for the "cabins" query parameter and for picking per-cabin fields.
func cabinToLetter(cabin string) string {
	switch strings.ToLower(cabin) {
	case "first":
		return "first"
	case "business":
		return "business"
	case "premium_economy", "premium economy", "premium":
		return "premium"
	default:
		return "economy"
	}
}

// parseMileageCost parses a string mileage cost like "70000" to int.
func parseMileageCost(s string) int {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	v, err := strconv.Atoi(s)
	if err != nil {
		// Try parsing as float (some APIs return "70000.0")
		f, ferr := strconv.ParseFloat(s, 64)
		if ferr != nil {
			return 0
		}
		return int(f)
	}
	return v
}
