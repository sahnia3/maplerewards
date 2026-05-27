package middleware

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"time"
)

// CSRF cookie/header constants. The cookie is non-httpOnly so the SPA can
// read it via document.cookie and echo the value into the header — this is
// the standard "double-submit cookie" pattern.
const (
	CSRFCookieName = "mr_csrf"
	CSRFHeaderName = "X-CSRF-Token"
	csrfTokenBytes = 32 // 256 bits of entropy
	csrfMaxAge     = 12 * 60 * 60
)

// CSRFProtect enforces a double-submit CSRF check on state-changing methods
// (POST/PUT/PATCH/DELETE). Safe methods (GET/HEAD/OPTIONS) pass through and
// also seed the cookie if the caller doesn't have one yet, so the SPA always
// has a token ready by the time it issues a write.
//
// Defense rationale: the double-submit header check is the primary defense and
// holds regardless of SameSite — an attacker on another origin can neither read
// the cookie nor set the custom header without a CORS-rejected preflight. (In
// prod the cookies are SameSite=None so they flow to the cross-origin API; in
// dev they are Lax. The header match, not SameSite, is what enforces CSRF.)
//
// CORS preflight bypass: an attacker can't read the cookie from a different
// origin, and they can't set a custom request header without triggering
// preflight (which our CORS config will reject) — so the header check is
// what makes this work even if SameSite is somehow bypassed.
func CSRFProtect(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Lazy seed: ensure a token exists in the cookie jar even on safe
		// requests, so the SPA can read it before its first POST.
		cookie, _ := r.Cookie(CSRFCookieName)
		token := ""
		if cookie != nil {
			token = cookie.Value
		}
		if token == "" {
			token = generateCSRFToken()
			setCSRFCookie(w, token)
		}

		// Read-only methods skip the comparison.
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			next.ServeHTTP(w, r)
			return
		}

		// State-changing methods: header MUST match cookie. Use constant-time
		// compare to avoid timing-oracle leaks (token isn't a secret, but the
		// habit is cheap and worth keeping consistent).
		header := r.Header.Get(CSRFHeaderName)
		if header == "" || cookie == nil || cookie.Value == "" ||
			subtle.ConstantTimeCompare([]byte(header), []byte(cookie.Value)) != 1 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]string{ //nolint:errcheck
				"code":    "CSRF_FAILED",
				"message": "missing or invalid CSRF token",
			})
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RotateCSRFCookie forces a fresh CSRF token. Call this from auth handlers
// on login, logout, and password-change to bind the token to the new auth
// state (defends against fixation: an attacker who knew the pre-login token
// can't re-use it post-login). Safe to call on every response — the cookie
// is replaced atomically.
func RotateCSRFCookie(w http.ResponseWriter) string {
	token := generateCSRFToken()
	setCSRFCookie(w, token)
	return token
}

// IssueCSRFTokenHandler is a tiny endpoint that ensures the caller has a
// fresh CSRF cookie and returns the token in the JSON body too. Useful for
// the SPA right after login or whenever it needs to refresh the token
// without having to parse document.cookie itself.
func IssueCSRFTokenHandler(w http.ResponseWriter, r *http.Request) {
	cookie, _ := r.Cookie(CSRFCookieName)
	token := ""
	if cookie != nil {
		token = cookie.Value
	}
	if token == "" {
		token = generateCSRFToken()
		setCSRFCookie(w, token)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"csrf_token": token}) //nolint:errcheck
}

func generateCSRFToken() string {
	b := make([]byte, csrfTokenBytes)
	if _, err := rand.Read(b); err != nil {
		// crypto/rand failure is catastrophic and effectively never happens on
		// a healthy host. Emitting a predictable (all-zero) token would
		// silently weaken CSRF, so fail loud instead — matching the init-time
		// posture used elsewhere for security primitives.
		panic("csrf: crypto/rand unavailable: " + err.Error())
	}
	return hex.EncodeToString(b)
}

func setCSRFCookie(w http.ResponseWriter, token string) {
	prod := strings.EqualFold(os.Getenv("APP_ENV"), "production")
	// Cross-origin SPA: the double-submit cookie must reach the API on
	// cross-site fetches, so in prod it is SameSite=None+Secure (matching the
	// auth cookies). Dev stays Lax (same-site localhost). The header check
	// remains the real protection — an attacker can't read this cookie
	// cross-origin nor set the custom header without a CORS-rejected preflight.
	sameSite := http.SameSiteLaxMode
	if prod {
		sameSite = http.SameSiteNoneMode
	}
	http.SetCookie(w, &http.Cookie{
		Name:     CSRFCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: false, // SPA must read it
		Secure:   prod,
		SameSite: sameSite,
		MaxAge:   csrfMaxAge,
		Expires:  time.Now().Add(time.Duration(csrfMaxAge) * time.Second),
	})
}
