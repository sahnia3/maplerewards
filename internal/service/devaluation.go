package service

import (
	"context"
	"fmt"

	"maplerewards/internal/model"
)

type DevaluationRepository interface {
	ListUpcoming(ctx context.Context, userPrograms map[string]bool) ([]model.DevaluationEvent, error)
}

type DevaluationService struct {
	walletRepo WalletRepository
	devRepo    DevaluationRepository
}

func NewDevaluationService(walletRepo WalletRepository, devRepo DevaluationRepository) *DevaluationService {
	return &DevaluationService{walletRepo: walletRepo, devRepo: devRepo}
}

// ListAlerts returns events with `user_holds_balance` flagged when applicable.
// If sessionID is empty, returns all events without user-context filtering.
func (s *DevaluationService) ListAlerts(ctx context.Context, sessionID string) ([]model.DevaluationEvent, error) {
	var userPrograms map[string]bool
	if sessionID != "" {
		user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
		if err == nil && user != nil {
			userPrograms = map[string]bool{}
			cards, err := s.walletRepo.GetUserCards(ctx, user.ID)
			if err == nil {
				for _, c := range cards {
					if c.Card != nil && c.Card.LoyaltyProgram != nil {
						userPrograms[c.Card.LoyaltyProgram.Slug] = true
					}
				}
			}
		} else if err != nil {
			return nil, fmt.Errorf("session lookup: %w", err)
		}
	}
	out, err := s.devRepo.ListUpcoming(ctx, userPrograms)
	if err != nil {
		return nil, err
	}
	if out == nil {
		out = []model.DevaluationEvent{}
	}
	return out, nil
}
