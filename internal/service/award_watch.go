package service

import (
	"context"
	"fmt"
	"time"

	"maplerewards/internal/model"
)

type AwardWatchRepository interface {
	Create(ctx context.Context, w model.AwardWatch) (*model.AwardWatch, error)
	ListByUser(ctx context.Context, userID string) ([]model.AwardWatch, error)
	Delete(ctx context.Context, userID, watchID string) error
}

type AwardWatchService struct {
	walletRepo WalletRepository
	watchRepo  AwardWatchRepository
}

func NewAwardWatchService(walletRepo WalletRepository, watchRepo AwardWatchRepository) *AwardWatchService {
	return &AwardWatchService{walletRepo: walletRepo, watchRepo: watchRepo}
}

func (s *AwardWatchService) Create(ctx context.Context, sessionID string, req model.CreateAwardWatchRequest) (*model.AwardWatch, error) {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("session not found: %w", err)
	}
	if user == nil {
		return nil, ErrSessionNotFound
	}
	if req.Origin == "" || req.Destination == "" || req.DepartDate == "" {
		return nil, fmt.Errorf("origin, destination, depart_date required")
	}
	if _, err := time.Parse("2006-01-02", req.DepartDate); err != nil {
		return nil, fmt.Errorf("depart_date must be YYYY-MM-DD")
	}
	if req.FlexDays < 0 || req.FlexDays > 14 {
		req.FlexDays = 3
	}
	if req.Cabin == "" {
		req.Cabin = "economy"
	}
	if req.ProgramSlug == "" {
		req.ProgramSlug = "aeroplan"
	}
	w := model.AwardWatch{
		UserID:      user.ID,
		Origin:      req.Origin,
		Destination: req.Destination,
		DepartDate:  req.DepartDate,
		FlexDays:    req.FlexDays,
		Cabin:       req.Cabin,
		MaxPoints:   req.MaxPoints,
		ProgramSlug: req.ProgramSlug,
	}
	return s.watchRepo.Create(ctx, w)
}

func (s *AwardWatchService) List(ctx context.Context, sessionID string) ([]model.AwardWatch, error) {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("session not found: %w", err)
	}
	if user == nil {
		return nil, ErrSessionNotFound
	}
	out, err := s.watchRepo.ListByUser(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	if out == nil {
		out = []model.AwardWatch{}
	}
	return out, nil
}

func (s *AwardWatchService) Delete(ctx context.Context, sessionID, watchID string) error {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return fmt.Errorf("session not found: %w", err)
	}
	if user == nil {
		return ErrSessionNotFound
	}
	return s.watchRepo.Delete(ctx, user.ID, watchID)
}
