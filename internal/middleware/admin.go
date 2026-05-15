package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

// emailKey holds the JWT email claim once an admin-gated request has been
// validated. Stays unexported — admin handlers don't need it; the middleware
// itself is the gate.
const emailKey contextKey = "email"

// EmailFromContext returns the JWT-derived email of the current request, or
// "" if the request was not authenticated with a token that carried email.
// Exposed for any future handler that wants to audit admin actions.
func EmailFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(emailKey).(string); ok {
		return v
	}
	return ""
}

// RequireAdmin gates a route to a fixed allow-list of email addresses read
// from JWT claims. Must run AFTER JWTRequired (which proves the token is
// valid). It does its own claims re-parse — unverified parse is safe here
// because JWTRequired already verified the signature; we just need the
// email claim that JWTRequired itself does not expose.
//
// An empty allow-list denies every request. Configure via the comma-
// separated ADMIN_EMAILS env var read by cmd/api/main.go.
func RequireAdmin(adminEmails []string) func(http.Handler) http.Handler {
	allow := map[string]struct{}{}
	for _, e := range adminEmails {
		e = strings.ToLower(strings.TrimSpace(e))
		if e != "" {
			allow[e] = struct{}{}
		}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if len(allow) == 0 {
				writeAuthError(w, "FORBIDDEN", "admin access not configured", http.StatusForbidden)
				return
			}
			if UserIDFromContext(r.Context()) == "" {
				writeAuthError(w, "UNAUTHORIZED", "authentication required", http.StatusUnauthorized)
				return
			}

			token := extractBearerToken(r)
			email := emailFromToken(token)
			if email == "" {
				writeAuthError(w, "FORBIDDEN", "admin access denied", http.StatusForbidden)
				return
			}
			if _, ok := allow[strings.ToLower(email)]; !ok {
				writeAuthError(w, "FORBIDDEN", "admin access denied", http.StatusForbidden)
				return
			}

			ctx := context.WithValue(r.Context(), emailKey, email)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// emailFromToken extracts the "email" claim from a JWT without verifying the
// signature. Safe to use here because RequireAdmin is always chained after
// JWTRequired, which has already validated the token.
func emailFromToken(token string) string {
	if token == "" {
		return ""
	}
	parser := jwt.NewParser(jwt.WithoutClaimsValidation())
	parsed, _, err := parser.ParseUnverified(token, jwt.MapClaims{})
	if err != nil {
		return ""
	}
	claims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		return ""
	}
	email, _ := claims["email"].(string)
	return email
}
