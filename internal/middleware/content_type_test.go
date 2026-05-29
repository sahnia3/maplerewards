package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRequireJSONContentType(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	h := RequireJSONContentType(next)

	cases := []struct {
		name        string
		method      string
		contentType string
		wantStatus  int
	}{
		{"POST json passes", http.MethodPost, "application/json", http.StatusOK},
		{"POST json with charset passes", http.MethodPost, "application/json; charset=utf-8", http.StatusOK},
		{"POST form rejected", http.MethodPost, "application/x-www-form-urlencoded", http.StatusUnsupportedMediaType},
		{"POST text rejected", http.MethodPost, "text/plain", http.StatusUnsupportedMediaType},
		{"POST empty content-type rejected", http.MethodPost, "", http.StatusUnsupportedMediaType},
		{"PUT form rejected", http.MethodPut, "multipart/form-data", http.StatusUnsupportedMediaType},
		{"DELETE form rejected", http.MethodDelete, "text/plain", http.StatusUnsupportedMediaType},
		// Read-only methods pass through regardless of content type.
		{"GET passes without content-type", http.MethodGet, "", http.StatusOK},
		{"HEAD passes", http.MethodHead, "text/plain", http.StatusOK},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			req := httptest.NewRequest(c.method, "/x", nil)
			if c.contentType != "" {
				req.Header.Set("Content-Type", c.contentType)
			}
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code != c.wantStatus {
				t.Errorf("%s %q: got %d, want %d", c.method, c.contentType, rec.Code, c.wantStatus)
			}
		})
	}
}
