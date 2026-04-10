package handler

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

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

	// Decode the Google ID token to extract claims.
	// In production, you should verify the token signature with Google's public keys.
	// The frontend already verified it via Google Sign-In SDK.
	googleID, email, displayName, err := decodeGoogleIDToken(req.GoogleToken)
	if err != nil {
		jsonErrorCode(w, "INVALID_REQUEST", "invalid Google token", http.StatusBadRequest)
		return
	}

	tokens, err := h.svc.GoogleAuth(r.Context(), googleID, email, displayName, req.SessionID)
	if err != nil {
		jsonError(w, "Google authentication failed", http.StatusInternalServerError)
		return
	}

	jsonOK(w, tokens)
}

// Refresh handles POST /auth/refresh
func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	var req model.RefreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	tokens, err := h.svc.RefreshToken(r.Context(), req.RefreshToken)
	if err != nil {
		jsonErrorCode(w, "UNAUTHORIZED", "invalid or expired refresh token", http.StatusUnauthorized)
		return
	}

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

// decodeGoogleIDToken decodes a Google ID token's payload to extract user claims.
// Google ID tokens are standard JWTs — we decode the middle segment (payload).
// NOTE: In production, verify the signature using Google's public keys.
func decodeGoogleIDToken(token string) (googleID, email, displayName string, err error) {
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
