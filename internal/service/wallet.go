package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"

	"maplerewards/internal/cache"
	"maplerewards/internal/model"
	"maplerewards/internal/repo"
)

type WalletService struct {
	walletRepo *repo.WalletRepo
	cardRepo   *repo.CardRepo
	cache      *cache.Cache
}

func NewWalletService(walletRepo *repo.WalletRepo, cardRepo *repo.CardRepo, c *cache.Cache) *WalletService {
	return &WalletService{walletRepo: walletRepo, cardRepo: cardRepo, cache: c}
}

// CreateWallet generates an anonymous session and persists it.
func (s *WalletService) CreateWallet(ctx context.Context) (*model.User, error) {
	sessionID, err := generateSessionID()
	if err != nil {
		return nil, err
	}
	return s.walletRepo.CreateUser(ctx, sessionID)
}

// GetWallet returns the user's cards, using Redis as a read-through cache.
func (s *WalletService) GetWallet(ctx context.Context, sessionID string) ([]model.UserCard, error) {
	var cached []model.UserCard
	if err := s.cache.GetWallet(ctx, sessionID, &cached); err == nil {
		return cached, nil
	}

	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	cards, err := s.walletRepo.GetUserCards(ctx, user.ID)
	if err != nil {
		return nil, err
	}

	go s.cache.SetWallet(context.Background(), sessionID, cards) //nolint:errcheck
	return cards, nil
}

func (s *WalletService) AddCard(ctx context.Context, sessionID, cardID string) error {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return err
	}
	if _, err := s.walletRepo.AddCard(ctx, user.ID, cardID); err != nil {
		return err
	}
	go s.cache.InvalidateWallet(context.Background(), sessionID) //nolint:errcheck
	return nil
}

func (s *WalletService) RemoveCard(ctx context.Context, sessionID, cardID string) error {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return err
	}
	if err := s.walletRepo.RemoveCard(ctx, user.ID, cardID); err != nil {
		return err
	}
	go s.cache.InvalidateWallet(context.Background(), sessionID) //nolint:errcheck
	return nil
}

func (s *WalletService) UpdateBalance(ctx context.Context, sessionID, cardID string, balance int64) error {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return err
	}
	if err := s.walletRepo.UpdateBalance(ctx, user.ID, cardID, balance); err != nil {
		return err
	}
	go s.cache.InvalidateWallet(context.Background(), sessionID) //nolint:errcheck
	return nil
}

func generateSessionID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
