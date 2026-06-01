package service

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// This is the INTEGRATION/stress companion to apify_awards_test.go. The unit
// battery proves the bare parser (parseApifyResults) is panic-proof. This file
// proves the SURROUNDING WIRING is panic-proof too: it drives the REAL
// SearchAwards service path the live routes use —
//
//	startRun (POST /acts/{id}/runs) → pollUntilDone (GET /actor-runs/{id}) →
//	fetchDataset (GET /datasets/{id}/items) → parseApifyResults → []AwardItem
//
// against an httptest.Server that stands in for api.apify.com. We cross a
// matrix of routes × cabins × trip "conversions" (one-way/return, near/far
// dates) WITH a battery of adversarial dataset bodies (valid, drifted field
// types, missing/null fields, truncated JSON, empty array, total garbage, and
// a non-200 dataset response). For EVERY combination we assert:
//
//   - the call does not panic (an unrecovered panic fails the -race run), and
//   - it does not leak a raw internal error to the caller, and
//   - it yields a sane (possibly empty, never nil-deref) []AwardItem.
//
// The httptest seam is wired via the unexported baseURL/pollInterval fields on
// ApifyAwardService — both default to the exact production values, so this test
// is the ONLY thing that ever points the service away from api.apify.com.

// newStubbedApifyService returns an ApifyAwardService whose run/poll/dataset
// calls hit srv instead of the real Apify API, with the poll interval shrunk so
// the loop completes in milliseconds. quota is nil (cap skipped, as in the
// other service tests).
func newStubbedApifyService(srvURL string) *ApifyAwardService {
	s := NewApifyAwardService("test-token", nil)
	s.baseURL = strings.TrimSuffix(srvURL, "/")
	s.pollInterval = time.Millisecond // poll fast so subtests stay quick
	// Keep the client snappy so a misbehaving stub can't hang the suite.
	s.client = &http.Client{Timeout: 10 * time.Second}
	return s
}

// apifyStub is a configurable fake Apify backend. It always succeeds the
// run-actor and poll steps (those are exercised separately below) and returns
// the configured body/status for the dataset-items step — that is where the
// adversarial payloads land. routes are matched by URL path prefix so the
// handler stays trivial and panic-free regardless of input.
type apifyStub struct {
	datasetStatus int    // HTTP status for /datasets/.../items
	datasetBody   string // raw body for /datasets/.../items (may be garbage)

	runCalls     int32
	pollCalls    int32
	datasetCalls int32
}

