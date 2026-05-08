package service

import (
	"context"
	"fmt"

	"maplerewards/internal/model"
)

// CreditRepository abstracts the data layer (interface for DI/testing).
type CreditRepository interface {
	ListUserCardCredits(ctx context.Context, userID string) ([]model.CardCreditStatus, error)
	UpsertRedemption(ctx context.Context, userID, creditDefID string, amount float64, note string) (*model.CardCreditStatus, error)
}

// CreditsService surfaces per-card credits + annual-fee countdowns and lets
// users record what they've already redeemed against each credit.
type CreditsService struct {
	walletRepo WalletRepository
	creditRepo CreditRepository
}

func NewCreditsService(walletRepo WalletRepository, creditRepo CreditRepository) *CreditsService {
	return &CreditsService{walletRepo: walletRepo, creditRepo: creditRepo}
}

// ListCredits returns all credits attached to the user's wallet cards.
func (s *CreditsService) ListCredits(ctx context.Context, sessionID string) ([]model.CardCreditStatus, error) {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("session not found: %w", err)
	}
	out, err := s.creditRepo.ListUserCardCredits(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	if out == nil {
		out = []model.CardCreditStatus{}
	}
	return out, nil
}

// RecordRedemption stores how much the user has redeemed on one credit this year.
func (s *CreditsService) RecordRedemption(ctx context.Context, sessionID, creditDefID string, req model.CreditRedemptionRequest) (*model.CardCreditStatus, error) {
	if creditDefID == "" {
		return nil, fmt.Errorf("credit_def_id required")
	}
	if req.RedeemedAmount < 0 {
		return nil, fmt.Errorf("redeemed_amount must be ≥ 0")
	}
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("session not found: %w", err)
	}
	return s.creditRepo.UpsertRedemption(ctx, user.ID, creditDefID, req.RedeemedAmount, req.Note)
}
