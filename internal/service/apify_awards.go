package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// ApifyAwardService calls the Apify "igolaizola/flight-award-scraper" actor
// to get LIVE award flight availability with real miles costs, taxes, and
// remaining seats across 24 loyalty programs.
//
// Free tier: ~$0.01 per result. Only works within 60 days from today.
type ApifyAwardService struct {
	apiToken string
	client   *http.Client
	actorID  string
	// quota enforces a hard monthly ceiling on paid actor runs (kill-switch
	// against a bug/spike running unbounded scrapes). May be nil in tests —
	// nil means the cap is skipped (treated as unlimited).
	quota QuotaSpender
}

// NewApifyAwardService creates the Apify award scraper service. quotaClient
// may be nil (tests) — when nil the monthly cap is not enforced.
func NewApifyAwardService(apiToken string, quotaClient QuotaSpender) *ApifyAwardService {
	return &ApifyAwardService{
		apiToken: apiToken,
		client: &http.Client{
			Timeout: 120 * time.Second, // Actor runs can take a while
		},
		actorID: "igolaizola~flight-award-scraper",
		quota:   quotaClient,
	}
}

// IsAvailable returns true if the Apify API token is configured.
func (s *ApifyAwardService) IsAvailable() bool {
	return s.apiToken != ""
}

// ── Apify actor input/output types ──────────────────────────────────────────

type apifyActorInput struct {
	MaxItems     int      `json:"maxItems"`
	SortBy       string   `json:"sortBy,omitempty"`
	Origins      []string `json:"origins"`
	Destinations []string `json:"destinations"`
	StartDate    string   `json:"startDate,omitempty"`
	EndDate      string   `json:"endDate,omitempty"`
	Cabin        string   `json:"cabin,omitempty"`
	Issuers      []string `json:"issuers,omitempty"`
}

// apifyRunResponse is the response from starting an actor run.
type apifyRunResponse struct {
	Data struct {
		ID                string `json:"id"`
		Status            string `json:"status"`
		DefaultDatasetID  string `json:"defaultDatasetId"`
	} `json:"data"`
}

// apifyAwardResult is one result item from the flight-award-scraper dataset.
type apifyAwardResult struct {
	Date            string             `json:"date"`
	Origin          string             `json:"origin"`
	Destination     string             `json:"destination"`
	OriginName      string             `json:"originName"`
	DestinationName string             `json:"destinationName"`
	Issuer          string             `json:"issuer"`
	IssuerName      string             `json:"issuerName"`
	Distance        int                `json:"distance"`
	Cabins          []apifyCabinResult `json:"cabins"`
	Itineraries     []apifyItinerary   `json:"itineraries"`
}

type apifyCabinResult struct {
	Name      string          `json:"name"`
	Available bool            `json:"available"`
	Mileage   int             `json:"mileage"`
	Taxes     int             `json:"taxes"` // Often in cents
	Airlines  []apifyAirline  `json:"airlines"`
	Direct    bool            `json:"direct"`
}

type apifyAirline struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

type apifyItinerary struct {
	Origin      string `json:"origin"`
	Destination string `json:"destination"`
	Departure   string `json:"departure"`
	Arrival     string `json:"arrival"`
	// Apify started returning totalDuration as either a JSON string ("PT7H30M")
	// OR a JSON number (minutes). Use json.RawMessage so neither shape errors
	// out — we don't currently consume this field anyway.
	TotalDuration json.RawMessage  `json:"totalDuration,omitempty"`
	Stops         int              `json:"stops"`
	Connections   []string         `json:"connections"`
	Airlines      []apifyAirline   `json:"airlines"`
	Aircrafts     []string         `json:"aircrafts"`
	FlightNumbers []string         `json:"flightNumbers"`
	Cabins        []apifyItinCabin `json:"cabins"`
	Segments      []apifySegment   `json:"segments"`
}

type apifyItinCabin struct {
	Name           string `json:"name"`
	MileageCost    int    `json:"mileageCost"`
	TotalTaxes     int    `json:"totalTaxes"`
	RemainingSeats int    `json:"remainingSeats"`
}

type apifySegment struct {
	FlightNumber string `json:"flightNumber"`
	// Duration shape changed alongside totalDuration; tolerate both string
	// and number representations. Not consumed downstream.
	Duration     json.RawMessage `json:"duration,omitempty"`
	AircraftName string          `json:"aircraftName"`
	Origin       string          `json:"origin"`
	Destination  string          `json:"destination"`
	Departure    string          `json:"departure"`
	Arrival      string          `json:"arrival"`
	Cabin        string          `json:"cabin"`
}

// ── Supported issuers (24 programs) ─────────────────────────────────────────

var apifyIssuers = []string{
	"aeroplan", "alaska", "american", "delta", "emirates", "etihad",
	"eurobonus", "flyingblue", "jetblue", "lufthansa", "qatar",
	"singapore", "turkish", "united", "virginatlantic",
}

// ── SearchAwards — run actor, poll, fetch results ───────────────────────────

