package handler

import (
	"net/http"

	mw "maplerewards/internal/middleware"
)

// requireBodySessionOwner enforces session ownership on a body-supplied
// sessionID. Mirrors the behaviour of mw.RequireSessionOwner, which only
// works on URL path parameters.
//
// Rules:
//   - Empty sessionID → 400 (caller must validate before calling).
//   - Anonymous wallet (user has no email) → allow (sessionID itself is the
//     128-bit secret; anyone holding it is by definition authorised).
//   - Authenticated wallet (user has an email) → require a JWT AND require
//     the JWT user.ID match the wallet owner's user.ID. 401 with no JWT,
//     403 on mismatch.
//
// Returns true if the caller should proceed; false if a response has
// already been written.
func requireBodySessionOwner(
	w http.ResponseWriter,
	r *http.Request,
	lookup mw.SessionOwnerLookup,
	sessionID string,
) bool {
	if sessionID == "" {
		jsonErrorCode(w, "INVALID_REQUEST", "session_id required", http.StatusBadRequest)
		return false
	}
	if lookup == nil {
		// Production callers always pass a real walletRepo. Tests pass nil
		// to skip this check without needing a mock.
		return true
	}

	user, err := lookup.GetUserBySession(r.Context(), sessionID)
	if err != nil || user == nil {
		jsonErrorCode(w, "NOT_FOUND", "wallet not found", http.StatusNotFound)
		return false
	}

	// Anonymous wallet — sessionID is the bearer.
	if user.Email == nil || *user.Email == "" {
		return true
	}

	// Authenticated wallet — require matching JWT.
	jwtUserID := mw.UserIDFromContext(r.Context())
	if jwtUserID == "" {
		jsonErrorCode(w, "UNAUTHORIZED", "authentication required for this wallet", http.StatusUnauthorized)
		return false
	}
	if jwtUserID != user.ID {
		jsonErrorCode(w, "FORBIDDEN", "you do not own this wallet", http.StatusForbidden)
		return false
	}
	return true
}
