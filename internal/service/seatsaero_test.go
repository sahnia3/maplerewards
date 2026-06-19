package service

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"maplerewards/internal/quota"
)

// fakeSeatsAeroJSON is the smallest valid Seats.aero Cached Search payload with
// one business-cabin (J) row available so the parser yields exactly one
// AwardItem. The test cares about parsing + the outgoing request, not the full
// response shape.
const fakeSeatsAeroJSON = `{
  "data": [
    {
      "ID": "row-1",
      "Route": {"OriginAirport":"YYZ","DestinationAirport":"LHR"},
      "Date": "2026-07-15",
      "JAvailable": true,
      "JMileageCost": "70000",
      "JRemainingSeats": 4,
      "JAirlines": "AC",
      "Source": "aeroplan"
    }
  ],
  "count": 1,
  "hasMore": false,
  "cursor": 0
}`

// TestSeatsAero_QuotaExhausted is the denial-of-wallet test: when the quota is
// exhausted, SearchAwards must return ErrSeatsAeroQuotaExhausted and make NO
// HTTP call, debiting exactly one "seatsaero" quota unit.
func TestSeatsAero_QuotaExhausted(t *testing.T) {
	qs := &stubQuota{
		spendFn: func(ctx context.Context, provider string, tier quota.Tier) (int, bool, error) {
			if provider != "seatsaero" {
				t.Errorf("unexpected provider: %s", provider)
			}
			return 0, true, nil
		},
	}
	svc := NewSeatsAeroService("test-key", qs)

	_, err := svc.SearchAwards(context.Background(), "YYZ", "LHR", "2026-07-15", "2026-07-15", "business", []string{"aeroplan"})
	if err == nil {
		t.Fatalf("expected error when quota exhausted")
	}
	if !errors.Is(err, ErrSeatsAeroQuotaExhausted) {
		t.Fatalf("expected ErrSeatsAeroQuotaExhausted, got %v", err)
	}
	if len(qs.calls) != 1 || qs.calls[0] != "seatsaero" {
		t.Fatalf("expected one seatsaero quota spend, got %v", qs.calls)
	}
}

// TestSeatsAero_QuotaInfraError_FailsClosed: a quota system error must deny the
// paid call (fail-closed) and make NO HTTP request.
func TestSeatsAero_QuotaInfraError_FailsClosed(t *testing.T) {
	var hits int
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		fmt.Fprint(w, fakeSeatsAeroJSON) //nolint:errcheck
	}))
	defer ts.Close()

	qs := &stubQuota{
		spendFn: func(ctx context.Context, provider string, tier quota.Tier) (int, bool, error) {
			return 0, false, errors.New("redis down")
		},
	}
	svc := NewSeatsAeroService("test-key", qs)
	svc.client = &http.Client{Transport: &rewriteTransport{target: ts.URL}}

	_, err := svc.SearchAwards(context.Background(), "YYZ", "LHR", "2026-07-15", "2026-07-15", "business", []string{"aeroplan"})
	if !errors.Is(err, ErrSeatsAeroQuotaExhausted) {
		t.Fatalf("expected ErrSeatsAeroQuotaExhausted (fail-closed), got %v", err)
	}
	if hits != 0 {
		t.Fatalf("fail-closed must skip the HTTP call, but server was hit %d times", hits)
	}
}

