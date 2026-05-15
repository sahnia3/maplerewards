package handler

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"

	"google.golang.org/api/idtoken"

	mw "maplerewards/internal/middleware"
	"maplerewards/internal/model"
	"maplerewards/internal/service"
)

type AuthHandler struct {
	svc *service.AuthService
}

func NewAuthHandler(svc *service.AuthService) *AuthHandler {
	return &AuthHandler{svc: svc}
}

// Register handles POST /auth/register
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req model.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	tokens, err := h.svc.Register(r.Context(), req)
	if err != nil {
		switch err.Error() {
		case "email and password are required":
			jsonErrorCode(w, "INVALID_REQUEST", err.Error(), http.StatusBadRequest)
		case "password must be at least 8 characters":
			jsonErrorCode(w, "INVALID_REQUEST", err.Error(), http.StatusBadRequest)
		case "email already registered":
			jsonErrorCode(w, "CONFLICT", err.Error(), http.StatusConflict)
		default:
			jsonError(w, "registration failed", http.StatusInternalServerError)
		}
		return
	}

	setTokenCookies(w, tokens)
	// Rotate the CSRF token on registration to bind it to the new auth state.
	// Defends against token-fixation: a value an attacker captured pre-signup
	// is invalidated the moment the user has a real session.
	mw.RotateCSRFCookie(w)
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, tokens)
}

// Login handles POST /auth/login
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req model.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	tokens, err := h.svc.Login(r.Context(), req)
	if err != nil {
		switch err.Error() {
		case "email and password are required":
			jsonErrorCode(w, "INVALID_REQUEST", err.Error(), http.StatusBadRequest)
		case "invalid credentials":
			jsonErrorCode(w, "UNAUTHORIZED", "invalid email or password", http.StatusUnauthorized)
		default:
			jsonError(w, "login failed", http.StatusInternalServerError)
		}
		return
	}

	setTokenCookies(w, tokens)
	mw.RotateCSRFCookie(w) // bind CSRF token to the new auth state
	jsonOK(w, tokens)
}

// GoogleAuth handles POST /auth/google
func (h *AuthHandler) GoogleAuth(w http.ResponseWriter, r *http.Request) {
	var req model.GoogleAuthRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.GoogleToken == "" {
		jsonErrorCode(w, "INVALID_REQUEST", "google_token is required", http.StatusBadRequest)
		return
	}

	// Verify the Google ID token against Google's public keys. This checks
	// the signature, that the issuer is accounts.google.com, that the token
	// hasn't expired, AND that the audience matches our OAuth client ID —
	// without all four, a forged token could log in as any user.
	googleID, email, displayName, err := verifyGoogleIDToken(r.Context(), req.GoogleToken)
	if err != nil {
		slog.Warn("google id token rejected", "err", err)
		jsonErrorCode(w, "INVALID_REQUEST", "invalid Google token", http.StatusBadRequest)
		return
	}

	tokens, err := h.svc.GoogleAuth(r.Context(), googleID, email, displayName, req.SessionID)
	if err != nil {
		jsonError(w, "Google authentication failed", http.StatusInternalServerError)
		return
	}

	setTokenCookies(w, tokens)
	mw.RotateCSRFCookie(w) // bind CSRF token to the new auth state
	jsonOK(w, tokens)
}

// Refresh handles POST /auth/refresh. Accepts the refresh token from either
// the JSON body (legacy clients) or the httpOnly mr_refresh cookie.
func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	var req model.RefreshRequest
	_ = json.NewDecoder(r.Body).Decode(&req) // body is optional now

	rawToken := req.RefreshToken
	if rawToken == "" {
		if c, err := r.Cookie(mw.RefreshCookieName); err == nil {
			rawToken = c.Value
		}
	}

	tokens, err := h.svc.RefreshToken(r.Context(), rawToken)
	if err != nil {
		jsonErrorCode(w, "UNAUTHORIZED", "invalid or expired refresh token", http.StatusUnauthorized)
		return
	}

	setTokenCookies(w, tokens)
	jsonOK(w, tokens)
}

// Logout handles POST /auth/logout (requires auth)
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	userID := mw.UserIDFromContext(r.Context())
	if userID == "" {
		jsonErrorCode(w, "UNAUTHORIZED", "authentication required", http.StatusUnauthorized)
		return
	}

	if err := h.svc.Logout(r.Context(), userID); err != nil {
		jsonError(w, "logout failed", http.StatusInternalServerError)
		return
	}

	clearTokenCookies(w)
	// Rotate CSRF after logout so any cached token from the prior session
	// can't be replayed against the same browser's next session.
	mw.RotateCSRFCookie(w)
	jsonOK(w, map[string]string{"message": "logged out"})
}

// GetMe handles GET /auth/me (requires auth)
func (h *AuthHandler) GetMe(w http.ResponseWriter, r *http.Request) {
	userID := mw.UserIDFromContext(r.Context())
	if userID == "" {
		jsonErrorCode(w, "UNAUTHORIZED", "authentication required", http.StatusUnauthorized)
		return
	}

	user, err := h.svc.GetProfile(r.Context(), userID)
	if err != nil {
		jsonError(w, "failed to get profile", http.StatusInternalServerError)
		return
	}

	jsonOK(w, user)
}