func (st *apifyStub) handler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		switch {
		// Start actor run: POST /acts/{actorID}/runs → 201 + run envelope.
		case strings.HasSuffix(r.URL.Path, "/runs") && r.Method == http.MethodPost:
			atomic.AddInt32(&st.runCalls, 1)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`{"data":{"id":"RUN123","status":"READY","defaultDatasetId":"DS123"}}`))

		// Poll run status: GET /actor-runs/{runID} → SUCCEEDED immediately.
		case strings.Contains(r.URL.Path, "/actor-runs/") && r.Method == http.MethodGet:
			atomic.AddInt32(&st.pollCalls, 1)
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"data":{"id":"RUN123","status":"SUCCEEDED","defaultDatasetId":"DS123"}}`))

		// Fetch dataset items: GET /datasets/{id}/items → configured payload.
		case strings.Contains(r.URL.Path, "/datasets/") && r.Method == http.MethodGet:
			atomic.AddInt32(&st.datasetCalls, 1)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(st.datasetStatus)
			_, _ = w.Write([]byte(st.datasetBody))

		default:
			http.NotFound(w, r)
		}
	}
}

// route is one origin/destination pair in the stress matrix.
type route struct {
	name        string
	origin      string
	destination string
}

// conversion is a trip "shape": one-way vs return, plus a near/mid date offset
// inside the 60-day window (dates beyond 60 days are rejected before any HTTP,
// which is asserted separately in TestSearchAwards_DateBeyond60Days).
type conversion struct {
	name      string
	startDays int // days from now for startDate
	endDays   int // days from now for endDate; <0 means one-way (empty endDate)
}

// payloadCase is one adversarial dataset response shape. wantStatus is the HTTP
// status the stub returns for the dataset endpoint.
type payloadCase struct {
	name       string
	wantStatus int
	body       string
}

// adversarialPayloads is the dataset-response battery crossed with every
// route×cabin×conversion. It mirrors the spec: valid baseline, drifted field
// types, missing/null fields, truncated JSON, empty array, total garbage, and a
// non-200 from the dataset endpoint. {ORIGIN}/{DEST}/{CABIN} are substituted
// per combination so the valid baseline actually matches the requested cabin.
var adversarialPayloads = []payloadCase{
	{
		name:       "valid baseline",
		wantStatus: http.StatusOK,
		body: `[{
			"date":"2026-06-20","issuer":"aeroplan","origin":"{ORIGIN}","destination":"{DEST}",
			"itineraries":[{
				"cabins":[{"name":"{CABIN}","mileageCost":60000,"totalTaxes":12050,"remainingSeats":4}],
				"segments":[{"origin":"{ORIGIN}","destination":"{DEST}","flightNumber":"AC001","departure":"2026-06-20T10:00","arrival":"2026-06-21T14:00","aircraftName":"Boeing 787"}]
			}]
		}]`,
	},
	{
		name:       "drifted numbers-as-strings",
		wantStatus: http.StatusOK,
		// mileageCost / totalTaxes / remainingSeats arrive as STRINGS (a real
		// observed drift). getInt tolerates "60000"; must still parse, no panic.
		body: `[{
			"date":"2026-06-20","issuer":"aeroplan","origin":"{ORIGIN}","destination":"{DEST}",
			"itineraries":[{
				"cabins":[{"name":"{CABIN}","mileageCost":"60000","totalTaxes":"12050","remainingSeats":"4"}],
				"segments":[{"origin":"{ORIGIN}","destination":"{DEST}","flightNumber":12345,"departure":"2026-06-20T10:00"}]
			}]
		}]`,
	},
	{
		name:       "drifted arrays-as-objects",
		wantStatus: http.StatusOK,
		// itineraries / cabins / segments arrive as OBJECTS where arrays are
		// expected. getSlice returns nil → zero iterations, no deref, no panic.
		body: `[{
			"date":"2026-06-20","issuer":"aeroplan","origin":"{ORIGIN}","destination":"{DEST}",
			"itineraries":{"cabins":{"name":"{CABIN}","mileageCost":60000},"segments":{"flightNumber":"AC1"}},
			"cabins":{"name":"{CABIN}","mileage":55000}
		}]`,
	},
	{
		name:       "missing and null fields",
		wantStatus: http.StatusOK,
		body: `[
			{"date":null,"issuer":null,"itineraries":null,"cabins":null},
			{"origin":"{ORIGIN}"},
			{"itineraries":[{"cabins":[{"name":null,"mileageCost":null}],"segments":[{}]}]},
			{"itineraries":[{"cabins":[{"name":"{CABIN}","mileageCost":0}]}]}
		]`,
	},
	{
		name:       "route-level cabin fallback",
		wantStatus: http.StatusOK,
		// No itinerary cabins; the route-level cabins[] summary is the only
		// match (pickCabin's fallback branch).
		body: `[{
			"date":"2026-06-22","issuer":"united","origin":"{ORIGIN}","destination":"{DEST}",
			"cabins":[{"name":"{CABIN}","mileage":70000,"taxes":8000,"available":true}]
		}]`,
	},
	{
		name:       "truncated JSON",
		wantStatus: http.StatusOK,
		body:       `[{"date":"2026-06-20","issuer":"aeroplan","itineraries":[{"cabins":[{"name":"`,
	},
	{
		name:       "empty array",
		wantStatus: http.StatusOK,
		body:       `[]`,
	},
	{
		name:       "total garbage",
		wantStatus: http.StatusOK,
		body:       `}{not json <<< at all &&& %%%`,
	},
	{
		name:       "envelope with hostile inner items",
		wantStatus: http.StatusOK,
		body:       `{"items":[null,1,"x",[],{"itineraries":42,"cabins":"nope"}]}`,
	},
	{
		name:       "dataset HTTP 500",
		wantStatus: http.StatusInternalServerError,
		body:       `{"error":{"type":"internal-error","message":"boom"}}`,
	},
	{
		name:       "dataset HTTP 429 rate limited",
		wantStatus: http.StatusTooManyRequests,
		body:       `{"error":{"type":"rate-limit-exceeded"}}`,
	},
	{
		name:       "dataset 200 but empty body",
		wantStatus: http.StatusOK,
		body:       ``,
	},
}

var stressRoutes = []route{
	{"YYZ_NRT", "YYZ", "NRT"},
	{"YVR_LHR", "YVR", "LHR"},
	{"JFK_CDG", "JFK", "CDG"},
}

var stressCabins = []string{"economy", "business", "first"}

func stressConversions() []conversion {
	return []conversion{
		{"oneway_near", 10, -1}, // one-way, ~10 days out
		{"return_mid", 20, 35},  // return, both legs inside 60 days
		{"oneway_edge", 55, -1}, // one-way near the 60-day edge
	}
}

// apifyDateStr renders an offset (days from now) into the actor's YYYY-MM-DD
// format. A negative offset yields "" (used to express a one-way trip's empty
// endDate). Named distinctly from the package's other dateStr helper.
func apifyDateStr(daysFromNow int) string {
	if daysFromNow < 0 {
		return ""
	}
	return time.Now().AddDate(0, 0, daysFromNow).Format("2006-01-02")
}

// TestSearchAwards_NoPanicMatrix is the core stress test. It crosses every
// route × cabin × conversion × adversarial dataset payload and asserts the full
// SearchAwards path never panics, never leaks an internal error, and always
// returns a sane (possibly empty) slice. Each combination is its own subtest so
// a failure pinpoints the exact (route, cabin, conversion, payload) tuple.
func TestSearchAwards_NoPanicMatrix(t *testing.T) {
	combos := 0
	for _, rt := range stressRoutes {
		for _, cabin := range stressCabins {
			for _, conv := range stressConversions() {
				for _, pc := range adversarialPayloads {
					rt, cabin, conv, pc := rt, cabin, conv, pc
					name := fmt.Sprintf("%s/%s/%s/%s", rt.name, cabin, conv.name, pc.name)
					combos++
					t.Run(name, func(t *testing.T) {
						// Substitute route/cabin into the payload template so the
						// "valid" cases actually match the requested cabin/route.
						body := pc.body
						body = strings.ReplaceAll(body, "{ORIGIN}", rt.origin)
						body = strings.ReplaceAll(body, "{DEST}", rt.destination)
						body = strings.ReplaceAll(body, "{CABIN}", cabin)

						stub := &apifyStub{datasetStatus: pc.wantStatus, datasetBody: body}
						srv := httptest.NewServer(stub.handler())
						defer srv.Close()

						svc := newStubbedApifyService(srv.URL)

						ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
						defer cancel()

						items, err := svc.SearchAwards(
							ctx,
							rt.origin, rt.destination,
							apifyDateStr(conv.startDays), apifyDateStr(conv.endDays),
							cabin,
							[]string{"aeroplan", "united"},
						)

						// 1. Sane result: items is usable (len works on nil; the
						//    point is no nil-map deref / index-out-of-range leaked
						//    out of the parse path, which -race + recover catch).
						for i, it := range items {
							if it.MileageCost < 0 {
								t.Errorf("item %d has negative mileage %d", i, it.MileageCost)
							}
							// Segments must be range-safe (nil is fine).
							_ = it.Segments
						}

						// 2. No leaked INTERNAL error. The dataset-error cases
						//    legitimately return a wrapped "fetch dataset" error;
						//    that is the documented graceful-degradation contract
						//    (award_search treats it as "no Apify results"), and
						//    it must NOT carry a stack trace, file path, or the
						//    bearer token.
						if err != nil {
							assertNoLeak(t, err.Error())
						}

						// 3. Error vs results expectation by payload class.
						isDatasetErr := pc.wantStatus != http.StatusOK
						if isDatasetErr {
							if err == nil {
								t.Errorf("expected a graceful error for dataset HTTP %d, got nil (items=%d)",
									pc.wantStatus, len(items))
							}
							if len(items) != 0 {
								t.Errorf("expected no items on dataset HTTP %d, got %d", pc.wantStatus, len(items))
							}
						} else {
							// A 200 (even with garbage/empty/drifted body) must
							// NEVER produce an error — it degrades to a slice.
							if err != nil {
								t.Errorf("200 dataset response produced an error: %v", err)
							}
						}
					})
				}
			}
		}
	}
	t.Logf("stress matrix executed: %d routes × %d cabins × %d conversions × %d payload shapes = %d combinations",
		len(stressRoutes), len(stressCabins), len(stressConversions()), len(adversarialPayloads), combos)
}

// TestSearchAwards_ValidBaselineParses is a positive control: with a clean,
// matching dataset body the full path must actually surface a populated
// AwardItem (mileage, taxes, seats, segments). If this regresses, the matrix
// above could be "green" simply because everything returns empty.
func TestSearchAwards_ValidBaselineParses(t *testing.T) {
	body := `[{
		"date":"2026-06-20","issuer":"aeroplan","origin":"YYZ","destination":"NRT",
		"itineraries":[{
			"cabins":[{"name":"business","mileageCost":75000,"totalTaxes":15075,"remainingSeats":3}],
			"segments":[{"origin":"YYZ","destination":"NRT","flightNumber":"AC001","departure":"2026-06-20T13:00","arrival":"2026-06-21T16:00","aircraftName":"Boeing 787-9"}]
		}]
	}]`
	stub := &apifyStub{datasetStatus: http.StatusOK, datasetBody: body}
	srv := httptest.NewServer(stub.handler())
	defer srv.Close()

	svc := newStubbedApifyService(srv.URL)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	items, err := svc.SearchAwards(ctx, "YYZ", "NRT", apifyDateStr(19), "", "business", []string{"aeroplan"})
	if err != nil {
		t.Fatalf("valid baseline returned error: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("valid baseline: want 1 item, got %d", len(items))
	}
	got := items[0]
	if got.MileageCost != 75000 {
		t.Errorf("mileage: want 75000, got %d", got.MileageCost)
	}
	if got.TaxesCash == nil || *got.TaxesCash != 150.75 {
		t.Errorf("taxes: want 150.75, got %v", got.TaxesCash)
	}
	if got.SeatsAvailable != 3 {
		t.Errorf("seats: want 3, got %d", got.SeatsAvailable)
	}
	if got.Cabin != "business" {
		t.Errorf("cabin: want business, got %q", got.Cabin)
	}
	if len(got.Segments) != 1 || got.Segments[0].FlightNumber != "AC001" {
		t.Errorf("segments not parsed: %+v", got.Segments)
	}
	// Verify all three upstream steps were actually exercised (not short-circuited).
	if stub.runCalls == 0 || stub.pollCalls == 0 || stub.datasetCalls == 0 {
		t.Errorf("not all steps hit: run=%d poll=%d dataset=%d",
			stub.runCalls, stub.pollCalls, stub.datasetCalls)
	}
}

// TestSearchAwards_DrifedNumbersAsStringsParses confirms the string-typed
// numeric drift (the exact failure class that motivated the hardening) still
// produces a usable item through the FULL path, not just the unit parser.
func TestSearchAwards_DrifedNumbersAsStringsParses(t *testing.T) {
	body := `[{
		"date":"2026-06-20","issuer":"aeroplan","origin":"YVR","destination":"LHR",
		"itineraries":[{
			"cabins":[{"name":"economy","mileageCost":"35000","totalTaxes":"9900","remainingSeats":"6"}],
			"segments":[{"origin":"YVR","destination":"LHR","flightNumber":"AC850"}]
		}]
	}]`
	stub := &apifyStub{datasetStatus: http.StatusOK, datasetBody: body}
	srv := httptest.NewServer(stub.handler())
	defer srv.Close()

	svc := newStubbedApifyService(srv.URL)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	items, err := svc.SearchAwards(ctx, "YVR", "LHR", apifyDateStr(15), "", "economy", []string{"aeroplan"})
	if err != nil {
		t.Fatalf("drifted-string body returned error: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("want 1 item from string-typed numerics, got %d", len(items))
	}
	if items[0].MileageCost != 35000 {
		t.Errorf("mileage from string: want 35000, got %d", items[0].MileageCost)
	}
	if items[0].TaxesCash == nil || *items[0].TaxesCash != 99.0 {
		t.Errorf("taxes from string: want 99.0, got %v", items[0].TaxesCash)
	}
}

// TestSearchAwards_PollDegradesGracefully drives the poll loop against hostile
// status responses and asserts graceful degradation (a returned error, never a
// panic, never a leaked internal). Covers: run-actor itself failing, the poll
// reporting a terminal FAILED state, and the poll never reaching SUCCEEDED
// before the (short) deadline.
func TestSearchAwards_PollDegradesGracefully(t *testing.T) {
	t.Run("run-actor non-201", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.HasSuffix(r.URL.Path, "/runs") {
				w.WriteHeader(http.StatusUnauthorized)
				_, _ = w.Write([]byte(`{"error":{"type":"token-not-found"}}`))
				return
			}
			http.NotFound(w, r)
		}))
		defer srv.Close()

		svc := newStubbedApifyService(srv.URL)
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()

		items, err := svc.SearchAwards(ctx, "YYZ", "NRT", apifyDateStr(10), "", "economy", nil)
		if err == nil {
			t.Fatal("expected error when run-actor returns 401, got nil")
		}
		if len(items) != 0 {
			t.Errorf("expected no items on run failure, got %d", len(items))
		}
		assertNoLeak(t, err.Error())
	})

	t.Run("poll reports FAILED", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch {
			case strings.HasSuffix(r.URL.Path, "/runs"):
				w.WriteHeader(http.StatusCreated)
				_, _ = w.Write([]byte(`{"data":{"id":"R1","status":"READY","defaultDatasetId":"D1"}}`))
			case strings.Contains(r.URL.Path, "/actor-runs/"):
				_, _ = w.Write([]byte(`{"data":{"id":"R1","status":"FAILED"}}`))
			default:
				http.NotFound(w, r)
			}
		}))
		defer srv.Close()

		svc := newStubbedApifyService(srv.URL)
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()

		items, err := svc.SearchAwards(ctx, "YYZ", "NRT", apifyDateStr(10), "", "economy", nil)
		if err == nil {
			t.Fatal("expected error when poll reports FAILED, got nil")
		}
		if len(items) != 0 {
			t.Errorf("expected no items on FAILED run, got %d", len(items))
		}
		assertNoLeak(t, err.Error())
	})

	t.Run("poll never succeeds before deadline", func(t *testing.T) {
		var polls int32
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch {
			case strings.HasSuffix(r.URL.Path, "/runs"):
				w.WriteHeader(http.StatusCreated)
				_, _ = w.Write([]byte(`{"data":{"id":"R1","status":"READY","defaultDatasetId":"D1"}}`))
			case strings.Contains(r.URL.Path, "/actor-runs/"):
				atomic.AddInt32(&polls, 1)
				_, _ = w.Write([]byte(`{"data":{"id":"R1","status":"RUNNING"}}`)) // never SUCCEEDED
			default:
				http.NotFound(w, r)
			}
		}))
		defer srv.Close()

		svc := newStubbedApifyService(srv.URL)
		// pollUntilDone uses a hard-coded 150s budget internally; cancel via ctx
		// so the test doesn't actually wait. A cancelled ctx makes pollUntilDone
		// return ctx.Err(); SearchAwards wraps it. No panic, graceful error.
		ctx, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
		defer cancel()

		items, err := svc.SearchAwards(ctx, "YYZ", "NRT", apifyDateStr(10), "", "economy", nil)
		if err == nil {
			t.Fatal("expected error when run never succeeds, got nil")
		}
		if len(items) != 0 {
			t.Errorf("expected no items, got %d", len(items))
		}
		assertNoLeak(t, err.Error())
		if atomic.LoadInt32(&polls) == 0 {
			t.Error("expected the poll loop to run at least once")
		}
	})

	t.Run("poll returns garbage then succeeds", func(t *testing.T) {
		var polls int32
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch {
			case strings.HasSuffix(r.URL.Path, "/runs"):
				w.WriteHeader(http.StatusCreated)
				_, _ = w.Write([]byte(`{"data":{"id":"R1","status":"READY","defaultDatasetId":"D1"}}`))
			case strings.Contains(r.URL.Path, "/actor-runs/"):
				// First poll: unparseable garbage (must be tolerated, loop
				// continues). Second poll: SUCCEEDED.
				if atomic.AddInt32(&polls, 1) == 1 {
					_, _ = w.Write([]byte(`}{ totally broken`))
					return
				}
				_, _ = w.Write([]byte(`{"data":{"id":"R1","status":"SUCCEEDED","defaultDatasetId":"D1"}}`))
			case strings.Contains(r.URL.Path, "/datasets/"):
				_, _ = w.Write([]byte(`[]`))
			default:
				http.NotFound(w, r)
			}
		}))
		defer srv.Close()

		svc := newStubbedApifyService(srv.URL)
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		items, err := svc.SearchAwards(ctx, "YYZ", "NRT", apifyDateStr(10), "", "economy", nil)
		if err != nil {
			t.Fatalf("garbage-then-success poll should degrade to empty success, got err: %v", err)
		}
		if len(items) != 0 {
			t.Errorf("empty dataset after success: want 0 items, got %d", len(items))
		}
	})
}

