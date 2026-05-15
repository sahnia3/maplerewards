package middleware

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"

	"maplerewards/internal/model"
)

// SessionOwnerLookup is the minimal interface needed to resolve a sessionID to
// its owning user. Satisfied by repo.WalletRepo.
type SessionOwnerLookup interface {
	GetUserBySession(ctx context.Context, sessionID string) (*model.User, error)
}

// RequireSessionOwner closes the IDOR class on routes that take a sessionID
// path param. The rule is:
//
//   - Anonymous wallet (user has no email): the 128-bit random sessionID is
//     itself the bearer token; allow the request through without a JWT. This
//     preserves the "try it without signing up" flow.
//
//   - Authenticated wallet (user has an email): require a valid JWT AND
//     require that the JWT's user ID matches the wallet owner's user ID.
//     Otherwise 403 — without this check, any logged-in user could iterate
//     sessionIDs and read or mutate other users' wallets.
//
// Apply only to routes whose URL contains {sessionID}. Routes that read the
// session ID from the request body (e.g. POST /optimize) need a body-level
// check inside the handler.
func RequireSessionOwner(lookup SessionOwnerLookup) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			sessionID := chi.URLParam(r, "sessionID")
			if sessionID == "" {
				// No sessionID in path — middleware misapplied; let the
				// handler reject it. Don't 500 here.
				next.ServeHTTP(w, r)
				return
			}

			user, err := lookup.GetUserBySession(r.Context(), sessionID)
			if err != nil || user == nil {
				writeAuthError(w, "NOT_FOUND", "wallet not found", http.StatusNotFound)
				return
			}

			// Anonymous wallet — sessionID is the secret. Allow.
			if user.Email == nil || *user.Email == "" {
				next.ServeHTTP(w, r)
				return
			}

			// Authenticated wallet — require matching JWT user.
			jwtUserID := UserIDFromContext(r.Context())
			if jwtUserID == "" {
				writeAuthError(w, "UNAUTHORIZED", "authentication required for this wallet", http.StatusUnauthorized)
				return
			}
			if jwtUserID != user.ID {
				writeAuthError(w, "FORBIDDEN", "you do not own this wallet", http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// RequirePro gates an endpoint to Pro-tier authenticated users only.
// 401 if no JWT, 402 (Payment Required) if JWT is valid but user is not Pro.
//
// Must be chained AFTER JWTRequired (which sets userID + isPro in context).
// For routes that should also enforce session ownership, layer
// RequireSessionOwner first.
func RequirePro() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if UserIDFromContext(r.Context()) == "" {
				writeAuthError(w, "UNAUTHORIZED", "sign in to access Pro features", http.StatusUnauthorized)
				return
			}
			if !IsProFromContext(r.Context()) {
				writeAuthError(w, "UPGRADE_REQUIRED", "this feature requires a Pro subscription", http.StatusPaymentRequired)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