// SearchAwards runs the Apify flight-award-scraper actor and returns live
// award availability. This is a blocking call that can take 30-90 seconds.
// Only works for dates within 60 days from today.
func (s *ApifyAwardService) SearchAwards(
	ctx context.Context,
	origin, dest, startDate, endDate, cabin string,
	issuers []string,
) ([]AwardItem, error) {
	if !s.IsAvailable() {
		return nil, fmt.Errorf("APIFY_TOKEN not configured")
	}

	// Validate date is within 60 days
	if startDate != "" {
		if t, err := time.Parse("2006-01-02", startDate); err == nil {
			if t.After(time.Now().AddDate(0, 0, 60)) {
				slog.Warn("[apify-awards] date beyond 60-day limit, skipping",
					"startDate", startDate)
				return nil, fmt.Errorf("apify actor only supports dates within 60 days")
			}
		}
	}

	// Hard monthly ceiling on paid actor runs. Mirrors the SerpAPI gate:
	// fail CLOSED when the cap is hit (don't run another paid scrape), but
	// fail OPEN on a quota-infra error (a Redis blip shouldn't take the
	// premium feature down). Checked here — after the cheap validations,
	// before the expensive actor run.
	if s.quota != nil {
		_, exhausted, qErr := s.quota.Spend(ctx, "apify")
		if qErr != nil {
			slog.Warn("[apify-awards] quota check failed, allowing request", "err", qErr)
		} else if exhausted {
			slog.Warn("[apify-awards] monthly Apify cap reached — skipping scrape")
			return nil, ErrQuotaExhausted
		}
	}

	// Filter issuers to only those supported by the actor
	supportedSet := map[string]bool{}
	for _, iss := range apifyIssuers {
		supportedSet[iss] = true
	}
	var filteredIssuers []string
	if len(issuers) > 0 {
		for _, iss := range issuers {
			if supportedSet[iss] {
				filteredIssuers = append(filteredIssuers, iss)
			}
		}
	}

	input := apifyActorInput{
		MaxItems:     50,
		SortBy:       cabin,
		Origins:      []string{strings.ToUpper(origin)},
		Destinations: []string{strings.ToUpper(dest)},
		StartDate:    startDate,
		EndDate:      endDate,
		Cabin:        cabin,
		Issuers:      filteredIssuers,
	}

	start := time.Now()
	slog.Info("[apify-awards] starting actor run",
		"origin", origin, "dest", dest,
		"dates", startDate+"→"+endDate, "cabin", cabin,
		"issuers", filteredIssuers,
	)

	// ── Step 1: Start the actor run ──────────────────────────────────────
	runID, datasetID, err := s.startRun(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("start actor run: %w", err)
	}
	slog.Info("[apify-awards] actor run started", "runID", runID, "datasetID", datasetID)

	// ── Step 2: Poll until complete (max 150s — actor occasionally exceeds 90s) ─
	err = s.pollUntilDone(ctx, runID, 150*time.Second)
	if err != nil {
		return nil, fmt.Errorf("poll actor run: %w", err)
	}

	// ── Step 3: Fetch dataset items ──────────────────────────────────────
	results, err := s.fetchDataset(ctx, datasetID)
	if err != nil {
		return nil, fmt.Errorf("fetch dataset: %w", err)
	}

	slog.Info("[apify-awards] actor completed",
		"results", len(results), "elapsed", time.Since(start))

	// ── Step 4: Convert to AwardItem[] ──────────────────────────────────
	return s.convertResults(results, cabin), nil
}

// startRun starts the actor and returns (runID, datasetID).
func (s *ApifyAwardService) startRun(ctx context.Context, input apifyActorInput) (string, string, error) {
	body, _ := json.Marshal(input)

	url := fmt.Sprintf("https://api.apify.com/v2/acts/%s/runs", s.actorID)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, strings.NewReader(string(body)))
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Content-Type", "application/json")
	// Token in the Authorization header, not the URL query — URLs are the most
	// commonly logged/traced string, so a query-string token risks leaking a
	// live paid credential into access logs / error wrappers.
	req.Header.Set("Authorization", "Bearer "+s.apiToken)

	resp, err := s.client.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close() //nolint:errcheck // close on read-only response body

	respBody, _ := readCappedBody(resp.Body)
	if resp.StatusCode != http.StatusCreated {
		return "", "", fmt.Errorf("apify HTTP %d: %s", resp.StatusCode, truncateStr(string(respBody), 300))
	}

	var runResp apifyRunResponse
	if err := json.Unmarshal(respBody, &runResp); err != nil {
		return "", "", fmt.Errorf("decode run response: %w", err)
	}

	return runResp.Data.ID, runResp.Data.DefaultDatasetID, nil
}