// TestSearchAwards_DateBeyond60Days confirms the cheap pre-flight guard: a
// start date past the 60-day actor window returns an error WITHOUT making any
// HTTP call (the stub must see zero traffic).
func TestSearchAwards_DateBeyond60Days(t *testing.T) {
	stub := &apifyStub{datasetStatus: http.StatusOK, datasetBody: `[]`}
	srv := httptest.NewServer(stub.handler())
	defer srv.Close()

	svc := newStubbedApifyService(srv.URL)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	far := time.Now().AddDate(0, 0, 90).Format("2006-01-02")
	items, err := svc.SearchAwards(ctx, "YYZ", "NRT", far, "", "economy", nil)
	if err == nil {
		t.Fatal("expected error for a date beyond the 60-day window, got nil")
	}
	if len(items) != 0 {
		t.Errorf("expected no items, got %d", len(items))
	}
	if atomic.LoadInt32(&stub.runCalls) != 0 {
		t.Errorf("60-day guard should fire before any HTTP call; run was hit %d times", stub.runCalls)
	}
	assertNoLeak(t, err.Error())
}

// TestSearchAwards_TokenGate confirms the IsAvailable gate: with no token,
// SearchAwards returns an error and makes no HTTP call.
func TestSearchAwards_TokenGate(t *testing.T) {
	stub := &apifyStub{datasetStatus: http.StatusOK, datasetBody: `[]`}
	srv := httptest.NewServer(stub.handler())
	defer srv.Close()

	svc := NewApifyAwardService("", nil) // no token
	svc.baseURL = strings.TrimSuffix(srv.URL, "/")
	svc.pollInterval = time.Millisecond

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	_, err := svc.SearchAwards(ctx, "YYZ", "NRT", apifyDateStr(10), "", "economy", nil)
	if err == nil {
		t.Fatal("expected error when APIFY_TOKEN is unset, got nil")
	}
	if atomic.LoadInt32(&stub.runCalls) != 0 {
		t.Errorf("token gate should fire before any HTTP call; run was hit %d times", stub.runCalls)
	}
}

// assertNoLeak fails if a client-facing error string carries something that
// looks like an internal detail: a stack-trace marker, an absolute source
// path, or the bearer token. The graceful-degradation contract is that
// SearchAwards errors are safe to log/propagate without leaking secrets.
func assertNoLeak(t *testing.T, msg string) {
	t.Helper()
	lower := strings.ToLower(msg)
	for _, bad := range []string{
		"test-token",     // the bearer credential must never appear
		"goroutine ",     // stack-trace marker
		".go:",           // source file:line
		"/users/",        // absolute dev path
		"runtime error:", // a raw panic string surfacing
	} {
		if strings.Contains(lower, bad) {
			t.Errorf("error string leaks internal detail %q: %s", bad, msg)
		}
	}
}
