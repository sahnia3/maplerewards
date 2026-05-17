package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log/slog"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"maplerewards/internal/model"
)

// AuthRepository abstracts auth-related DB operations.
type AuthRepository interface {
	GetUserByEmail(ctx context.Context, email string) (*model.User, error)
	GetUserByGoogleID(ctx context.Context, googleID string) (*model.User, error)
	GetUserByID(ctx context.Context, id string) (*model.User, error)
	CreateAuthUser(ctx context.Context, email, passwordHash, displayName, sessionID string) (*model.User, error)
	UpsertGoogleUser(ctx context.Context, googleID, email, displayName, sessionID string) (*model.User, error)
	UpdateProfile(ctx context.Context, userID, displayName string) (*model.User, error)
	UpdatePasswordHash(ctx context.Context, userID, passwordHash string) error
	MergeAnonymousUser(ctx context.Context, authUserID, anonUserID string) error
	StoreRefreshToken(ctx context.Context, userID, tokenHash string, expiresAt interface{}) error
	GetRefreshToken(ctx context.Context, tokenHash string) (*model.RefreshToken, error)
	RevokeRefreshToken(ctx context.Context, tokenHash string) (claimed bool, err error)
	RevokeAllUserTokens(ctx context.Context, userID string) error
	DeleteUser(ctx context.Context, userID string) error
}

// AuthService handles authentication logic.
type AuthService struct {
	repo       AuthRepository
	walletRepo WalletRepository
	jwtSecret  []byte
}

// dummyBcryptHash is a real bcrypt hash with the standard cost factor.
// It's compared against during Login when a user is missing or has no password
// (Google-only accounts) so total work — and therefore response time — stays
// constant regardless of account state. Without this, an attacker can probe
// /login response time to enumerate registered emails and to discover which
// accounts are Google-only vs. password-bearing.
var dummyBcryptHash []byte

func init() {
	h, err := bcrypt.GenerateFromPassword([]byte("invalid-credentials-placeholder"), bcrypt.DefaultCost)
	if err != nil {
		panic(fmt.Sprintf("auth: failed to precompute dummy bcrypt hash: %v", err))
	}
	dummyBcryptHash = h
}

// NewAuthService creates a new auth service.
func NewAuthService(repo AuthRepository, walletRepo WalletRepository, jwtSecret string) *AuthService {
	return &AuthService{
		repo:       repo,
		walletRepo: walletRepo,
		jwtSecret:  []byte(jwtSecret),
	}
}

// Register creates a new user with email/password credentials.
func (s *AuthService) Register(ctx context.Context, req model.RegisterRequest) (*model.TokenPair, error) {
	// Validate input
	if req.Email == "" || req.Password == "" {
		return nil, fmt.Errorf("email and password are required")
	}
	if len(req.Password) < 8 {
		return nil, fmt.Errorf("password must be at least 8 characters")
	}

	// Check if email is already taken
	existing, err := s.repo.GetUserByEmail(ctx, req.Email)
	if err != nil {
		return nil, fmt.Errorf("checking existing user: %w", err)
	}
	if existing != nil {
		return nil, fmt.Errorf("email already registered")
	}

	// Hash password
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hashing password: %w", err)
	}

	// Generate a new sessionID for the auth user
	sessionID, err := generateRandomHex(16)
	if err != nil {
		return nil, fmt.Errorf("generating session: %w", err)
	}

	displayName := req.DisplayName
	if displayName == "" {
		displayName = req.Email
	}

	// Create user
	user, err := s.repo.CreateAuthUser(ctx, req.Email, string(hash), displayName, sessionID)
	if err != nil {
		return nil, fmt.Errorf("creating user: %w", err)
	}

	// Merge anonymous session data if provided
	if req.SessionID != "" {
		if err := s.mergeAnonymous(ctx, user.ID, req.SessionID); err != nil {
			// Log but don't fail registration
			slog.Warn("failed to merge anonymous data", "err", err, "user_id", user.ID)
		}
	}

	// Generate tokens
	return s.generateTokenPair(ctx, user)
}

// Login authenticates a user with email/password.
func (s *AuthService) Login(ctx context.Context, req model.LoginRequest) (*model.TokenPair, error) {
	if req.Email == "" || req.Password == "" {
		return nil, fmt.Errorf("email and password are required")
	}

	user, err := s.repo.GetUserByEmail(ctx, req.Email)
	if err != nil {
		return nil, fmt.Errorf("looking up user: %w", err)
	}

	hashToCompare := dummyBcryptHash
	if user != nil && user.PasswordHash != nil {
		hashToCompare = []byte(*user.PasswordHash)
	}
	bcryptErr := bcrypt.CompareHashAndPassword(hashToCompare, []byte(req.Password))

	if user == nil || user.PasswordHash == nil || bcryptErr != nil {
		return nil, fmt.Errorf("invalid credentials")
	}

	return s.generateTokenPair(ctx, user)
}