// TestSeatsAero_SearchAwards_HappyPath parses a valid response into one
// AwardItem and asserts the outgoing request carried the auth header and the
// expected query parameters.
func TestSeatsAero_SearchAwards_HappyPath(t *testing.T) {
	var (
		gotAuth string
		gotURL  string
	)
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Partner-Authorization")
		gotURL = r.URL.String()
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, fakeSeatsAeroJSON) //nolint:errcheck
	}))
	defer ts.Close()

	qs := &stubQuota{}
	svc := NewSeatsAeroService("test-key", qs)
	svc.client = &http.Client{Transport: &rewriteTransport{target: ts.URL}}

	items, err := svc.SearchAwards(context.Background(), "YYZ", "LHR", "2026-07-15", "2026-07-15", "business", []string{"aeroplan"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 award item, got %d", len(items))
	}
	it := items[0]
	if it.Issuer != "aeroplan" {
		t.Errorf("Issuer = %q, want aeroplan", it.Issuer)
	}
	if it.MileageCost != 70000 {
		t.Errorf("MileageCost = %d, want 70000", it.MileageCost)
	}
	if it.SeatsAvailable != 4 {
		t.Errorf("SeatsAvailable = %d, want 4", it.SeatsAvailable)
	}
	if it.Cabin != "business" {
		t.Errorf("Cabin = %q, want business", it.Cabin)
	}
	if it.TaxesCash != nil {
		t.Errorf("TaxesCash = %v, want nil (Seats.aero never returns taxes)", *it.TaxesCash)
	}
	if it.TaxesIncluded {
		t.Errorf("TaxesIncluded = true, want false")
	}

	// Outgoing request assertions.
	if gotAuth != "test-key" {
		t.Errorf("Partner-Authorization = %q, want test-key", gotAuth)
	}
	parsed, err := url.Parse(gotURL)
	if err != nil {
		t.Fatalf("parse captured URL: %v", err)
	}
	q := parsed.Query()
	if got := q.Get("origin_airport"); got != "YYZ" {
		t.Errorf("origin_airport = %q, want YYZ", got)
	}
	if got := q.Get("destination_airport"); got != "LHR" {
		t.Errorf("destination_airport = %q, want LHR", got)
	}
	if got := q.Get("cabins"); got != "business" {
		t.Errorf("cabins = %q, want business", got)
	}
	if got := q.Get("sources"); got != "aeroplan" {
		t.Errorf("sources = %q, want aeroplan", got)
	}
	// One quota unit should have been debited under the "seatsaero" provider.
	if len(qs.calls) != 1 || qs.calls[0] != "seatsaero" {
		t.Errorf("expected one seatsaero quota spend, got %v", qs.calls)
	}
}

// TestSeatsAero_NilQuota_Unmetered: a nil quota client skips the spend gate and
// still makes the HTTP call without panicking.
func TestSeatsAero_NilQuota_Unmetered(t *testing.T) {
	var hits int
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		fmt.Fprint(w, fakeSeatsAeroJSON) //nolint:errcheck
	}))
	defer ts.Close()

	svc := NewSeatsAeroService("test-key", nil)
	svc.client = &http.Client{Transport: &rewriteTransport{target: ts.URL}}

	items, err := svc.SearchAwards(context.Background(), "YYZ", "LHR", "2026-07-15", "2026-07-15", "business", []string{"aeroplan"})
	if err != nil {
		t.Fatalf("unexpected error with nil quota: %v", err)
	}
	if hits != 1 {
		t.Fatalf("nil quota should still call the API once, got %d hits", hits)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 award item, got %d", len(items))
	}
}

// TestSeatsAero_Non200_Error: a non-200 upstream status returns an error.
func TestSeatsAero_Non200_Error(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, `{"error":"boom"}`) //nolint:errcheck
	}))
	defer ts.Close()

	svc := NewSeatsAeroService("test-key", &stubQuota{})
	svc.client = &http.Client{Transport: &rewriteTransport{target: ts.URL}}

	if _, err := svc.SearchAwards(context.Background(), "YYZ", "LHR", "2026-07-15", "2026-07-15", "business", []string{"aeroplan"}); err == nil {
		t.Fatalf("expected error on non-200 status, got nil")
	}
}

// TestSeatsAero_IsAvailable: an empty key reports unavailable and SearchAwards
// errors before touching the quota; a configured key reports available.
func TestSeatsAero_IsAvailable(t *testing.T) {
	if NewSeatsAeroService("", nil).IsAvailable() {
		t.Errorf("empty key: IsAvailable() = true, want false")
	}
	if !NewSeatsAeroService("k", nil).IsAvailable() {
		t.Errorf("configured key: IsAvailable() = false, want true")
	}

	qs := &stubQuota{}
	svc := NewSeatsAeroService("", qs)
	if _, err := svc.SearchAwards(context.Background(), "YYZ", "LHR", "2026-07-15", "2026-07-15", "business", []string{"aeroplan"}); err == nil {
		t.Fatalf("expected error when key not configured")
	}
	if len(qs.calls) != 0 {
		t.Fatalf("unavailable service must not debit quota, got %v", qs.calls)
	}
}
