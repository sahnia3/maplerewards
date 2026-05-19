package service

import (
	"context"
	"testing"
	"time"

	"maplerewards/internal/model"
)

// Refresh-token reuse-detection (P0-1 / P0-5). The security-critical contract:
//   - replay of a token revoked OUTSIDE the grace window ⇒ revoke the WHOLE
//     family (forced re-login) — this is the theft response.
//   - replay INSIDE the grace window ⇒ reject only (benign SPA/retry double
//     refresh), family must NOT be nuked.
//   - a valid un-revoked token rotates normally.
//   - lost rotation race (claimed=false) and unknown token ⇒ reject, no nuke.
const reuseJWTSecret = "test-secret-at-least-32-chars-long-xx"

func futureTime() time.Time { return time.Now().Add(30 * 24 * time.Hour) }

func TestRefresh_ReuseOutsideGrace_RevokesWholeFamily(t *testing.T) {
	revoked := time.Now().Add(-1 * time.Minute) // well past the 10s grace
	repo := &mockAuthRepo{
		getRefreshFn: func(string) (*model.RefreshToken, error) {
			return &model.RefreshToken{ID: "t1", UserID: "victim", ExpiresAt: futureTime(), RevokedAt: &revoked}, nil
		},
	}
	svc := NewAuthService(repo, &mockAuthWalletRepo{}, reuseJWTSecret)

	pair, err := svc.RefreshToken(context.Background(), "stolen-rotated-token")
	if err == nil || pair != nil {
		t.Fatal("expected reuse of a long-revoked token to be rejected")
	}
	if len(repo.revokeAllCalls) != 1 || repo.revokeAllCalls[0] != "victim" {
		t.Fatalf("theft response failed: RevokeAllUserTokens calls = %v, want [victim]", repo.revokeAllCalls)
	}
}

func TestRefresh_ReuseInsideGrace_RejectsWithoutFamilyRevocation(t *testing.T) {
	revoked := time.Now().Add(-2 * time.Second) // inside the 10s grace
	repo := &mockAuthRepo{
		getRefreshFn: func(string) (*model.RefreshToken, error) {
			return &model.RefreshToken{ID: "t1", UserID: "u1", ExpiresAt: futureTime(), RevokedAt: &revoked}, nil
		},
	}
	svc := NewAuthService(repo, &mockAuthWalletRepo{}, reuseJWTSecret)

	if _, err := svc.RefreshToken(context.Background(), "benign-double-refresh"); err == nil {
		t.Fatal("expected within-grace replay to be rejected")
	}
	if len(repo.revokeAllCalls) != 0 {
		t.Fatalf("benign double-refresh must NOT nuke the family, got calls %v", repo.revokeAllCalls)
	}
}

func TestRefresh_ValidToken_RotatesNoFamilyRevocation(t *testing.T) {
	repo := &mockAuthRepo{
		getRefreshFn: func(string) (*model.RefreshToken, error) {
			return &model.RefreshToken{ID: "t1", UserID: "u1", ExpiresAt: futureTime()}, nil // RevokedAt nil
		},
		revokeRefreshFn: func(string) (bool, error) { return true, nil }, // we claimed the rotation
		getUserByIDFn: func(id string) (*model.User, error) {
			return &model.User{ID: id, SessionID: "s", Plan: "free"}, nil
		},
	}
	svc := NewAuthService(repo, &mockAuthWalletRepo{}, reuseJWTSecret)

	pair, err := svc.RefreshToken(context.Background(), "good-token")
	if err != nil || pair == nil {
		t.Fatalf("valid token should rotate, got pair=%v err=%v", pair, err)
	}
	if pair.AccessToken == "" || pair.RefreshToken == "" {
		t.Fatal("rotation must mint a fresh access+refresh pair")
	}
	if len(repo.revokeAllCalls) != 0 {
		t.Fatalf("a normal rotation must never nuke the family, got %v", repo.revokeAllCalls)
	}
}

func TestRefresh_LostRotationRace_RejectsNoFamilyRevocation(t *testing.T) {
	repo := &mockAuthRepo{
		getRefreshFn: func(string) (*model.RefreshToken, error) {
			return &model.RefreshToken{ID: "t1", UserID: "u1", ExpiresAt: futureTime()}, nil
		},
		revokeRefreshFn: func(string) (bool, error) { return false, nil }, // a concurrent refresh won
	}
	svc := NewAuthService(repo, &mockAuthWalletRepo{}, reuseJWTSecret)

	if _, err := svc.RefreshToken(context.Background(), "lost-race"); err == nil {
		t.Fatal("losing the rotation race must reject (no second pair)")
	}
	if len(repo.revokeAllCalls) != 0 {
		t.Fatalf("a benign lost race must NOT nuke the family, got %v", repo.revokeAllCalls)
	}
}

func TestRefresh_UnknownToken_RejectsNoFamilyRevocation(t *testing.T) {
	repo := &mockAuthRepo{
		getRefreshFn: func(string) (*model.RefreshToken, error) { return nil, nil }, // not found/expired
	}
	svc := NewAuthService(repo, &mockAuthWalletRepo{}, reuseJWTSecret)

	if _, err := svc.RefreshToken(context.Background(), "never-existed"); err == nil {
		t.Fatal("unknown token must be rejected")
	}
	if len(repo.revokeAllCalls) != 0 {
		t.Fatalf("unattributable token must NOT nuke any family, got %v", repo.revokeAllCalls)
	}
}

func TestRefresh_EmptyToken_Rejected(t *testing.T) {
	svc := NewAuthService(&mockAuthRepo{}, &mockAuthWalletRepo{}, reuseJWTSecret)
	if _, err := svc.RefreshToken(context.Background(), ""); err == nil {
		t.Fatal("empty refresh token must be rejected")
	}
}
