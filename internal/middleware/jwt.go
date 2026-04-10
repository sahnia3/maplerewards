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
)

// TokenValidator validates JWT access tokens.
type TokenValidator interface {
	ValidateAccessToken(tokenString string) (userID string, isPro bool, err error)
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

			userID, isPro, err := validator.ValidateAccessToken(token)
			if err != nil {
				// Token present but invalid — still allow request (anonymous fallback)
				next.ServeHTTP(w, r)
				return
			}

			ctx := context.WithValue(r.Context(), userIDKey, userID)
			ctx = context.WithValue(ctx, isProKey, isPro)
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

			userID, isPro, err := validator.ValidateAccessToken(token)
			if err != nil {
				writeAuthError(w, "UNAUTHORIZED", "invalid or expired token", http.StatusUnauthorized)
				return
			}

			ctx := context.WithValue(r.Context(), userIDKey, userID)
			ctx = context.WithValue(ctx, isProKey, isPro)
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

func extractBearerToken(r *http.Request) string {
	auth := r.Header.Get("Authorization")
	if auth == "" {
		return ""
	}
	parts := strings.SplitN(auth, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

func writeAuthError(w http.ResponseWriter, code, msg string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{ //nolint:errcheck
		"code":    code,
		"message": msg,
	})
}
