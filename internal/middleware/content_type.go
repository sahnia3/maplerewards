package middleware

import (
	"net/http"
	"strings"
)

// RequireJSONContentType rejects state-changing requests whose body is not
// application/json. This is a CSRF defense for the cookie-authenticated
// mutation routes that intentionally do NOT carry the double-submit CSRF token
// (/chat, /chat/stream, /wallet, /optimize, /recommend, /trip/*): a malicious
// cross-origin HTML <form> can only send application/x-www-form-urlencoded,
// multipart/form-data, or text/plain (it cannot set application/json without a
// CORS preflight, which the strict allow-list denies), so it is rejected here.
// Same-origin SPA fetches already send application/json, so this is transparent
// to legitimate callers. Read-only methods pass through untouched.
func RequireJSONContentType(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
			ct := r.Header.Get("Content-Type")
			if i := strings.IndexByte(ct, ';'); i >= 0 {
				ct = ct[:i] // strip "; charset=utf-8"
			}
			if !strings.EqualFold(strings.TrimSpace(ct), "application/json") {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnsupportedMediaType)
				w.Write([]byte(`{"code":"UNSUPPORTED_MEDIA_TYPE","message":"Content-Type must be application/json"}`)) //nolint:errcheck
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
