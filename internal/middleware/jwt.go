package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
)

type contextKey string

const (
	userIDKey contextKey = "userID"
	isProKey  contextKey = "isPro"
	planKey   contextKey = "plan"
)

// TokenValidator validates JWT access tokens.
type TokenValidator interface {
	ValidateAccessToken(tokenString string) (userID string, isPro bool, plan string, err error)
}

// JWTOptional extracts user info from Bearer token if present.
// If no token is provided, the request proceeds without auth context.
// This allows routes to serve both anonymous and authenticated users.
func JWTOptional(validator TokenValidator) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := extractBearerToken(r)
			if token == "" {
				next.ServeHTTP(w, r)
				return
			}

			userID, isPro, plan, err := validator.ValidateAccessToken(token)
			if err != nil {
				// Token present but invalid — still allow request (anonymous fallback)
				next.ServeHTTP(w, r)
				return
			}

			ctx := context.WithValue(r.Context(), userIDKey, userID)
			ctx = context.WithValue(ctx, isProKey, isPro)
			ctx = context.WithValue(ctx, planKey, plan)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// JWTRequired requires a valid Bearer token to access the route.
// Returns 401 if no token or invalid token.
func JWTRequired(validator TokenValidator) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := extractBearerToken(r)
			if token == "" {
				writeAuthError(w, "UNAUTHORIZED", "authentication required", http.StatusUnauthorized)
				return
			}

			userID, isPro, plan, err := validator.ValidateAccessToken(token)
			if err != nil {
				writeAuthError(w, "UNAUTHORIZED", "invalid or expired token", http.StatusUnauthorized)
				return
			}

			ctx := context.WithValue(r.Context(), userIDKey, userID)
			ctx = context.WithValue(ctx, isProKey, isPro)
			ctx = context.WithValue(ctx, planKey, plan)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// UserIDFromContext extracts the authenticated user ID from request context.
// Returns empty string if not authenticated.
func UserIDFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(userIDKey).(string); ok {
		return v
	}
	return ""
}

// IsProFromContext extracts the Pro status from request context.
func IsProFromContext(ctx context.Context) bool {
	if v, ok := ctx.Value(isProKey).(bool); ok {
		return v
	}
	return false
}

// PlanFromContext extracts the persisted plan string (free|pro|pro_plus|
// lifetime) from request context. Empty for anonymous users or legacy
// tokens minted before the plan claim — callers fall back to is_pro.
func PlanFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(planKey).(string); ok {
		return v
	}
	return ""
}

func extractBearerToken(r *http.Request) string {
	auth := r.Header.Get("Authorization")
	if auth != "" {
		parts := strings.SplitN(auth, " ", 2)
		if len(parts) == 2 && strings.EqualFold(parts[0], "bearer") {
			return strings.TrimSpace(parts[1])
		}
	}
	// Fallback to httpOnly access cookie. Lets the frontend authenticate via
	// SameSite cookies without ever surfacing the JWT to JS (XSS hardening).
	if c, err := r.Cookie(AccessCookieName); err == nil && c.Value != "" {
		return c.Value
	}
	return ""
}

// AccessCookieName is the httpOnly cookie that carries the JWT access token.
// Exported so the auth handler can write it with matching name on login.
const AccessCookieName = "mr_access"

// RefreshCookieName is the httpOnly cookie that carries the rotating refresh
// token. Read only by /auth/refresh, never by other endpoints.
const RefreshCookieName = "mr_refresh"

func writeAuthError(w http.ResponseWriter, code, msg string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{ //nolint:errcheck
		"code":    code,
		"message": msg,
	})
}