// GoogleAuth authenticates or registers a user via Google OAuth.
func (s *AuthService) GoogleAuth(ctx context.Context, googleID, email, displayName, anonSessionID string) (*model.TokenPair, error) {
	if googleID == "" {
		return nil, fmt.Errorf("google_id is required")
	}

	// Generate a new sessionID
	sessionID, err := generateRandomHex(16)
	if err != nil {
		return nil, fmt.Errorf("generating session: %w", err)
	}

	// Upsert: insert or update on conflict
	user, err := s.repo.UpsertGoogleUser(ctx, googleID, email, displayName, sessionID)
	if err != nil {
		return nil, fmt.Errorf("upserting google user: %w", err)
	}

	// Merge anonymous session data if provided
	if anonSessionID != "" {
		if err := s.mergeAnonymous(ctx, user.ID, anonSessionID); err != nil {
			slog.Warn("failed to merge anonymous data for google auth", "err", err, "user_id", user.ID)
		}
	}

	return s.generateTokenPair(ctx, user)
}

// RefreshToken validates a refresh token and issues a new token pair.
// Reuse-detection: if the presented token has already been revoked (i.e.,
// previously used in a rotation), assume it was stolen and revoke ALL of
// the user's refresh tokens. The legitimate user will have to log in again
// — small inconvenience vs. allowing an attacker free reign on a stolen
// long-lived token.
func (s *AuthService) RefreshToken(ctx context.Context, rawToken string) (*model.TokenPair, error) {
	if rawToken == "" {
		return nil, fmt.Errorf("refresh token is required")
	}

	tokenHash := hashToken(rawToken)

	stored, err := s.repo.GetRefreshToken(ctx, tokenHash)
	if err != nil {
		return nil, fmt.Errorf("looking up refresh token: %w", err)
	}
	if stored == nil {
		return nil, fmt.Errorf("invalid or expired refresh token")
	}

	// Reuse detection — the repo's GetRefreshToken returns nil for
	// already-revoked or expired rows in the happy path. If we got a non-nil
	// stored token whose RevokedAt is set, this is a replay. Revoke everything.
	if stored.RevokedAt != nil {
		slog.Warn("refresh token reuse detected — revoking all user tokens", "user_id", stored.UserID)
		_ = s.repo.RevokeAllUserTokens(ctx, stored.UserID)
		return nil, fmt.Errorf("invalid or expired refresh token")
	}

	// Atomically claim the rotation. If we didn't claim it, a concurrent
	// refresh of the same token already did — the winner minted a fresh
	// pair the client will use. Don't mint a second pair, and DON'T trip
	// RevokeAllUserTokens: a benign SPA double-refresh is not an attack
	// (genuine replay of an already-revoked token is still caught by the
	// stored.RevokedAt check above).
	claimed, err := s.repo.RevokeRefreshToken(ctx, tokenHash)
	if err != nil {
		return nil, fmt.Errorf("revoking old token: %w", err)
	}
	if !claimed {
		return nil, fmt.Errorf("invalid or expired refresh token")
	}

	// Look up the user
	user, err := s.repo.GetUserByID(ctx, stored.UserID)
	if err != nil {
		return nil, fmt.Errorf("looking up user: %w", err)
	}
	if user == nil {
		return nil, fmt.Errorf("user not found")
	}

	return s.generateTokenPair(ctx, user)
}

// Logout revokes all refresh tokens for a user.
func (s *AuthService) Logout(ctx context.Context, userID string) error {
	return s.repo.RevokeAllUserTokens(ctx, userID)
}

// GetProfile returns the user's profile.
func (s *AuthService) GetProfile(ctx context.Context, userID string) (*model.User, error) {
	user, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("getting profile: %w", err)
	}
	if user == nil {
		return nil, fmt.Errorf("user not found")
	}
	return user, nil
}

// UpdateProfile updates the user's display name.
func (s *AuthService) UpdateProfile(ctx context.Context, userID string, req model.UpdateProfileRequest) (*model.User, error) {
	if req.DisplayName == "" {
		return nil, fmt.Errorf("display_name is required")
	}
	return s.repo.UpdateProfile(ctx, userID, req.DisplayName)
}

