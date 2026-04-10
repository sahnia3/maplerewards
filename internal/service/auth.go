package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
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
	MergeAnonymousUser(ctx context.Context, authUserID, anonUserID string) error
	StoreRefreshToken(ctx context.Context, userID, tokenHash string, expiresAt interface{}) error
	GetRefreshToken(ctx context.Context, tokenHash string) (*model.RefreshToken, error)
	RevokeRefreshToken(ctx context.Context, tokenHash string) error
	RevokeAllUserTokens(ctx context.Context, userID string) error
	DeleteUser(ctx context.Context, userID string) error
}

// AuthService handles authentication logic.
type AuthService struct {
	repo       AuthRepository
	walletRepo WalletRepository
	jwtSecret  []byte
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
			fmt.Printf("warn: failed to merge anonymous data: %v\n", err)
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
	if user == nil {
		return nil, fmt.Errorf("invalid credentials")
	}
	if user.PasswordHash == nil {
		return nil, fmt.Errorf("invalid credentials")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(*user.PasswordHash), []byte(req.Password)); err != nil {
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
			fmt.Printf("warn: failed to merge anonymous data for google auth: %v\n", err)
		}
	}

	return s.generateTokenPair(ctx, user)
}

// RefreshToken validates a refresh token and issues a new token pair.
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

	// Revoke the old token (rotation)
	if err := s.repo.RevokeRefreshToken(ctx, tokenHash); err != nil {
		return nil, fmt.Errorf("revoking old token: %w", err)
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
func (s *AuthService) mergeAnonymous(ctx context.Context, authUserID, anonSessionID string) error {
	anonUser, err := s.walletRepo.GetUserBySession(ctx, anonSessionID)
	if err != nil {
		return fmt.Errorf("looking up anonymous session: %w", err)
	}
	if anonUser == nil {
		return nil // No anonymous data to merge
	}
	if anonUser.ID == authUserID {
		return nil // Same user, nothing to merge
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
