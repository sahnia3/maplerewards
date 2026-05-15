package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"maplerewards/internal/model"
	"maplerewards/internal/repo"
)

// CardOfferService backs the manual Amex/RBC/Scene+ offer tracker. Until the
// issuers expose APIs for auto-activation we model the user-facing portion
// only: log the offer once, Maple flags expiry, mark it used after redemption.
type CardOfferService struct {
	walletRepo WalletRepository
	offerRepo  *repo.CardOfferRepo
}

func NewCardOfferService(walletRepo WalletRepository, offerRepo *repo.CardOfferRepo) *CardOfferService {
	return &CardOfferService{walletRepo: walletRepo, offerRepo: offerRepo}
}

var validOfferSources = map[string]bool{
	"amex_offers": true,
	"rbc_offers":  true,
	"scene_plus":  true,
	"other":       true,
}

func (s *CardOfferService) Create(ctx context.Context, sessionID string, req model.CreateCardOfferRequest) (*model.CardOffer, error) {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil || user == nil {
		return nil, fmt.Errorf("session not found")
	}
	if req.CardID == "" {
		return nil, fmt.Errorf("card_id required")
	}
	// IDOR fix: verify card_id is in caller's wallet. Same vulnerability class
	// as the CSV import — without this an attacker could brute-force card UUIDs
	// and create offer rows pointing at cards they don't own.
	cards, err := s.walletRepo.GetUserCards(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to load wallet")
	}
	owned := false
	for _, c := range cards {
		if c.CardID == req.CardID {
			owned = true
			break
		}
	}
	if !owned {
		return nil, ErrCardNotInWallet
	}
	if strings.TrimSpace(req.Merchant) == "" {
		return nil, fmt.Errorf("merchant required")
	}
	if req.Source == "" {
		req.Source = "other"
	}
	if !validOfferSources[req.Source] {
		return nil, fmt.Errorf("source must be one of: amex_offers, rbc_offers, scene_plus, other")
	}
	if req.ExpiresAt != nil && *req.ExpiresAt != "" {
		if _, err := time.Parse("2006-01-02", *req.ExpiresAt); err != nil {
			return nil, fmt.Errorf("expires_at must be YYYY-MM-DD")
		}
	}
	if req.ActivatedAt != nil && *req.ActivatedAt != "" {
		if _, err := time.Parse("2006-01-02", *req.ActivatedAt); err != nil {
			return nil, fmt.Errorf("activated_at must be YYYY-MM-DD")
		}
	}
	return s.offerRepo.Create(ctx, user.ID, req)
}

func (s *CardOfferService) List(ctx context.Context, sessionID string, activeOnly bool) ([]model.CardOffer, error) {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil || user == nil {
		return nil, fmt.Errorf("session not found")
	}
	out, err := s.offerRepo.ListByUser(ctx, user.ID, activeOnly)
	if err != nil {
		return nil, err
	}
	if out == nil {
		out = []model.CardOffer{}
	}
	return out, nil
}

func (s *CardOfferService) MarkUsed(ctx context.Context, sessionID, offerID string) error {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil || user == nil {
		return fmt.Errorf("session not found")
	}
	return s.offerRepo.MarkUsed(ctx, user.ID, offerID)
}

func (s *CardOfferService) Delete(ctx context.Context, sessionID, offerID string) error {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil || user == nil {
		return fmt.Errorf("session not found")
	}
	return s.offerRepo.Delete(ctx, user.ID, offerID)
}
