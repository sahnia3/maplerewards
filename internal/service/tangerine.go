package service

import (
	"context"

	"maplerewards/internal/model"
)

type TangerineRepository interface {
	ListCategories(ctx context.Context) ([]model.TangerineCategory, error)
}

type TangerineService struct {
	repo TangerineRepository
}

func NewTangerineService(r TangerineRepository) *TangerineService { return &TangerineService{repo: r} }

func (s *TangerineService) List(ctx context.Context) ([]model.TangerineCategory, error) {
	out, err := s.repo.ListCategories(ctx)
	if out == nil {
		out = []model.TangerineCategory{}
	}
	return out, err
}
