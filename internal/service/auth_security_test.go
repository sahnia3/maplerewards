package service

import (
	"context"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"maplerewards/internal/model"
)

// configurableAuthRepo is a per-test programmable AuthRepository so we can
// exercise the refresh-token reuse-detection state machine, which the fixed
// mockAuthRepo (hardwired GetRefreshToken -> nil) structurally cannot reach.
type configurableAuthRepo struct {
	getRefreshToken    func(ctx context.Context, hash string) (*model.RefreshToken, error)
	revokeRefreshOK    bool
	revokeAllCalled    *bool
	revokeAllForUser   *string
	userByID           *model.User
}

func (m *configurableAuthRepo) GetUserByEmail(context.Context, string) (*model.User, error) {
	return nil, nil
}
func (m *configurableAuthRepo) GetUserByGoogleID(context.Context, string) (*model.User, error) {
	return nil, nil
}
func (m *configurableAuthRepo) GetUserByID(context.Context, string) (*model.User, error) {
	return m.userByID, nil
}
func (m *configurableAuthRepo) CreateAuthUser(context.Context, string, string, string, string) (*model.User, error) {
	return nil, nil
}
func (m *configurableAuthRepo) UpsertGoogleUser(context.Context, string, string, string, string) (*model.User, error) {
	return nil, nil
}
func (m *configurableAuthRepo) UpdateProfile(context.Context, string, string) (*model.User, error) {
	return nil, nil
}
func (m *configurableAuthRepo) UpdatePasswordHash(context.Context, string, string) error { return nil }
func (m *configurableAuthRepo) MergeAnonymousUser(context.Context, string, string) error { return nil }
func (m *configurableAuthRepo) StoreRefreshToken(context.Context, string, string, interface{}) error {
	return nil
}
func (m *configurableAuthRepo) GetRefreshToken(ctx context.Context, hash string) (*model.RefreshToken, error) {
	return m.getRefreshToken(ctx, hash)
}
func (m *configurableAuthRepo) RevokeRefreshToken(context.Context, string) (bool, error) {
	return m.revokeRefreshOK, nil
}
func (m *configurableAuthRepo) RevokeAllUserTokens(_ context.Context, userID string) error {
	if m.revokeAllCalled != nil {
		*m.revokeAllCalled = true
	}
	if m.revokeAllForUser != nil {
		*m.revokeAllForUser = userID
	}
	return nil
}
func (m *configurableAuthRepo) DeleteUser(context.Context, string) error { return nil }

func newTestAuthService(repo AuthRepository) *AuthService {
	return NewAuthService(repo, &mockAuthWalletRepo{}, "test-jwt-secret-at-least-32-bytes-long-xx")
}

// ── Refresh-token reuse-detection ──────────────────────────────────────────

func TestRefreshToken_ValidRotation_IssuesNewPair(t *testing.T) {
	revoked := false
	repo := &configurableAuthRepo{
		getRefreshToken: func(context.Context, string) (*model.RefreshToken, error) {
			return &model.RefreshToken{ID: "rt1", UserID: "u1", ExpiresAt: time.Now().Add(time.Hour)}, nil
		},
		revokeRefreshOK: true,
		revokeAllCalled: &revoked,
		userByID:        &model.User{ID: "u1"},
	}
	pair, err := newTestAuthService(repo).RefreshToken(context.Background(), "raw-token")
	if err != nil {
		t.Fatalf("valid rotation should succeed, got %v", err)
	}
	if pair == nil || pair.AccessToken == "" {
		t.Fatal("expected a new token pair")
	}
	if revoked {
		t.Fatal("valid rotation must NOT trigger family revocation")
	}
}

func TestRefreshToken_ReplayBeyondGrace_RevokesEntireFamily(t *testing.T) {
	revoked := false
	var forUser string
	revokedAt := time.Now().Add(-2 * refreshReuseGraceWindow) // well past grace
	repo := &configurableAuthRepo{
		getRefreshToken: func(context.Context, string) (*model.RefreshToken, error) {
			return &model.RefreshToken{
				ID: "rt1", UserID: "victim",
				ExpiresAt: time.Now().Add(time.Hour),
				RevokedAt: &revokedAt,
			}, nil
		},
		revokeAllCalled:  &revoked,
		revokeAllForUser: &forUser,
	}
	_, err := newTestAuthService(repo).RefreshToken(context.Background(), "stolen-token")
	if err == nil {
		t.Fatal("replay of a revoked token must be rejected")
	}
	if !revoked {
		t.Fatal("replay beyond grace window MUST revoke the whole token family (reuse-detection)")
	}
	if forUser != "victim" {
		t.Fatalf("family revocation must target the token owner, got %q", forUser)
	}
}