// ChangePassword handles POST /auth/change-password (requires auth).
// Verifies the current password, hashes the new one, and revokes all other
// refresh tokens so any stolen-session-cookie attacker loses access too.
func (h *AuthHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	userID := mw.UserIDFromContext(r.Context())
	if userID == "" {
		jsonErrorCode(w, "UNAUTHORIZED", "authentication required", http.StatusUnauthorized)
		return
	}
	var req struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if err := h.svc.ChangePassword(r.Context(), userID, req.CurrentPassword, req.NewPassword); err != nil {
		// Pass the service-crafted message through — these are intentional
		// validation copy ("current password is incorrect", "must be 8+
		// chars", etc.), safe to surface.
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	// All other refresh tokens were revoked inside ChangePassword. Rotate the
	// CSRF cookie too so any pre-rotation token a session-hijack attacker
	// might have can't be replayed.
	mw.RotateCSRFCookie(w)
	jsonOK(w, map[string]string{"message": "password updated"})
}

// UpdateMe handles PUT /auth/me (requires auth)
func (h *AuthHandler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	userID := mw.UserIDFromContext(r.Context())
	if userID == "" {
		jsonErrorCode(w, "UNAUTHORIZED", "authentication required", http.StatusUnauthorized)
		return
	}

	var req model.UpdateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	user, err := h.svc.UpdateProfile(r.Context(), userID, req)
	if err != nil {
		jsonError(w, "failed to update profile", http.StatusInternalServerError)
		return
	}

	jsonOK(w, user)
}

// DeleteMe handles DELETE /auth/me (requires auth)
func (h *AuthHandler) DeleteMe(w http.ResponseWriter, r *http.Request) {
	userID := mw.UserIDFromContext(r.Context())
	if userID == "" {
		jsonErrorCode(w, "UNAUTHORIZED", "authentication required", http.StatusUnauthorized)
		return
	}

	if err := h.svc.DeleteAccount(r.Context(), userID); err != nil {
		jsonError(w, "failed to delete account", http.StatusInternalServerError)
		return
	}

	jsonOK(w, map[string]string{"message": "account deleted"})
}

// verifyGoogleIDToken validates a Google ID token end-to-end:
//   1. Signature is valid against Google's published JWK set.
//   2. Issuer is accounts.google.com / https://accounts.google.com.
//   3. Audience matches GOOGLE_OAUTH_CLIENT_ID.
//   4. Token is not expired.
//
// Returns the verified user claims. Anything that fails any of the above
// returns an error and we reject the login.
//
// GOOGLE_OAUTH_CLIENT_ID is REQUIRED in production — if unset, the audience
// check is skipped which would let a token issued for any OAuth client log
// into Maple. The startup config check below enforces non-empty in prod.
func verifyGoogleIDToken(ctx context.Context, token string) (googleID, email, displayName string, err error) {
	clientID := os.Getenv("GOOGLE_OAUTH_CLIENT_ID")
	if strings.EqualFold(os.Getenv("APP_ENV"), "production") && clientID == "" {
		return "", "", "", fmt.Errorf("GOOGLE_OAUTH_CLIENT_ID not configured in production")
	}

	// idtoken.Validate fetches Google's JWK set (with internal caching),
	// verifies the RS256 signature, checks iss/aud/exp/nbf, and returns the
	// decoded payload. An empty audience parameter skips the aud check —
	// only acceptable in dev where we accept any client.
	payload, err := idtoken.Validate(ctx, token, clientID)
	if err != nil {
		return "", "", "", fmt.Errorf("validating google id token: %w", err)
	}
	if payload.Subject == "" {
		return "", "", "", fmt.Errorf("missing subject in verified token")
	}

	// Pull the claims we actually need from the verified payload.
	googleID = payload.Subject
	if v, ok := payload.Claims["email"].(string); ok {
		email = v
	}
	if v, ok := payload.Claims["name"].(string); ok {
		displayName = v
	}

	// Optionally enforce email_verified == true. Google sets this when the
	// underlying account has confirmed its email; tokens for unverified
	// accounts shouldn't grant login.
	if v, ok := payload.Claims["email_verified"].(bool); ok && !v {
		return "", "", "", fmt.Errorf("google account email is not verified")
	}
	return googleID, email, displayName, nil
}

// decodeGoogleIDTokenTestOnlyUnsafe is the legacy un-verified decoder. Kept
// ONLY for tests that need to introspect a JWT payload without a real network
// round-trip. The name encodes the intent so static review + grep -i "unsafe"
// catch any accidental production use. Production code path goes through
// verifyGoogleIDToken.
func decodeGoogleIDTokenTestOnlyUnsafe(token string) (googleID, email, displayName string, err error) {
	parts := strings.SplitN(token, ".", 3)
	if len(parts) != 3 {
		return "", "", "", fmt.Errorf("invalid token format")
	}

	// Decode the payload (base64url-encoded)
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", "", "", fmt.Errorf("decoding token payload: %w", err)
	}

	var claims struct {
		Sub   string `json:"sub"`
		Email string `json:"email"`
		Name  string `json:"name"`
	}
	if err := json.Unmarshal(payload, &claims); err != nil {
		return "", "", "", fmt.Errorf("parsing token claims: %w", err)
	}

	if claims.Sub == "" {
		return "", "", "", fmt.Errorf("missing subject in token")
	}

	return claims.Sub, claims.Email, claims.Name, nil
}
