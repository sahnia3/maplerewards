package service

import (
	"context"
	"fmt"
	"strings"

	"maplerewards/internal/model"
)

// CreditRepository abstracts the data layer (interface for DI/testing).
type CreditRepository interface {
	ListUserCardCredits(ctx context.Context, userID string) ([]model.CardCreditStatus, error)
	UpsertRedemption(ctx context.Context, userID, creditDefID string, amount float64, note string) (*model.CardCreditStatus, error)
	CreateUserCredit(ctx context.Context, userID, cardID, name, description string, valueCAD float64, recurrence string) error
}

// validCreditRecurrence mirrors the card_credit_defs.recurrence domain.
var validCreditRecurrence = map[string]bool{
	"annual": true, "biennial": true, "quadrennial": true, "once": true,
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
	// GetUserBySession returns (nil,nil) for an unknown session. Guard the
	// nil-deref (consistent with RecordRedemption/AddUserCredit) — today the
	// route is shielded by RequireSessionOwner, but don't depend on that.
	if user == nil {
		return nil, fmt.Errorf("session not found")
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
	if user == nil {
		return nil, fmt.Errorf("session not found")
	}
	return s.creditRepo.UpsertRedemption(ctx, user.ID, creditDefID, req.RedeemedAmount, req.Note)
}

// AddUserCredit self-logs a private credit on a held card (P2.6 self-log).
func (s *CreditsService) AddUserCredit(ctx context.Context, sessionID string, req model.CreateCreditRequest) error {
	name := strings.TrimSpace(req.Name)
	if req.CardID == "" || name == "" {
		return fmt.Errorf("card_id and name are required")
	}
	if req.ValueCAD <= 0 {
		return fmt.Errorf("value_cad must be > 0")
	}
	rec := req.Recurrence
	if rec == "" {
		rec = "annual"
	}
	if !validCreditRecurrence[rec] {
		return fmt.Errorf("recurrence must be one of annual|biennial|quadrennial|once")
	}
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return fmt.Errorf("session not found: %w", err)
	}
	if user == nil {
		return fmt.Errorf("session not found")
	}
	return s.creditRepo.CreateUserCredit(ctx, user.ID, req.CardID, name, strings.TrimSpace(req.Description), req.ValueCAD, rec)
}
