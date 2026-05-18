package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

// P0.5 (docs/LAUNCH-ISSUES.md): the promo feed must geo-filter to Canada and
// never surface a dead "SOURCE" link.

func TestIsCanadianProgram(t *testing.T) {
	cases := map[string]bool{
		"aeroplan":         true,
		"amex-mr-ca":       true,
		"flying-blue":      true,
		"  Aeroplan  ":     true, // trim + case tolerant
		"citi-aadvantage":  false, // US — the founder's exact leak
		"chase-ur":         false,
		"":                 false,
		"random-garbage":   false,
	}
	for slug, want := range cases {
		if got := isCanadianProgram(slug); got != want {
			t.Errorf("isCanadianProgram(%q) = %v, want %v", slug, got, want)
		}
	}
}

func TestSourceURLLive(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/ok":
			w.WriteHeader(http.StatusOK)
		case "/gone":
			w.WriteHeader(http.StatusNotFound) // dead article — the P0.5 bug
		case "/head405":
			if r.Method == http.MethodHead {
				w.WriteHeader(http.StatusMethodNotAllowed) // many sites block HEAD
				return
			}
			w.WriteHeader(http.StatusOK) // GET fallback succeeds → live
		default:
			w.WriteHeader(http.StatusInternalServerError)
		}
	}))
	defer srv.Close()

	client := srv.Client()
	ctx := context.Background()
	cases := []struct {
		path string
		want bool
	}{
		{"/ok", true},
		{"/gone", false},
		{"/head405", true}, // HEAD 405 → GET 200 fallback
	}
	for _, c := range cases {
		if got := sourceURLLive(ctx, client, srv.URL+c.path); got != c.want {
			t.Errorf("sourceURLLive(%s) = %v, want %v", c.path, got, c.want)
		}
	}
	// Unreachable host must be treated as dead, not live.
	if sourceURLLive(ctx, client, "http://127.0.0.1:0/never") {
		t.Error("sourceURLLive on an unreachable URL must be false")
	}
}
