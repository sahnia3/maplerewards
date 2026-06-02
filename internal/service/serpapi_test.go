package service

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"maplerewards/internal/quota"
)

// stubQuota implements QuotaSpender via function fields — matches the repo's
// mock-by-interface convention. SpendTier records every call so tests can
// assert provider + tier, and defaults to "allowed" when no func is set.
type stubQuota struct {
	spendFn func(ctx context.Context, provider string, tier quota.Tier) (int, bool, error)
	calls   []string     // provider names, in call order
	tiers   []quota.Tier // tier per call, parallel to calls
}

func (s *stubQuota) SpendTier(ctx context.Context, provider string, tier quota.Tier) (int, bool, error) {
	s.calls = append(s.calls, provider)
	s.tiers = append(s.tiers, tier)
	if s.spendFn == nil {
		return 1, false, nil
	}
	return s.spendFn(ctx, provider, tier)
}

// fakeSerpJSON returns the smallest valid SerpAPI Google Flights payload so
// the parser sees at least one priced flight. The test cares about the
// outgoing query, not the response shape.
const fakeSerpJSON = `{
  "best_flights": [
    {"flights":[{"airline":"Air Canada","flight_number":"AC 856","departure_airport":{"id":"YYZ"},"arrival_airport":{"id":"LHR"},"travel_class":"Business"}],"total_duration":420,"price":3500,"type":"One way"}
  ],
  "other_flights": []
}`

func TestSearchFlights_QuotaExhausted(t *testing.T) {
	qs := &stubQuota{
		spendFn: func(ctx context.Context, provider string, tier quota.Tier) (int, bool, error) {
			if provider != "serpapi" {
				t.Errorf("unexpected provider: %s", provider)
			}
			return 0, true, nil
		},
	}
	svc := NewSerpAPIService("test-key", qs)

	_, err := svc.SearchFlights(context.Background(), "YYZ", "LHR", "2026-07-15", "business", 1)
	if err == nil {
		t.Fatalf("expected error when quota exhausted")
	}
	if !errors.Is(err, ErrQuotaExhausted) {
		t.Fatalf("expected ErrQuotaExhausted, got %v", err)
	}
	if len(qs.calls) != 1 || qs.calls[0] != "serpapi" {
		t.Fatalf("expected one serpapi quota spend, got %v", qs.calls)
	}
}

func TestSearchFlightsReq_RoundTripParams(t *testing.T) {
	var capturedURL string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedURL = r.URL.String()
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, fakeSerpJSON) //nolint:errcheck
	}))
	defer ts.Close()

	qs := &stubQuota{}
	svc := NewSerpAPIService("test-key", qs)
	// Redirect the SerpAPI base by overriding the http.Client transport so
	// every call goes to ts. Simplest approach: wrap with a RoundTripper
	// that rewrites the host.
	svc.client = &http.Client{Transport: &rewriteTransport{target: ts.URL}}

	_, err := svc.SearchFlightsReq(context.Background(), SerpFlightRequest{
		Origin:       "YYZ",
		Destination:  "LHR",
		OutboundDate: "2026-07-15",
		ReturnDate:   "2026-07-29",
		Cabin:        "business",
		Passengers:   2,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	parsed, err := url.Parse(capturedURL)
	if err != nil {
		t.Fatalf("parse captured URL: %v", err)
	}
	q := parsed.Query()
	if got := q.Get("type"); got != "1" {
		t.Errorf("round-trip type = %q, want \"1\"", got)
	}
	if got := q.Get("return_date"); got != "2026-07-29" {
		t.Errorf("return_date = %q, want 2026-07-29", got)
	}
	if got := q.Get("outbound_date"); got != "2026-07-15" {
		t.Errorf("outbound_date = %q, want 2026-07-15", got)
	}
	// adults must NOT be set to the passenger count: Google would then return
	// the GROUP total, which callers already multiply by passengers (double-
	// count → inflated CPP). We always price per-person (adults defaults to 1)
	// and scale by passengers downstream. See serpapi.go SearchFlightsReq.
	if got := q.Get("adults"); got != "" {
		t.Errorf("adults = %q, want unset (per-person pricing)", got)
	}
	if !strings.Contains(parsed.Path, "/search.json") {
		t.Errorf("path = %q, want it to contain /search.json", parsed.Path)
	}
}

func TestSearchFlightsReq_OneWayDefaultsNoReturnDate(t *testing.T) {
	var capturedURL string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedURL = r.URL.String()
		fmt.Fprint(w, fakeSerpJSON) //nolint:errcheck
	}))
	defer ts.Close()

	qs := &stubQuota{}
	svc := NewSerpAPIService("test-key", qs)
	svc.client = &http.Client{Transport: &rewriteTransport{target: ts.URL}}

	_, err := svc.SearchFlights(context.Background(), "YYZ", "LHR", "2026-07-15", "economy", 1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	parsed, _ := url.Parse(capturedURL)
	q := parsed.Query()
	if got := q.Get("type"); got != "2" {
		t.Errorf("one-way type = %q, want \"2\"", got)
	}
	if q.Get("return_date") != "" {
		t.Errorf("return_date should be empty for one-way, got %q", q.Get("return_date"))
	}
}

// rewriteTransport sends every request to target instead of the host the
// SerpAPI URL was built with. Path + query + headers are preserved.
type rewriteTransport struct {
	target string
}

func (t *rewriteTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	dst, err := url.Parse(t.target)
	if err != nil {
		return nil, err
	}
	req.URL.Scheme = dst.Scheme
	req.URL.Host = dst.Host
	return http.DefaultTransport.RoundTrip(req)
}
