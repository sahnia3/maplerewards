package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"strconv"
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
		ID               string `json:"id"`
		Status           string `json:"status"`
		DefaultDatasetID string `json:"defaultDatasetId"`
	} `json:"data"`
}

// NOTE: The dataset result items (date/issuer/cabins/itineraries/segments) are
// intentionally NOT modeled as Go structs. The actor's output schema drifts
// without notice — totalDuration and segments[].duration have already flipped
// JSON string ↔ number in production — so the response is parsed defensively
// from generic JSON (map[string]any) in parseApifyResults below, where every
// field access is type-checked and a surprise degrades to skip/zero rather than
// an unmarshal error or a panic.

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

	// Per-tier monthly ceiling on paid actor runs. FAILS CLOSED on BOTH an
	// exhausted cap AND a quota-infra error: Apify is the most expensive paid
	// provider, so a Redis outage must NOT let scrapes run uncapped. Denying on
	// error degrades gracefully — award_search still returns Seats.aero +
	// SerpAPI. Checked after the cheap validations, before the expensive run.
	if s.quota != nil {
		_, exhausted, qErr := s.quota.SpendTier(ctx, "apify", quotaTierFromCtx(ctx))
		if qErr != nil {
			slog.Warn("[apify-awards] quota system degraded; denying paid scrape (fail-closed)", "err", qErr)
			return nil, ErrQuotaExhausted
		}
		if exhausted {
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

	// ── Step 3: Fetch dataset items (raw bytes) ──────────────────────────
	body, err := s.fetchDataset(ctx, datasetID)
	if err != nil {
		return nil, fmt.Errorf("fetch dataset: %w", err)
	}

	// ── Step 4: Defensively parse → AwardItem[] ──────────────────────────
	// parseApifyResults never returns an error today (a drifted/garbage body
	// yields an empty slice + a logged warning), but the signature carries one
	// for forward-compat. Treat any error as "no results" rather than failing
	// the whole search — the other data sources still ran.
	items, perr := parseApifyResults(body, cabin)
	if perr != nil {
		slog.Warn("[apify-awards] parse returned error — treating as empty", "err", perr)
		items = nil
	}

	slog.Info("[apify-awards] actor completed",
		"results", len(items), "elapsed", time.Since(start))

	return items, nil
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

// fetchDataset retrieves the RAW result-item bytes from the actor's default
// dataset. It deliberately does NOT unmarshal: the actor's schema drifts
// (undocumented upstream changes have bitten twice), so parsing is delegated to
// parseApifyResults, which tolerates any shape. Keeping fetch (network + status)
// separate from parse (shape) is what makes the parser unit-testable against a
// battery of malformed bodies.
func (s *ApifyAwardService) fetchDataset(ctx context.Context, datasetID string) ([]byte, error) {
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

	return body, nil
}

// parseApifyResults is the panic-proof parser for the flight-award-scraper
// dataset body. It is the single seam through which every Apify award response
// flows.
//
// CONTRACT: no input — empty, null, `{}`, an object where an array is expected,
// an array of non-objects, wrong-typed fields, truncated JSON, extra unknown
// fields — may panic. A drifted or garbage body yields an empty (or partial)
// []AwardItem plus a logged warning, never a panic and never a hard error.
// The error in the signature is reserved for forward-compat; today it is
// always nil.
//
// WHY map[string]any instead of typed structs: Apify's schema drifts without
// notice (totalDuration and segments[].duration have already flipped JSON
// string ↔ number in production). Decoding into typed structs makes a type
// flip on a *consumed* field a hard unmarshal error — or, for the json.Number
// fields, silently swallows the change. Walking the response as generic JSON
// with comma-ok assertions, nil checks, and bounds checks lets us treat every
// surprise as "skip this item / use the zero value" instead of crashing.
func parseApifyResults(body []byte, targetCabin string) (out []AwardItem, err error) {
	// Defense-in-depth ONLY. The logic below is written to be correct for any
	// input without it — every map is nil-checked, every assertion is comma-ok,
	// every index is bounds-checked — so this recover should never fire. It
	// stays because a panic here (a future refactor, an exotic input) must
	// never take down the API process; it degrades to an empty result + a
	// logged warning instead.
	defer func() {
		if rec := recover(); rec != nil {
			slog.Error("[apify-awards] parseApifyResults panic — likely schema drift (recovered)",
				"panic", rec,
				"target_cabin", targetCabin,
				"bytes", len(body),
			)
			out = nil
			err = nil
		}
	}()

	// Empty / whitespace-only body → no results. (json.Unmarshal would error
	// on "" anyway; short-circuit so an empty 200 isn't logged as drift.)
	if len(bytesTrimSpace(body)) == 0 {
		return nil, nil
	}

	var top any
	if err := json.Unmarshal(body, &top); err != nil {
		// Truncated / non-JSON / garbage body. Not a panic, not a hard error —
		// the other data sources still ran. Log and return empty.
		slog.Warn("[apify-awards] dataset body is not valid JSON — returning empty",
			"err", err, "bytes", len(body))
		return nil, nil
	}

	// The dataset endpoint returns a JSON array of item objects. Tolerate the
	// observed/possible drifts:
	//   • a bare object (single item, or an error/envelope wrapper)
	//   • {"items":[...]} or {"data":[...]} style envelopes
	//   • anything else → unexpected top-level shape → empty result set.
	rawItems := coerceToItemSlice(top)
	if rawItems == nil {
		slog.Warn("[apify-awards] unexpected top-level shape — returning empty",
			"goType", fmt.Sprintf("%T", top))
		return nil, nil
	}

	var items []AwardItem
	for _, raw := range rawItems {
		// Each element must be a JSON object. A string/number/array/null where
		// an item object is expected is skipped, not dereferenced.
		r, ok := raw.(map[string]any)
		if !ok {
			continue
		}

		mileage, taxes, seats, found := pickCabin(r, targetCabin)
		if !found || mileage <= 0 {
			continue
		}

		taxesPtr := taxes
		items = append(items, AwardItem{
			Date:           getString(r, "date"),
			Issuer:         getString(r, "issuer"),
			Origin:         getString(r, "origin"),
			Destination:    getString(r, "destination"),
			Cabin:          targetCabin,
			MileageCost:    mileage,
			TaxesCash:      &taxesPtr,
			TaxesIncluded:  true,
			SeatsAvailable: seats,
			Segments:       buildSegments(r),
		})
	}

	return items, nil
}

// pickCabin locates the cabin data matching targetCabin within a single result
// object, mirroring the original two-tier logic: itinerary-level cabins first
// (more detailed: mileage + taxes + seats), then the route-level cabin summary.
// Returns (mileage, taxesDollars, seats, found). Every access is type-checked,
// so a drifted shape on any nested field just means "not found here".
func pickCabin(r map[string]any, targetCabin string) (mileage int, taxes float64, seats int, found bool) {
	// Itinerary-level cabins (preferred).
	for _, itinAny := range getSlice(r, "itineraries") {
		itin, ok := itinAny.(map[string]any)
		if !ok {
			continue
		}
		for _, cabAny := range getSlice(itin, "cabins") {
			cab, ok := cabAny.(map[string]any)
			if !ok {
				continue
			}
			mc := getInt(cab, "mileageCost")
			if strings.EqualFold(getString(cab, "name"), targetCabin) && mc > 0 {
				return mc, float64(getInt(cab, "totalTaxes")) / 100.0, getInt(cab, "remainingSeats"), true
			}
		}
	}

	// Route-level cabin summary (fallback).
	for _, cabAny := range getSlice(r, "cabins") {
		cab, ok := cabAny.(map[string]any)
		if !ok {
			continue
		}
		m := getInt(cab, "mileage")
		if strings.EqualFold(getString(cab, "name"), targetCabin) && getBool(cab, "available") && m > 0 {
			return m, float64(getInt(cab, "taxes")) / 100.0, 0, true
		}
	}

	return 0, 0, 0, false
}

// buildSegments converts the FIRST itinerary's segments into []AwardSegment.
// A missing/empty/non-array itineraries field, a non-object first itinerary, or
// non-object segments all yield a nil/partial slice rather than a panic.
func buildSegments(r map[string]any) []AwardSegment {
	itins := getSlice(r, "itineraries")
	if len(itins) == 0 {
		return nil
	}
	itin, ok := itins[0].(map[string]any)
	if !ok {
		return nil
	}
	var segments []AwardSegment
	for _, segAny := range getSlice(itin, "segments") {
		seg, ok := segAny.(map[string]any)
		if !ok {
			continue
		}
		segments = append(segments, AwardSegment{
			Origin:        getString(seg, "origin"),
			Destination:   getString(seg, "destination"),
			Airline:       "", // set downstream from flight number
			FlightNumber:  getString(seg, "flightNumber"),
			DepartureTime: getString(seg, "departure"),
			ArrivalTime:   getString(seg, "arrival"),
			Aircraft:      getString(seg, "aircraftName"),
		})
	}
	return segments
}

// ── Safe JSON-shape accessors ────────────────────────────────────────────────
// Each takes a map that MAY be nil and a key that MAY be absent or hold a
// wrong-typed value, and returns the zero value in every non-happy case. These
// are the primitives that make parseApifyResults panic-proof: no bare type
// assertion, no unchecked index, no deref of a possibly-nil container.

// coerceToItemSlice normalizes the top-level value into a slice of item-shaped
// values. It accepts a JSON array, a single object (wrapped into a 1-element
// slice), or a common envelope ({"items":[...]} / {"data":[...]}). Anything
// else (string, number, bool, null) returns nil to signal "unexpected shape".
func coerceToItemSlice(top any) []any {
	switch v := top.(type) {
	case []any:
		return v
	case map[string]any:
		// Envelope forms first; fall back to treating the object as one item.
		if inner, ok := v["items"].([]any); ok {
			return inner
		}
		if inner, ok := v["data"].([]any); ok {
			return inner
		}
		return []any{v}
	default:
		return nil
	}
}

// getString returns m[key] as a string, or "" if m is nil, the key is absent,
// the value is null, or the value is not a JSON string.
func getString(m map[string]any, key string) string {
	if m == nil {
		return ""
	}
	if s, ok := m[key].(string); ok {
		return s
	}
	return ""
}

// getInt returns m[key] as an int. JSON numbers decode to float64 via
// encoding/json, so that is the primary case; a numeric string ("12345") is
// also tolerated since drift has flipped number↔string before. Anything else
// (null, bool, object, array, absent, NaN/Inf) yields 0.
func getInt(m map[string]any, key string) int {
	if m == nil {
		return 0
	}
	switch v := m[key].(type) {
	case float64:
		return f64ToInt(v)
	case json.Number:
		if i, err := v.Int64(); err == nil {
			return int(i)
		}
		if f, err := v.Float64(); err == nil {
			return f64ToInt(f)
		}
		return 0
	case string:
		// Tolerate "12345" and "12345.0"; reject everything else.
		if i, err := strconv.Atoi(strings.TrimSpace(v)); err == nil {
			return i
		}
		if f, err := strconv.ParseFloat(strings.TrimSpace(v), 64); err == nil {
			return f64ToInt(f)
		}
		return 0
	default:
		return 0
	}
}

// f64ToInt converts a float64 to int, returning 0 for NaN, ±Inf, or any value
// outside the int range. Go's float→int conversion is implementation-defined
// when the value overflows, so clamping here keeps a drifted/absurd number
// (e.g. 1e308) deterministic and harmless across platforms instead of yielding
// a garbage int.
func f64ToInt(f float64) int {
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return 0
	}
	if f > float64(math.MaxInt) || f < float64(math.MinInt) {
		return 0
	}
	return int(f)
}

// getBool returns m[key] as a bool. A real JSON bool is honored; the string
// "true" (case-insensitive) is tolerated for drift; everything else is false.
func getBool(m map[string]any, key string) bool {
	if m == nil {
		return false
	}
	switch v := m[key].(type) {
	case bool:
		return v
	case string:
		return strings.EqualFold(strings.TrimSpace(v), "true")
	default:
		return false
	}
}

// getSlice returns m[key] as a []any, or nil if m is nil, the key is absent,
// the value is null, or the value is not a JSON array. Ranging over the nil
// return is safe (zero iterations), so callers need no extra guard.
func getSlice(m map[string]any, key string) []any {
	if m == nil {
		return nil
	}
	if s, ok := m[key].([]any); ok {
		return s
	}
	return nil
}

// bytesTrimSpace trims leading/trailing JSON whitespace without pulling in
// bytes/strings just for the empty-body short-circuit above.
func bytesTrimSpace(b []byte) []byte {
	start := 0
	for start < len(b) && asciiSpace(b[start]) {
		start++
	}
	end := len(b)
	for end > start && asciiSpace(b[end-1]) {
		end--
	}
	return b[start:end]
}

func asciiSpace(c byte) bool {
	return c == ' ' || c == '\t' || c == '\n' || c == '\r'
}