func TestRefreshToken_ConcurrentReplayWithinGrace_NoForcedLogout(t *testing.T) {
	revoked := false
	revokedAt := time.Now().Add(-1 * time.Second) // inside grace window
	repo := &configurableAuthRepo{
		getRefreshToken: func(context.Context, string) (*model.RefreshToken, error) {
			return &model.RefreshToken{
				ID: "rt1", UserID: "u1",
				ExpiresAt: time.Now().Add(time.Hour),
				RevokedAt: &revokedAt,
			}, nil
		},
		revokeAllCalled: &revoked,
	}
	_, err := newTestAuthService(repo).RefreshToken(context.Background(), "double-fired-token")
	if err == nil {
		t.Fatal("a re-presented just-rotated token must still be rejected")
	}
	if revoked {
		t.Fatal("benign concurrent/retry refresh within grace must NOT force-logout the user")
	}
}

func TestRefreshToken_UnknownToken_NoFamilyRevoke(t *testing.T) {
	revoked := false
	repo := &configurableAuthRepo{
		getRefreshToken: func(context.Context, string) (*model.RefreshToken, error) {
			return nil, nil // unknown / expired
		},
		revokeAllCalled: &revoked,
	}
	_, err := newTestAuthService(repo).RefreshToken(context.Background(), "never-issued")
	if err == nil {
		t.Fatal("unknown token must be rejected")
	}
	if revoked {
		t.Fatal("an unattributable unknown token must NOT revoke anyone's family")
	}
}

// ── JWT access-token validation hardening ──────────────────────────────────

func TestValidateAccessToken_RejectsAlgNone(t *testing.T) {
	svc := newTestAuthService(&configurableAuthRepo{})
	tok := jwt.NewWithClaims(jwt.SigningMethodNone, jwt.MapClaims{
		"sub": "u1", "iss": jwtIssuer, "exp": time.Now().Add(time.Hour).Unix(),
	})
	s, _ := tok.SignedString(jwt.UnsafeAllowNoneSignatureType)
	if _, _, _, err := svc.ValidateAccessToken(s); err == nil {
		t.Fatal("alg=none token must be rejected")
	}
}

func TestValidateAccessToken_RejectsMissingExp(t *testing.T) {
	secret := "test-jwt-secret-at-least-32-bytes-long-xx"
	svc := newTestAuthService(&configurableAuthRepo{})
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": "u1", "iss": jwtIssuer, // no exp
	})
	s, _ := tok.SignedString([]byte(secret))
	if _, _, _, err := svc.ValidateAccessToken(s); err == nil {
		t.Fatal("token without exp must be rejected (WithExpirationRequired)")
	}
}

func TestValidateAccessToken_RejectsWrongIssuer(t *testing.T) {
	secret := "test-jwt-secret-at-least-32-bytes-long-xx"
	svc := newTestAuthService(&configurableAuthRepo{})
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": "u1", "iss": "some-other-service", "exp": time.Now().Add(time.Hour).Unix(),
	})
	s, _ := tok.SignedString([]byte(secret))
	if _, _, _, err := svc.ValidateAccessToken(s); err == nil {
		t.Fatal("token with a foreign issuer must be rejected")
	}
}

func TestValidateAccessToken_RejectsExpired(t *testing.T) {
	secret := "test-jwt-secret-at-least-32-bytes-long-xx"
	svc := newTestAuthService(&configurableAuthRepo{})
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": "u1", "iss": jwtIssuer, "exp": time.Now().Add(-time.Hour).Unix(),
	})
	s, _ := tok.SignedString([]byte(secret))
	if _, _, _, err := svc.ValidateAccessToken(s); err == nil {
		t.Fatal("expired token must be rejected")
	}
}

func TestValidateAccessToken_AcceptsValid(t *testing.T) {
	secret := "test-jwt-secret-at-least-32-bytes-long-xx"
	svc := newTestAuthService(&configurableAuthRepo{})
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": "u1", "is_pro": true, "plan": "pro_plus", "iss": jwtIssuer,
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	s, _ := tok.SignedString([]byte(secret))
	uid, isPro, plan, err := svc.ValidateAccessToken(s)
	if err != nil {
		t.Fatalf("a well-formed token must validate, got %v", err)
	}
	if plan != "pro_plus" {
		t.Fatalf("plan claim not extracted: got %q want pro_plus", plan)
	}
	if uid != "u1" || !isPro {
		t.Fatalf("claims not extracted correctly: uid=%q isPro=%v", uid, isPro)
	}
}
