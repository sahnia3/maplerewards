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
//   - SameSite:  Lax for production same-origin; None for dev cross-origin
//   - Path:      "/"
//   - MaxAge:    matches the underlying token lifetimes
func setTokenCookies(w http.ResponseWriter, tokens *model.TokenPair) {
	if tokens == nil {
		return
	}
	prod := strings.EqualFold(os.Getenv("APP_ENV"), "production")

	// SameSite=None requires Secure. In dev (HTTP) we fall back to
	// SameSite=Lax + non-Secure so cookies still work on localhost. Cross-
	// origin dev flows still need the Authorization header fallback.
	sameSite := http.SameSiteLaxMode
	secure := prod
	if !prod {
		// keep SameSite Lax + non-Secure for dev simplicity
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
			SameSite: http.SameSiteLaxMode,
			Expires:  expired,
			MaxAge:   -1,
		})
	}
}
