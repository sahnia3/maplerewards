package service

import (
	"context"
	"errors"
	"testing"

	"maplerewards/internal/model"
)

// ── Mocks (interface-with-function-fields per .claude/rules/go-tests.md) ──────

// mockTripWallet satisfies WalletRepository. getUserBySession is the only method
// exercised by the EvaluateTrip session-resolution path; the rest are stubs so
// the mock still satisfies the interface.
type mockTripWallet struct {
	getUserBySession func(ctx context.Context, sessionID string) (*model.User, error)
	getUserCards     func(ctx context.Context, userID string) ([]model.UserCard, error)
}

func (m *mockTripWallet) CreateUser(_ context.Context, _ string) (*model.User, error) {
	return nil, nil
}
func (m *mockTripWallet) GetUserBySession(ctx context.Context, sessionID string) (*model.User, error) {
	return m.getUserBySession(ctx, sessionID)
}
func (m *mockTripWallet) GetUserCards(ctx context.Context, userID string) ([]model.UserCard, error) {
	if m.getUserCards != nil {
		return m.getUserCards(ctx, userID)
	}
	return nil, nil
}
func (m *mockTripWallet) AddCard(_ context.Context, _, _ string) (*model.UserCard, error) {
	return nil, nil
}
func (m *mockTripWallet) RemoveCard(_ context.Context, _, _ string) error             { return nil }
func (m *mockTripWallet) UpdateBalance(_ context.Context, _, _ string, _ int64) error { return nil }
func (m *mockTripWallet) UpdateCardDetails(_ context.Context, _, _ string, _ model.UpdateCardDetailsRequest) error {
	return nil
}

// EvaluateTrip with an unknown/deleted session: GetUserBySession returns
// (nil, nil) (pgx "no row matches"). The service must return ErrSessionNotFound
// instead of panicking on a nil user.ID dereference. Guards the regression for
// bug #12 — the missing nil check that ~12 sibling services already have.
func TestEvaluateTrip_UnknownSession_ReturnsErrSessionNotFound(t *testing.T) {
	wallet := &mockTripWallet{
		getUserBySession: func(_ context.Context, _ string) (*model.User, error) {
			// Soft-deleted / typo'd session: no row, no error.
			return nil, nil
		},
		getUserCards: func(_ context.Context, _ string) ([]model.UserCard, error) {
			t.Fatal("GetUserCards must not be reached when the session is unknown")
			return nil, nil
		},
	}

	svc := NewTripService(wallet, nil, nil, nil, nil, nil, nil, nil)

	opts, err := svc.EvaluateTrip(context.Background(), model.TripRequest{
		SessionID:   "does-not-exist",
		TripType:    "flight",
		Origin:      "YYZ",
		Destination: "LHR",
		Date:        "2026-09-01",
		Passengers:  1,
	})

	if opts != nil {
		t.Errorf("expected nil options, got %v", opts)
	}
	if !errors.Is(err, ErrSessionNotFound) {
		t.Fatalf("expected ErrSessionNotFound, got %v", err)
	}
}

// Positive control: a valid session with no cards must not panic and must
// resolve to an empty (non-error) result, confirming the nil guard only fires
// on the (nil, nil) case and not on a real user.
func TestEvaluateTrip_ValidSessionNoCards_NoPanic(t *testing.T) {
	wallet := &mockTripWallet{
		getUserBySession: func(_ context.Context, _ string) (*model.User, error) {
			return &model.User{ID: "user-123", SessionID: "valid"}, nil
		},
		getUserCards: func(_ context.Context, _ string) ([]model.UserCard, error) {
			return []model.UserCard{}, nil
		},
	}

	svc := NewTripService(wallet, nil, nil, nil, nil, nil, nil, nil)

	opts, err := svc.EvaluateTrip(context.Background(), model.TripRequest{
		SessionID:   "valid",
		TripType:    "flight",
		Origin:      "YYZ",
		Destination: "LHR",
		Date:        "2026-09-01",
		Passengers:  1,
	})
	if err != nil {
		t.Fatalf("unexpected error for valid session: %v", err)
	}
	if len(opts) != 0 {
		t.Fatalf("expected no options for an empty wallet (kb=nil), got %d", len(opts))
	}
}
