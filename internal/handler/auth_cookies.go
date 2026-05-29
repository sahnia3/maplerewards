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
// cookieProfile returns the SameSite mode, Secure flag, and Domain for the auth
// + CSRF cookies, in one place so set and clear always agree.
//
//   - COOKIE_DOMAIN set (app + API share a registrable parent domain, e.g.
//     ".maplerewards.ca"): same-site Lax + Domain — robust on Safari and
//     third-party-cookie-blocking browsers.
//   - prod, no COOKIE_DOMAIN (app + API on different domains, e.g. *.vercel.app
//     + *.railway.app): SameSite=None+Secure so the cookie flows cross-site.
//   - dev: Lax + insecure (localhost is same-site; None needs Secure that dev
//     HTTP can't provide).
//
// Cross-site exposure is contained by the strict CORS allow-list + CSRF
// double-submit on every state-changing route.
func cookieProfile() (sameSite http.SameSite, secure bool, domain string) {
	prod := strings.EqualFold(os.Getenv("APP_ENV"), "production")
	domain = strings.TrimSpace(os.Getenv("COOKIE_DOMAIN"))
	if !prod {
		return http.SameSiteLaxMode, false, domain
	}
	if domain != "" {
		return http.SameSiteLaxMode, true, domain
	}
	return http.SameSiteNoneMode, true, ""
}

func setTokenCookies(w http.ResponseWriter, tokens *model.TokenPair) {
	if tokens == nil {
		return
	}
	sameSite, secure, domain := cookieProfile()

	access := &http.Cookie{
		Name:     mw.AccessCookieName,
		Value:    tokens.AccessToken,
		Path:     "/",
		Domain:   domain,
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
		Domain:   domain,
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
	expired := time.Unix(0, 0)

	// SameSite/Secure/Domain must match the attributes used at set-time or the
	// browser won't match the cookie to delete it.
	sameSite, secure, domain := cookieProfile()

	for _, name := range []string{mw.AccessCookieName, mw.RefreshCookieName} {
		path := "/"
		if name == mw.RefreshCookieName {
			path = "/api/v1/auth"
		}
		http.SetCookie(w, &http.Cookie{
			Name:     name,
			Value:    "",
			Path:     path,
			Domain:   domain,
			HttpOnly: true,
			Secure:   secure,
			SameSite: sameSite,
			Expires:  expired,
			MaxAge:   -1,
		})
	}
}