// ChangePassword rotates the user's password. Verifies the current password
// first to thwart session hijack (an attacker with a stolen JWT shouldn't be
// able to take over the account by rotating the password without knowing the
// existing one). All other refresh tokens are revoked on success — other
// devices need to log in again with the new password.
func (s *AuthService) ChangePassword(ctx context.Context, userID, currentPassword, newPassword string) error {
	if currentPassword == "" || newPassword == "" {
		return fmt.Errorf("current and new password are required")
	}
	if len(newPassword) < 8 {
		return fmt.Errorf("new password must be at least 8 characters")
	}
	user, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return fmt.Errorf("looking up user: %w", err)
	}
	if user == nil || user.PasswordHash == nil {
		// User signed in via Google OAuth — no password to change.
		return fmt.Errorf("password change unavailable for this account")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(*user.PasswordHash), []byte(currentPassword)); err != nil {
		return fmt.Errorf("current password is incorrect")
	}
	newHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hashing password: %w", err)
	}
	if err := s.repo.UpdatePasswordHash(ctx, userID, string(newHash)); err != nil {
		return fmt.Errorf("updating password: %w", err)
	}
	// Force re-login on every other device for safety.
	_ = s.repo.RevokeAllUserTokens(ctx, userID)
	return nil
}

// DeleteAccount permanently removes a user and all associated data.
func (s *AuthService) DeleteAccount(ctx context.Context, userID string) error {
	// Revoke all tokens first
	if err := s.repo.RevokeAllUserTokens(ctx, userID); err != nil {
		return fmt.Errorf("revoking tokens: %w", err)
	}
	return s.repo.DeleteUser(ctx, userID)
}

// ValidateAccessToken parses and validates a JWT access token.
func (s *AuthService) ValidateAccessToken(tokenString string) (string, bool, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return s.jwtSecret, nil
	})
	if err != nil {
		return "", false, err
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || !token.Valid {
		return "", false, fmt.Errorf("invalid token claims")
	}

	userID, ok := claims["sub"].(string)
	if !ok || userID == "" {
		return "", false, fmt.Errorf("missing user ID in token")
	}

	isPro := false
	if v, ok := claims["is_pro"].(bool); ok {
		isPro = v
	}

	return userID, isPro, nil
}

// ── Internal helpers ────────────────────────────────────────────────────────

func (s *AuthService) generateTokenPair(ctx context.Context, user *model.User) (*model.TokenPair, error) {
	now := time.Now()
	accessExpiry := now.Add(15 * time.Minute)

	// Create access token
	accessClaims := jwt.MapClaims{
		"sub":       user.ID,
		"email":     user.Email,
		"is_pro":    user.IsPro,
		"provider":  user.AuthProvider,
		"iat":       now.Unix(),
		"exp":       accessExpiry.Unix(),
	}
	accessToken := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims)
	accessStr, err := accessToken.SignedString(s.jwtSecret)
	if err != nil {
		return nil, fmt.Errorf("signing access token: %w", err)
	}

	// Create refresh token (opaque random string)
	rawRefresh, err := generateRandomHex(32)
	if err != nil {
		return nil, fmt.Errorf("generating refresh token: %w", err)
	}

	refreshExpiry := now.Add(30 * 24 * time.Hour) // 30 days
	refreshHash := hashToken(rawRefresh)

	if err := s.repo.StoreRefreshToken(ctx, user.ID, refreshHash, refreshExpiry); err != nil {
		return nil, fmt.Errorf("storing refresh token: %w", err)
	}

	return &model.TokenPair{
		AccessToken:  accessStr,
		RefreshToken: rawRefresh,
		ExpiresAt:    accessExpiry,
		User:         *user,
	}, nil
}

// mergeAnonymous transfers data from an anonymous session to the authenticated user.
//
// SECURITY: an attacker who learns a session_id (from logs, URL leaks, shared
// devices) could otherwise register a fresh account and pass the victim's
// session_id to capture their wallet. To mitigate without restructuring auth,
// reject the merge unless (1) the target session belongs to a genuinely
// anonymous user — no email set — and (2) the session was created within the
// last 30 days. The cookie-bound session token is the long-term answer; this
// is the short-term hardening that doesn't break the client contract.
func (s *AuthService) mergeAnonymous(ctx context.Context, authUserID, anonSessionID string) error {
	anonUser, err := s.walletRepo.GetUserBySession(ctx, anonSessionID)
	if err != nil {
		return fmt.Errorf("looking up anonymous session: %w", err)
	}
	if anonUser == nil {
		return nil
	}
	if anonUser.ID == authUserID {
		return nil
	}
	if anonUser.Email != nil {
		slog.Warn("anon-merge rejected: target session belongs to a registered user",
			"auth_user", authUserID, "target_user", anonUser.ID)
		return fmt.Errorf("session is not anonymous")
	}
	if time.Since(anonUser.CreatedAt) > 30*24*time.Hour {
		slog.Warn("anon-merge rejected: target session is too old",
			"auth_user", authUserID, "target_user", anonUser.ID,
			"age_days", int(time.Since(anonUser.CreatedAt).Hours()/24))
		return fmt.Errorf("session is too old to merge")
	}
	return s.repo.MergeAnonymousUser(ctx, authUserID, anonUser.ID)
}

func generateRandomHex(bytes int) (string, error) {
	b := make([]byte, bytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}
