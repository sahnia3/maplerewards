package service

import (
	"context"
	"fmt"

	"maplerewards/internal/model"
)

type CardValueRepository interface {
	SummaryForUserCards(ctx context.Context, userID string) ([]model.CardValueSummary, error)
}

type CardValueService struct {
	walletRepo WalletRepository
	cardValRepo CardValueRepository
}

func NewCardValueService(walletRepo WalletRepository, cardValRepo CardValueRepository) *CardValueService {
	return &CardValueService{walletRepo: walletRepo, cardValRepo: cardValRepo}
}

func (s *CardValueService) Summary(ctx context.Context, sessionID string) ([]model.CardValueSummary, error) {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("session not found: %w", err)
	}
	out, err := s.cardValRepo.SummaryForUserCards(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	if out == nil {
		out = []model.CardValueSummary{}
	}
	return out, nil
}
