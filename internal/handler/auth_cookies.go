package handler

import (
	"net/http"
	"os"
	"strings"
	"time"

	mw "maplerewards/internal/middleware"
	"maplerewards/internal/model"
)

// setTokenCookies writes the access + refresh tokens as httpOnly cookies in
// addition to the JSON response body. Frontend that reads tokens from the body
// keeps working; frontend that uses `credentials: include` on fetch picks up
// the cookies automatically without ever exposing the JWT to JavaScript.
//
// Cookie security profile:
//   - httpOnly:  true               — XSS can't read the JWT
//   - Secure:    true in production — only sent over HTTPS
//   - SameSite:  None+Secure in production (cross-origin SPA); Lax in dev
//   - Path:      "/"
//   - MaxAge:    matches the underlying token lifetimes
func setTokenCookies(w http.ResponseWriter, tokens *model.TokenPair) {
	if tokens == nil {
		return
	}
	prod := strings.EqualFold(os.Getenv("APP_ENV"), "production")

	// The frontend is a distinct origin from the API (CORS, no BFF — the SPA
	// fetches an absolute NEXT_PUBLIC_API_URL). SameSite=Lax cookies are NOT
	// sent on cross-site subresource (fetch/XHR) requests, so in production the
	// auth cookies must be SameSite=None to flow at all, paired with Secure
	// (HTTPS, already enforced) which None requires. Dev stays Lax+non-Secure:
	// localhost:3000→:8080 is same-site, and None needs Secure that dev HTTP
	// can't provide. Cross-site exposure is contained by the strict CORS
	// allow-list + CSRF double-submit on every state-changing route.
	sameSite := http.SameSiteLaxMode
	secure := false
	if prod {
		sameSite = http.SameSiteNoneMode
		secure = true
	}

	access := &http.Cookie{
		Name:     mw.AccessCookieName,
		Value:    tokens.AccessToken,
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
		SameSite: sameSite,
		MaxAge:   int(time.Until(tokens.ExpiresAt).Seconds()),
	}
	if access.MaxAge < 60 {
		access.MaxAge = 15 * 60 // sanity floor: 15 min
	}

	refresh := &http.Cookie{
		Name:     mw.RefreshCookieName,
		Value:    tokens.RefreshToken,
		Path:     "/api/v1/auth", // narrow scope — only sent to auth endpoints
		HttpOnly: true,
		Secure:   secure,
		SameSite: sameSite,
		MaxAge:   30 * 24 * 60 * 60, // 30 days, matches service TTL
	}

	http.SetCookie(w, access)
	http.SetCookie(w, refresh)
}

// clearTokenCookies overwrites both cookies with empty value + MaxAge<0 so
// the browser drops them immediately. Used on logout.
func clearTokenCookies(w http.ResponseWriter) {
	prod := strings.EqualFold(os.Getenv("APP_ENV"), "production")
	expired := time.Unix(0, 0)

	// SameSite/Secure must match the attributes used at set-time (above) or the
	// browser won't match the cookie to delete it — in prod the auth cookies
	// are None+Secure, so the clear must be too.
	sameSite := http.SameSiteLaxMode
	if prod {
		sameSite = http.SameSiteNoneMode
	}

	for _, name := range []string{mw.AccessCookieName, mw.RefreshCookieName} {
		path := "/"
		if name == mw.RefreshCookieName {
			path = "/api/v1/auth"
		}
		http.SetCookie(w, &http.Cookie{
			Name:     name,
			Value:    "",
			Path:     path,
			HttpOnly: true,
			Secure:   prod,
			SameSite: sameSite,
			Expires:  expired,
			MaxAge:   -1,
		})
	}
}
