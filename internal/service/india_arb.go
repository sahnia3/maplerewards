package service

import (
	"context"
	"fmt"

	"maplerewards/internal/model"
)

type IndiaArbRepository interface {
	ListWithUserBalances(ctx context.Context, userID string) ([]model.IndiaArbitrageProperty, error)
}

type IndiaArbService struct {
	walletRepo WalletRepository
	arbRepo    IndiaArbRepository
}

func NewIndiaArbService(walletRepo WalletRepository, arbRepo IndiaArbRepository) *IndiaArbService {
	return &IndiaArbService{walletRepo: walletRepo, arbRepo: arbRepo}
}

func (s *IndiaArbService) List(ctx context.Context, sessionID string) ([]model.IndiaArbitrageProperty, error) {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("session not found: %w", err)
	}
	out, err := s.arbRepo.ListWithUserBalances(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	if out == nil {
		out = []model.IndiaArbitrageProperty{}
	}
	return out, nil
}
