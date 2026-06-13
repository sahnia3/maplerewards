package service

import (
	"context"
	"errors"
	"testing"

	"maplerewards/internal/model"
)

// ── Mocks (function fields per repo test rules) ──────────────────────────────

type bonusTestWalletRepo struct {
	getUserBySession func(ctx context.Context, sessionID string) (*model.User, error)
}

func (m *bonusTestWalletRepo) CreateUser(ctx context.Context, sessionID string) (*model.User, error) {
	return nil, nil
}
func (m *bonusTestWalletRepo) GetUserBySession(ctx context.Context, sessionID string) (*model.User, error) {
	return m.getUserBySession(ctx, sessionID)
}
func (m *bonusTestWalletRepo) GetUserCards(ctx context.Context, userID string) ([]model.UserCard, error) {
	return nil, nil
}
func (m *bonusTestWalletRepo) AddCard(ctx context.Context, userID, cardID string) (*model.UserCard, error) {
	return nil, nil
}
func (m *bonusTestWalletRepo) RemoveCard(ctx context.Context, userID, cardID string) error {
	return nil
}
func (m *bonusTestWalletRepo) UpdateBalance(ctx context.Context, userID, cardID string, balance int64) error {
	return nil
}
func (m *bonusTestWalletRepo) UpdateCardDetails(ctx context.Context, userID, cardID string, req model.UpdateCardDetailsRequest) error {
	return nil
}

type bonusTestBonusRepo struct {
	getUserBonuses func(ctx context.Context, userID string) ([]model.WelcomeBonus, error)
	activateBonus  func(ctx context.Context, userID, cardID string) (*model.WelcomeBonus, error)
}

func (m *bonusTestBonusRepo) GetUserBonuses(ctx context.Context, userID string) ([]model.WelcomeBonus, error) {
	return m.getUserBonuses(ctx, userID)
}
func (m *bonusTestBonusRepo) ActivateBonus(ctx context.Context, userID, cardID string) (*model.WelcomeBonus, error) {
	return m.activateBonus(ctx, userID, cardID)
}
func (m *bonusTestBonusRepo) UpdateBonusSpend(ctx context.Context, userID, cardID string, amount float64) error {
	return nil
}

// ── Helpers ──────────────────────────────────────────────────────────────────

func bonusTestService(t *testing.T, existing []model.WelcomeBonus, activated *bool) *BonusService {
	t.Helper()
	walletRepo := &bonusTestWalletRepo{
		getUserBySession: func(ctx context.Context, sessionID string) (*model.User, error) {
			return &model.User{ID: "user-1", SessionID: sessionID}, nil
		},
	}
	bonusRepo := &bonusTestBonusRepo{
		getUserBonuses: func(ctx context.Context, userID string) ([]model.WelcomeBonus, error) {
			return existing, nil
		},
		activateBonus: func(ctx context.Context, userID, cardID string) (*model.WelcomeBonus, error) {
			if activated != nil {
				*activated = true
			}
			return &model.WelcomeBonus{ID: "new", UserID: userID, CardID: cardID, DaysLeft: 90}, nil
		},
	}
	return NewBonusService(walletRepo, bonusRepo)
}

// activeBonus is an in-flight tracker: not completed, deadline not passed.
func activeBonus(cardID string) model.WelcomeBonus {
	return model.WelcomeBonus{CardID: cardID, IsCompleted: false, DaysLeft: 30}
}

// ── Tests ────────────────────────────────────────────────────────────────────

func TestActivateBonus_FreeUserAtCapBlocked(t *testing.T) {
	activated := false
	svc := bonusTestService(t, []model.WelcomeBonus{
		activeBonus("card-a"), activeBonus("card-b"), activeBonus("card-c"),
	}, &activated)

	_, err := svc.ActivateBonus(context.Background(), "sess", "card-new", false)
	if !errors.Is(err, ErrBonusLimitReached) {
		t.Fatalf("expected ErrBonusLimitReached, got %v", err)
	}
	if activated {
		t.Fatal("repo ActivateBonus must not be called when the cap blocks the request")
	}
}

func TestActivateBonus_ProUserUnlimited(t *testing.T) {
	svc := bonusTestService(t, []model.WelcomeBonus{
		activeBonus("card-a"), activeBonus("card-b"), activeBonus("card-c"),
		activeBonus("card-d"), activeBonus("card-e"),
	}, nil)

	bonus, err := svc.ActivateBonus(context.Background(), "sess", "card-new", true)
	if err != nil {
		t.Fatalf("pro user should bypass the cap, got %v", err)
	}
	if bonus == nil || bonus.CardID != "card-new" {
		t.Fatalf("expected activated bonus for card-new, got %+v", bonus)
	}
}

func TestActivateBonus_CompletedAndExpiredDontCount(t *testing.T) {
	svc := bonusTestService(t, []model.WelcomeBonus{
		activeBonus("card-a"),
		{CardID: "card-b", IsCompleted: true, DaysLeft: 0},  // completed
		{CardID: "card-c", IsCompleted: false, DaysLeft: 0}, // expired
	}, nil)

	bonus, err := svc.ActivateBonus(context.Background(), "sess", "card-new", false)
	if err != nil {
		t.Fatalf("only 1 of 3 trackers is active — activation should succeed, got %v", err)
	}
	if bonus == nil || bonus.CardID != "card-new" {
		t.Fatalf("expected activated bonus for card-new, got %+v", bonus)
	}
}

func TestActivateBonus_ReactivateExistingNeverBlocked(t *testing.T) {
	// Grandfathered QA-style account: 5 active trackers on the free tier.
	svc := bonusTestService(t, []model.WelcomeBonus{
		activeBonus("card-a"), activeBonus("card-b"), activeBonus("card-c"),
		activeBonus("card-d"), activeBonus("card-e"),
	}, nil)

	// Re-activating an already-tracked card is idempotent and allowed…
	if _, err := svc.ActivateBonus(context.Background(), "sess", "card-c", false); err != nil {
		t.Fatalf("re-activating an existing tracker must not be blocked, got %v", err)
	}

	// …but a NET-NEW activation beyond the cap is rejected.
	if _, err := svc.ActivateBonus(context.Background(), "sess", "card-new", false); !errors.Is(err, ErrBonusLimitReached) {
		t.Fatalf("expected ErrBonusLimitReached for net-new activation, got %v", err)
	}
}

func TestActivateBonus_SessionNotFound(t *testing.T) {
	walletRepo := &bonusTestWalletRepo{
		getUserBySession: func(ctx context.Context, sessionID string) (*model.User, error) {
			return nil, nil // repo's not-found convention
		},
	}
	svc := NewBonusService(walletRepo, &bonusTestBonusRepo{})

	if _, err := svc.ActivateBonus(context.Background(), "missing", "card-a", false); !errors.Is(err, ErrSessionNotFound) {
		t.Fatalf("expected ErrSessionNotFound, got %v", err)
	}
}
