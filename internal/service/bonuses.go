package service

import (
	"context"
	"errors"
	"fmt"

	"maplerewards/internal/model"
)

// ErrBonusLimitReached signals the free tier's active welcome-bonus tracker
// cap. The handler maps it to HTTP 402, mirroring ErrCardLimitReached.
var ErrBonusLimitReached = errors.New("free tier bonus tracker limit reached")

// freeMaxActiveBonuses caps how many ACTIVE (not completed, not expired)
// welcome-bonus trackers a free user may hold. Mirrors the "Up to 3" row in
// frontend/lib/pro-features.ts; Pro/Plus/Lifetime are unlimited.
const freeMaxActiveBonuses = 3

// BonusService owns welcome-bonus tracking business logic (the handler
// previously called the repo directly, so tier limits had no home).
type BonusService struct {
	walletRepo WalletRepository
	bonusRepo  BonusRepository
}

func NewBonusService(walletRepo WalletRepository, bonusRepo BonusRepository) *BonusService {
	return &BonusService{walletRepo: walletRepo, bonusRepo: bonusRepo}
}

// userBySession resolves a session to its user, normalising the repo's
// (nil, nil) not-found convention into ErrSessionNotFound so handlers can
// errors.Is it to a 404.
func (s *BonusService) userBySession(ctx context.Context, sessionID string) (*model.User, error) {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("session lookup: %w", err)
	}
	if user == nil {
		return nil, ErrSessionNotFound
	}
	return user, nil
}

// ListBonuses returns all bonus tracking rows for the session's user.
func (s *BonusService) ListBonuses(ctx context.Context, sessionID string) ([]model.WelcomeBonus, error) {
	user, err := s.userBySession(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	return s.bonusRepo.GetUserBonuses(ctx, user.ID)
}

// ActivateBonus creates (or idempotently re-fetches) the bonus tracking row
// for a card, enforcing the free-tier cap of freeMaxActiveBonuses ACTIVE
// trackers. Completed and expired (deadline passed) trackers do not count.
// Re-activating a card that already has a tracker is never blocked — the repo
// upsert just returns the existing row — so users grandfathered over the cap
// keep everything they have; only NET-NEW activations beyond the cap fail.
func (s *BonusService) ActivateBonus(ctx context.Context, sessionID, cardID string, isPro bool) (*model.WelcomeBonus, error) {
	user, err := s.userBySession(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	if !isPro {
		bonuses, err := s.bonusRepo.GetUserBonuses(ctx, user.ID)
		if err != nil {
			return nil, fmt.Errorf("bonus count: %w", err)
		}
		alreadyTracked := false
		active := 0
		for _, b := range bonuses {
			if b.CardID == cardID {
				alreadyTracked = true
			}
			// GetUserBonuses computes DaysLeft (inclusive, floored at 0) for
			// incomplete rows, so "active" = not completed AND not expired.
			if !b.IsCompleted && b.DaysLeft > 0 {
				active++
			}
		}
		if !alreadyTracked && active >= freeMaxActiveBonuses {
			return nil, ErrBonusLimitReached
		}
	}
	return s.bonusRepo.ActivateBonus(ctx, user.ID, cardID)
}