// pollUntilDone polls the run status until SUCCEEDED, FAILED, or timeout.
func (s *ApifyAwardService) pollUntilDone(ctx context.Context, runID string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	url := fmt.Sprintf("https://api.apify.com/v2/actor-runs/%s", runID)

	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(3 * time.Second):
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "Bearer "+s.apiToken) // token in header, not URL

		resp, err := s.client.Do(req)
		if err != nil {
			slog.Debug("apify poll request failed, retrying", "run_id", runID, "err", err)
			continue
		}
		body, _ := readCappedBody(resp.Body)
		resp.Body.Close() //nolint:errcheck // close on read-only response body

		var runResp apifyRunResponse
		if err := json.Unmarshal(body, &runResp); err != nil {
			slog.Debug("apify poll response unmarshal failed, retrying", "run_id", runID, "err", err)
			continue
		}

		switch runResp.Data.Status {
		case "SUCCEEDED":
			return nil
		case "FAILED", "ABORTED", "TIMED-OUT":
			return fmt.Errorf("actor run %s: %s", runID, runResp.Data.Status)
		}
		// Still RUNNING or READY — keep polling
	}

	return fmt.Errorf("actor run timed out after %s", timeout)
}

// maxExternalRespBytes caps how much of an external API response body we read
// into memory, so a malformed or maliciously-huge upstream payload (Apify,
// SerpAPI, Anthropic) can't exhaust memory. Generous headroom over any real
// response, including long LLM completions.
const maxExternalRespBytes = 16 << 20 // 16 MiB

// readCappedBody reads at most maxExternalRespBytes from r. A body larger than
// the cap is truncated (and then fails JSON parsing downstream) rather than
// read unbounded into memory.
func readCappedBody(r io.Reader) ([]byte, error) {
	return io.ReadAll(io.LimitReader(r, maxExternalRespBytes))
}

// fetchDataset retrieves the result items from the actor's default dataset.
func (s *ApifyAwardService) fetchDataset(ctx context.Context, datasetID string) ([]apifyAwardResult, error) {
	url := fmt.Sprintf("https://api.apify.com/v2/datasets/%s/items?format=json", datasetID)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+s.apiToken) // token in header, not URL

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close() //nolint:errcheck // close on read-only response body

	body, _ := readCappedBody(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("dataset HTTP %d: %s", resp.StatusCode, truncateStr(string(body), 300))
	}

	var results []apifyAwardResult
	if err := json.Unmarshal(body, &results); err != nil {
		return nil, fmt.Errorf("decode dataset: %w", err)
	}

	return results, nil
}

// convertResults transforms Apify results into our standard AwardItem format.
// Wrapped in panic recovery because Apify schema drift has bitten twice already
// (string→number on totalDuration and segments[].duration). A third drift on a
// field we DO consume would otherwise crash the whole API process.
func (s *ApifyAwardService) convertResults(results []apifyAwardResult, targetCabin string) (out []AwardItem) {
	defer func() {
		if rec := recover(); rec != nil {
			slog.Error("[apify-awards] convertResults panic — likely schema drift",
				"panic", rec,
				"target_cabin", targetCabin,
				"raw_count", len(results),
			)
			out = nil
		}
	}()

	var items []AwardItem

	for _, r := range results {
		// Find the cabin data matching our target cabin
		var mileage int
		var taxes float64
		var seats int
		found := false

		// Check itinerary-level cabin data first (more detailed)
		for _, itin := range r.Itineraries {
			for _, cab := range itin.Cabins {
				if strings.EqualFold(cab.Name, targetCabin) && cab.MileageCost > 0 {
					mileage = cab.MileageCost
					taxes = float64(cab.TotalTaxes) / 100.0 // Convert cents to dollars
					seats = cab.RemainingSeats
					found = true
					break
				}
			}
			if found {
				break
			}
		}

		// Fallback to route-level cabin summary
		if !found {
			for _, cab := range r.Cabins {
				if strings.EqualFold(cab.Name, targetCabin) && cab.Available && cab.Mileage > 0 {
					mileage = cab.Mileage
					taxes = float64(cab.Taxes) / 100.0
					found = true
					break
				}
			}
		}

		if !found || mileage <= 0 {
			continue
		}

		// Build segments from itineraries
		var segments []AwardSegment
		if len(r.Itineraries) > 0 {
			itin := r.Itineraries[0]
			for _, seg := range itin.Segments {
				segments = append(segments, AwardSegment{
					Origin:        seg.Origin,
					Destination:   seg.Destination,
					Airline:       "", // Will be set from flight number
					FlightNumber:  seg.FlightNumber,
					DepartureTime: seg.Departure,
					ArrivalTime:   seg.Arrival,
					Aircraft:      seg.AircraftName,
				})
			}
		}

		// Apify reports taxes in cents — already converted above. Keep a
		// pointer so downstream merge logic can detect "we have a number"
		// vs. "Seats.aero left this nil".
		taxesPtr := taxes
		items = append(items, AwardItem{
			Date:           r.Date,
			Issuer:         r.Issuer,
			Origin:         r.Origin,
			Destination:    r.Destination,
			Cabin:          targetCabin,
			MileageCost:    mileage,
			TaxesCash:      &taxesPtr,
			TaxesIncluded:  true,
			SeatsAvailable: seats,
			Segments:       segments,
		})
	}

	return items
}
