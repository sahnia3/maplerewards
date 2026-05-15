package middleware

import (
	"net/http"
)

// BodyLimit returns a middleware that caps request body size. `maxBytes`
// applies to every request flowing through this middleware. Use small caps
// for JSON-only endpoints (JSONBodyLimit) and larger ones for CSV upload
// paths via a dedicated mount.
//
// The standard library's http.MaxBytesReader enforces the limit at read
// time — handlers using json.NewDecoder(r.Body).Decode will see a
// "http: request body too large" error if the limit is exceeded.
func BodyLimit(maxBytes int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
			next.ServeHTTP(w, r)
		})
	}
}

// Common sizes for the codebase's request shapes. Tuned to fit realistic
// payloads with margin, but small enough that a malicious uploader can't
// blow up memory.
const (
	BodyLimitJSON = 1 << 20  // 1 MB — chat, wallet, auth, optimizer, trip
	BodyLimitCSV  = 5 << 20  // 5 MB — CSV import preview/commit
	BodyLimitAI   = 64 << 10 // 64 KB — single AI chat message
)
